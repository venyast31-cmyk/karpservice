import { createPrivateKey } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Only this app's two Apple bindings are written. Existing Worker secrets stay intact.
// Send secrets directly to Cloudflare over TLS, never argv, files, logs or artifacts.
export async function syncAppleSecrets(env = process.env, request = fetch) {
  if (env.CLOUDFLARE_ACCOUNT_ID !== '0feb0b23b311ee71074cc7a19d30ae2c' || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Cloudflare account or credentials are not configured for Karpservice.');
  }
  const keyId = env.APPLE_SIGN_IN_KEY_ID;
  const pem = String(env.APPLE_SIGN_IN_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!/^[A-Z0-9]{10}$/.test(keyId || '') || !pem.startsWith('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('Add the dedicated APPLE_SIGN_IN_PRIVATE_KEY repository secret before releasing.');
  }
  let key;
  try { key = createPrivateKey(pem); } catch {
    throw new Error('The Apple private key is not a valid PEM private key.');
  }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('Sign in with Apple requires its dedicated P-256 private key.');
  }
  let response;
  try {
    response = await request(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/karpservice-api/secrets-bulk`, {
      method: 'PATCH', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secrets: Object.fromEntries(Object.entries({
        APPLE_SIGN_IN_KEY_ID: keyId, APPLE_SIGN_IN_PRIVATE_KEY: pem
      }).map(([name, text]) => [name, { name, text, type: 'secret_text' }])) })
    });
  } catch {
    throw new Error('Apple secret synchronization could not reach Cloudflare; credentials withheld.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) {
    const codes = Array.isArray(result.errors) ? result.errors.map(e => e.code).filter(Number.isInteger) : [];
    throw new Error(`Apple secret synchronization failed: HTTP ${response.status}; Cloudflare codes ${codes.join(',') || 'none'}. Response text and credentials withheld.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await syncAppleSecrets();
    console.log('Dedicated Apple credentials configured for karpservice-api. Secret values are hidden.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
