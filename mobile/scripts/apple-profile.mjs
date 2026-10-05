import { createHash, createPrivateKey, sign } from 'node:crypto';

const ORIGIN = 'https://api.appstoreconnect.apple.com';
const BUNDLE = 'ua.karpservice.client';
const BUNDLE_RESOURCE = 'Z2JHAYZ2H3';

// Reuse the existing distribution certificate. Never create/revoke a certificate
// or enable capabilities here; the account owner configures Apple sign-in first.
export async function appleProfile({ env, original, decode, verify, request = fetch }) {
  const time = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' })}.${encode({ iss: env.ASC_ISSUER_ID, iat: time, exp: time + 600, aud: 'appstoreconnect-v1' })}`;
  const signature = sign('sha256', Buffer.from(data), { key: createPrivateKey(env.ASC_PRIVATE_KEY), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const api = async (path, body) => {
    const response = await request(ORIGIN + path, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${data}.${signature}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    // Do not print API response bodies, profile bytes, keys, or request headers.
    if (!response.ok) throw new Error(`App Store profile API failed (${response.status}); check the API key's Certificates, Identifiers & Profiles access`);
    return response.json();
  };
  const bundle = (await api(`/v1/bundleIds/${BUNDLE_RESOURCE}`)).data;
  if (bundle?.attributes?.identifier !== BUNDLE) throw new Error('Apple bundle identifier does not match Karpservice');
  const capabilities = (await api(`/v1/bundleIds/${BUNDLE_RESOURCE}/bundleIdCapabilities?limit=200`)).data;
  if (!capabilities?.some(c => c.attributes?.capabilityType === 'APPLE_ID_AUTH')) throw new Error('Enable Sign in with Apple for Karpservice in Apple Developer first');

  const profiles = (await api(`/v1/bundleIds/${BUNDLE_RESOURCE}/profiles?limit=200`)).data || [];
  for (const candidate of profiles) {
    if (candidate.attributes?.profileType !== 'IOS_APP_STORE' || candidate.attributes?.profileState !== 'ACTIVE' || !candidate.attributes?.profileContent) continue;
    const bytes = Buffer.from(candidate.attributes.profileContent, 'base64');
    try {
      const profile = verify(decode(bytes));
      if (profile.certificateSHA1.some(value => original.certificateSHA1.includes(value))) return bytes;
    } catch { /* An old, expired, or unrelated profile is not usable. */ }
  }

  const certificates = (await api('/v1/certificates?limit=200')).data || [];
  const certificate = certificates.find(c => ['DISTRIBUTION', 'IOS_DISTRIBUTION'].includes(c.attributes?.certificateType)
    && new Date(c.attributes.expirationDate) > new Date()
    && original.certificateSHA1.includes(createHash('sha1').update(Buffer.from(c.attributes.certificateContent || '', 'base64')).digest('hex').toUpperCase()));
  if (!certificate) throw new Error('Existing Karpservice distribution certificate was not found; no new certificate was created');
  const created = (await api('/v1/profiles', { data: {
    type: 'profiles',
    attributes: { name: `Karpservice Apple Sign In ${time}`, profileType: 'IOS_APP_STORE' },
    relationships: { bundleId: { data: { type: 'bundleIds', id: BUNDLE_RESOURCE } }, certificates: { data: [{ type: 'certificates', id: certificate.id }] } }
  } })).data;
  const bytes = Buffer.from(created?.attributes?.profileContent || '', 'base64');
  const profile = verify(decode(bytes));
  if (!profile.certificateSHA1.some(value => original.certificateSHA1.includes(value))) throw new Error('Regenerated profile has an unexpected certificate');
  return bytes;
}
