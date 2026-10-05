import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { syncAppleSecrets } from '../scripts/sync-apple-secrets.mjs';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const env = {
  CLOUDFLARE_ACCOUNT_ID: '0feb0b23b311ee71074cc7a19d30ae2c',
  CLOUDFLARE_API_TOKEN: 'test-token', APPLE_SIGN_IN_KEY_ID: 'TESTKEY123',
  APPLE_SIGN_IN_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' })
};

test('Apple key sync sends only the two scoped bindings and preserves other secrets', async () => {
  await syncAppleSecrets(env, async (url, options) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/0feb0b23b311ee71074cc7a19d30ae2c/workers/scripts/karpservice-api/secrets-bulk');
    assert.equal(options.method, 'PATCH');
    assert.equal(options.redirect, 'error');
    const { secrets } = JSON.parse(options.body);
    assert.deepEqual(Object.keys(secrets), ['APPLE_SIGN_IN_KEY_ID', 'APPLE_SIGN_IN_PRIVATE_KEY']);
    assert.equal(secrets.APPLE_SIGN_IN_PRIVATE_KEY.text, env.APPLE_SIGN_IN_PRIVATE_KEY.trim());
    assert.equal(secrets.APPLE_SIGN_IN_KEY_ID.text, env.APPLE_SIGN_IN_KEY_ID);
    assert.ok(Object.values(secrets).every(value => value.type === 'secret_text'));
    return new Response(JSON.stringify({ success: true }));
  });
  await assert.rejects(syncAppleSecrets({ ...env, CLOUDFLARE_ACCOUNT_ID: 'other-account' }, () => {
    assert.fail('Wrong account must be rejected before transmission');
  }), /account or credentials/);
});

test('Apple key sync reports status and numeric codes without leaking response text or credentials', async () => {
  const request = async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10021, message: env.APPLE_SIGN_IN_PRIVATE_KEY }] }), { status: 400 });
  await assert.rejects(syncAppleSecrets(env, request), error => {
    assert.match(error.message, /HTTP 400; Cloudflare codes 10021/);
    assert.ok(!error.message.includes('BEGIN PRIVATE KEY'));
    assert.ok(!error.message.includes('test-token'));
    return true;
  });
});
