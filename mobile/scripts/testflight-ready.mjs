import { createPrivateKey, sign } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = '6816711108';
const GROUP = 'Тест Karpservice';

export async function assignInternalBuild(api, number, { wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 30 } = {}) {
  if (!/^[1-9]\d{0,3}\.[1-9]\d?\.0$/.test(number || '')) throw new Error('Invalid TestFlight build number');
  const app = (await api(`/v1/apps/${APP}`)).data;
  if (app?.attributes?.bundleId !== 'ua.karpservice.client') throw new Error('Unexpected App Store application');
  const groups = (await api(`/v1/apps/${APP}/betaGroups`)).data || [];
  const candidates = groups.filter(g => g.attributes?.name === GROUP && g.attributes?.isInternalGroup === true);
  if (candidates.length !== 1) throw new Error('The existing internal Karpservice test group could not be uniquely verified');
  const group = candidates[0];
  let build;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const builds = (await api(`/v1/builds?filter[app]=${APP}&filter[version]=${number}&limit=10`)).data || [];
    if (builds.length > 1) throw new Error('More than one matching build; no testing access changed');
    build = builds[0];
    if (build && (build.attributes?.version !== number || build.attributes?.expired)) throw new Error('Build identity or expiry check failed');
    if (['FAILED', 'INVALID'].includes(build?.attributes?.processingState)) throw new Error('Apple rejected processing of the uploaded build');
    if (build?.attributes?.processingState === 'VALID') break;
    if (attempt + 1 < attempts) await wait(30000);
  }
  if (build?.attributes?.processingState !== 'VALID') throw new Error('Build upload succeeded, but Apple processing is still pending; retry TestFlight assignment later');
  const memberships = (await api(`/v1/builds/${build.id}?include=betaGroups`)).data?.relationships?.betaGroups?.data || [];
  if (!memberships.some(g => g.id === group.id)) {
    await api(`/v1/betaGroups/${group.id}/relationships/builds`, { data: [{ type: 'builds', id: build.id }] });
  }
  const verified = (await api(`/v1/builds/${build.id}?include=betaGroups`)).data?.relationships?.betaGroups?.data || [];
  if (!verified.some(g => g.id === group.id)) throw new Error('Apple did not confirm the internal TestFlight assignment');
  return { buildId: build.id, number, group: GROUP };
}

async function main() {
  const env = process.env;
  if (!/^[A-Z0-9]{10}$/.test(env.ASC_KEY_ID || '') || !/^[a-f0-9-]{36}$/i.test(env.ASC_ISSUER_ID || '') || !env.ASC_PRIVATE_KEY) throw new Error('App Store API credentials are missing');
  let key;
  try { key = createPrivateKey(env.ASC_PRIVATE_KEY); } catch { throw new Error('Invalid App Store API private key; contents withheld'); }
  const api = async (resource, body) => {
    const now = Math.floor(Date.now() / 1000);
    const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const data = `${b64({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' })}.${b64({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
    const token = `${data}.${sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    let response;
    try {
      response = await fetch(`https://api.appstoreconnect.apple.com${resource}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch { throw new Error('App Store Connect request failed; credentials withheld'); }
    if (!response.ok) { const problem = await response.json().catch(()=>({})); throw new Error(JSON.stringify({resource,status:response.status,errors:problem.errors?.map(e=>({code:e.code,title:e.title,detail:e.detail}))})); }
    return response.status === 204 ? {} : response.json().catch(() => { throw new Error('App Store Connect returned invalid JSON; response withheld'); });
  };
  const result = await assignInternalBuild(api, env.IOS_BUILD_NUMBER);
  console.log(JSON.stringify({ testflight: 'ready', ...result }));
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `\nTestFlight processing complete. Build ${result.number} (${result.buildId}) is assigned to the existing internal group ${result.group}.\nApp Review submission is a separate step.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
