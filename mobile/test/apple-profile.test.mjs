import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { appleProfile } from '../scripts/apple-profile.mjs';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const env = { ASC_PRIVATE_KEY: privateKey.export({ format: 'pem', type: 'pkcs8' }), ASC_KEY_ID: 'TESTKEY123', ASC_ISSUER_ID: 'test-issuer' };
const certificate = Buffer.from('existing-distribution-certificate');
const hash = createHash('sha1').update(certificate).digest('hex').toUpperCase();
const original = { certificateSHA1: [hash] };
const profile = Buffer.from('verified-app-store-profile');
const decode = bytes => { assert.deepEqual(bytes, profile); return original; };
const verify = value => value;

test('profile refresh cannot enable Apple capability or replace the signing certificate', async () => {
  const paths = [];
  const request = async (url, options) => {
    paths.push(new URL(url).pathname);
    assert.equal(options.method, 'GET');
    if (url.includes('bundleIdCapabilities')) return Response.json({ data: [] });
    return Response.json({ data: { attributes: { identifier: 'ua.karpservice.client' } } });
  };
  await assert.rejects(appleProfile({ env, original, decode, verify, request }), /Enable Sign in with Apple/);
  assert.equal(paths.length, 2);
});

test('profile refresh reuses a valid existing profile without writes', async () => {
  const request = async (url, options) => {
    assert.equal(options.method, 'GET');
    if (url.includes('bundleIdCapabilities')) return Response.json({ data: [{ attributes: { capabilityType: 'APPLE_ID_AUTH' } }] });
    if (url.includes('/profiles?')) return Response.json({ data: [{ attributes: { profileType: 'IOS_APP_STORE', profileState: 'ACTIVE', profileContent: profile.toString('base64') } }] });
    return Response.json({ data: { attributes: { identifier: 'ua.karpservice.client' } } });
  };
  assert.deepEqual(await appleProfile({ env, original, decode, verify, request }), profile);
});

test('regeneration is scoped to Karpservice and the already installed certificate', async () => {
  let writes = 0;
  const request = async (url, options) => {
    if (options.method === 'POST') {
      writes++;
      assert.equal(url, 'https://api.appstoreconnect.apple.com/v1/profiles');
      const body = JSON.parse(options.body).data;
      assert.equal(body.attributes.profileType, 'IOS_APP_STORE');
      assert.equal(body.relationships.bundleId.data.id, 'Z2JHAYZ2H3');
      assert.deepEqual(body.relationships.certificates.data, [{ type: 'certificates', id: 'existing-cert' }]);
      return Response.json({ data: { attributes: { profileContent: profile.toString('base64') } } });
    }
    if (url.includes('bundleIdCapabilities')) return Response.json({ data: [{ attributes: { capabilityType: 'APPLE_ID_AUTH' } }] });
    if (url.includes('/profiles?')) return Response.json({ data: [] });
    if (url.includes('/certificates?')) return Response.json({ data: [{ id: 'existing-cert', attributes: { certificateType: 'DISTRIBUTION', expirationDate: '2030-01-01', certificateContent: certificate.toString('base64') } }] });
    return Response.json({ data: { attributes: { identifier: 'ua.karpservice.client' } } });
  };
  assert.deepEqual(await appleProfile({ env, original, decode, verify, request }), profile);
  assert.equal(writes, 1);
});
