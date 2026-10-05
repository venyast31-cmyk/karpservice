// Signing secrets never enter the checkout, logs, or workflow artifacts.
import { createPrivateKey, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, copyFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const TEAM = 'L6W4586456';
export const BUNDLE = 'ua.karpservice.client';

export function verifyProfile(profile, now = new Date()) {
  if (!/^[A-Fa-f0-9-]{36}$/.test(profile.UUID ?? '')) throw new Error('Invalid provisioning profile UUID');
  if (profile.TeamIdentifier?.length !== 1 || profile.TeamIdentifier[0] !== TEAM) throw new Error('Provisioning profile belongs to a different Apple team');
  if (profile.Entitlements?.['application-identifier'] !== `${TEAM}.${BUNDLE}`) throw new Error('Provisioning profile belongs to a different app');
  if (profile.Entitlements?.['com.apple.developer.team-identifier'] !== TEAM) throw new Error('Incorrect team entitlement');
  if (!profile.Entitlements?.['com.apple.developer.applesignin']?.includes('Default')) throw new Error('Regenerate the App Store profile after enabling Sign in with Apple for Karpservice');
  if (profile.ProvisionedDevices || profile.ProvisionsAllDevices || profile.Entitlements?.['get-task-allow']) throw new Error('An App Store distribution profile is required');
  if (!(new Date(profile.ExpirationDate) > now)) throw new Error('Provisioning profile has expired');
  if (!profile.certificateSHA1?.length || profile.certificateSHA1.some(v => !/^[A-F0-9]{40}$/.test(v))) throw new Error('Profile has no usable signing certificate');
  return profile;
}

export function buildNumber(run, attempt) {
  if (!/^[1-9]\d{0,3}$/.test(run ?? '') || !/^[1-9]\d?$/.test(attempt ?? '')) throw new Error('Invalid or exhausted CI build number');
  return `${run}.${attempt}.0`;
}

function command(program, args, input) {
  try {
    return execFileSync(program, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    // execFile errors include argv. Never print them: argv may contain passwords.
    const operation = path.basename(program) === 'security' ? `security ${args[0]}` : path.basename(program);
    const hints = [
      [/MAC verification failed/i, 'PKCS12 password or encryption format was rejected'],
      [/Unknown format in import/i, 'unsupported certificate import format'],
      [/User interaction is not allowed/i, 'the temporary signing keychain is locked'],
    ];
    const hint = hints.find(([pattern]) => pattern.test(String(error.stderr ?? '')))?.[1];
    throw new Error(`${operation} failed (exit ${error.status ?? 'unknown'}); ${hint ?? 'check signing credentials'}`);
  }
}

function privateFile(file, contents) {
  writeFileSync(file, contents, { mode: 0o600 });
}

function prepare(directory, stateFile) {
  const names = ['IOS_DISTRIBUTION_P12_BASE64', 'IOS_DISTRIBUTION_P12_PASSWORD', 'IOS_PROVISION_PROFILE_BASE64', 'ASC_PRIVATE_KEY', 'ASC_KEY_ID', 'ASC_ISSUER_ID'];
  const missing = names.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Configure GitHub Actions secrets first: ${missing.join(', ')}`);
  if (!/^[A-Z0-9]{10}$/.test(process.env.ASC_KEY_ID) || !/^[a-f0-9-]{36}$/i.test(process.env.ASC_ISSUER_ID)) throw new Error('Invalid App Store Connect key identifiers');
  let authKey;
  try { authKey = createPrivateKey(process.env.ASC_PRIVATE_KEY); } catch { throw new Error('ASC_PRIVATE_KEY must contain the original .p8 PEM key'); }
  if (authKey.asymmetricKeyType !== 'ec' || authKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('Expected an App Store Connect P-256 API key');
  const number = buildNumber(process.env.GITHUB_RUN_NUMBER, process.env.GITHUB_RUN_ATTEMPT);
  if (!process.env.GITHUB_ENV) throw new Error('This script requires GitHub Actions');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const certificate = path.join(directory, 'Distribution.p12');
  const profileFile = path.join(directory, 'AppStore.mobileprovision');
  privateFile(certificate, Buffer.from(process.env.IOS_DISTRIBUTION_P12_BASE64, 'base64'));
  privateFile(profileFile, Buffer.from(process.env.IOS_PROVISION_PROFILE_BASE64, 'base64'));
  privateFile(path.join(directory, 'AuthKey.p8'), process.env.ASC_PRIVATE_KEY);

  const profileXML = command('security', ['cms', '-D', '-i', profileFile]);
  const profile = verifyProfile(JSON.parse(command('python3', ['-c', `
import datetime, hashlib, json, plistlib, sys
p = plistlib.loads(sys.stdin.buffer.read())
p['certificateSHA1'] = [hashlib.sha1(c).hexdigest().upper() for c in p.pop('DeveloperCertificates', [])]
def serialize(value):
    if isinstance(value, datetime.datetime):
        return value.replace(tzinfo=datetime.timezone.utc).isoformat()
    if isinstance(value, bytes):
        return None
    raise TypeError('Unexpected profile value')
print(json.dumps(p, default=serialize))
`], profileXML)));

  const keychain = path.join(directory, 'build.keychain-db');
  const password = randomBytes(32).toString('hex');
  const originalKeychains = command('security', ['list-keychains', '-d', 'user']).split('\n').map(v => v.trim()).filter(Boolean).map(v => v.replace(/^"|"$/g, ''));
  const state = { originalKeychains, profiles: [] };
  const saveState = () => privateFile(stateFile, JSON.stringify(state));
  saveState();
  command('security', ['create-keychain', '-p', password, keychain]);
  command('security', ['set-keychain-settings', '-lut', '21600', keychain]);
  command('security', ['unlock-keychain', '-p', password, keychain]);
  command('security', ['import', certificate, '-P', process.env.IOS_DISTRIBUTION_P12_PASSWORD, '-k', keychain, '-T', '/usr/bin/codesign', '-T', '/usr/bin/security']);
  command('security', ['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, keychain]);
  command('security', ['list-keychains', '-d', 'user', '-s', keychain, ...originalKeychains]);
  const identities = [...command('security', ['find-identity', '-v', '-p', 'codesigning', keychain]).matchAll(/\b([A-F0-9]{40})\b/g)].map(m => m[1]);
  const identity = identities.find(v => profile.certificateSHA1.includes(v));
  if (!identity) throw new Error('The .p12 must include the private key for a valid certificate in this profile');

  for (const subdirectory of ['Library/MobileDevice/Provisioning Profiles', 'Library/Developer/Xcode/UserData/Provisioning Profiles']) {
    const destination = path.join(homedir(), subdirectory, `karp-ci-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}-${profile.UUID}.mobileprovision`);
    if (existsSync(destination)) throw new Error('A provisioning file for this run already exists');
    mkdirSync(path.dirname(destination), { recursive: true });
    state.profiles.push(destination);
    saveState();
    copyFileSync(profileFile, destination);
  }
  const exportOptions = { method: 'app-store-connect', destination: 'upload', signingStyle: 'manual', teamID: TEAM, signingCertificate: identity, provisioningProfiles: { [BUNDLE]: profile.UUID }, uploadSymbols: true, manageAppVersionAndBuildNumber: false };
  const exportXML = command('python3', ['-c', 'import json,plistlib,sys; sys.stdout.buffer.write(plistlib.dumps(json.load(sys.stdin)))'], JSON.stringify(exportOptions));
  privateFile(path.join(directory, 'ExportOptions.plist'), exportXML);
  appendFileSync(process.env.GITHUB_ENV, `IOS_SIGNING_SHA1=${identity}\nIOS_PROFILE_UUID=${profile.UUID}\nIOS_BUILD_NUMBER=${number}\n`);
  console.log('Signing inputs verified: correct Apple team, app, certificate and App Store profile.');
}

function cleanup(directory, stateFile) {
  let failed = false;
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null;
  if (state) {
    try { command('security', ['list-keychains', '-d', 'user', '-s', ...state.originalKeychains]); } catch { failed = true; }
    for (const file of state.profiles) rmSync(file, { force: true });
  }
  const keychain = path.join(directory, 'build.keychain-db');
  if (existsSync(keychain)) {
    try { command('security', ['delete-keychain', keychain]); } catch { failed = true; }
  }
  rmSync(directory, { recursive: true, force: true });
  if (failed) throw new Error('Local keychain cleanup was incomplete; the hosted runner will be discarded');
  console.log('Temporary signing files removed. Apple certificates and profiles were not revoked.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (!process.env.RUNNER_TEMP) throw new Error('RUNNER_TEMP is required');
    const directory = path.join(process.env.RUNNER_TEMP, 'karp-signing');
    const stateFile = path.join(directory, 'state.json');
    if (process.argv[2] === 'prepare') prepare(directory, stateFile);
    else if (process.argv[2] === 'cleanup') cleanup(directory, stateFile);
    else throw new Error('Use prepare or cleanup');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
