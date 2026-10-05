import { createPrivateKey } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Only this app's two Apple bindings are written. Existing Worker secrets stay intact.
// The private key is sent through stdin, never argv, files, logs or artifacts.
try {
  const env = process.env;
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
  const result = spawnSync('npx', ['--yes', 'wrangler@4.127.1', 'secret', 'bulk', '--name', 'karpservice-api'], {
    input: JSON.stringify({ APPLE_SIGN_IN_KEY_ID: keyId, APPLE_SIGN_IN_PRIVATE_KEY: pem }),
    // Do not relay child output: an error must not expose any credential.
    stdio: ['pipe', 'ignore', 'ignore'], env, timeout: 120000
  });
  if (result.error || result.status !== 0) {
    throw new Error('Apple secret synchronization failed. Check Cloudflare access; credential output was withheld.');
  }
  console.log('Dedicated Apple credentials configured for karpservice-api. Secret values are hidden.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
