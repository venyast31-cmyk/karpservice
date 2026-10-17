import test from 'node:test';
import assert from 'node:assert/strict';
import {createVinalfa} from '../src/vinalfa.js';
const vin = 'WDC1660231A178846';
const id = 'a'.repeat(32);
test('VIN request uses documented endpoint and server authorization', async () => {
  const api = createVinalfa({VINALFA_API_TOKEN:'test-only'}, async (url, options) => {
    assert.equal(url, 'https://api.vinalfa.com/oem/v2/vehicles/resolve');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), {identifier:vin,identifier_type:'vin'});
    return Response.json({data:{vehicles:[]},meta:{api_version:'2.0'}});
  });
  assert.deepEqual(await api.resolve(vin.toLowerCase()), {vehicles:[]});
});
test('rejects invalid identifiers before any network request', () => {
  const api = createVinalfa({VINALFA_API_TOKEN:'test-only'}, () => assert.fail('unexpected request'));
  assert.throws(() => api.resolve('bad'), /invalid_vin/);
  assert.throws(() => api.groups('../catalogs'), /invalid_catalog_id/);
  assert.throws(() => api.parts(id, '../'), /invalid_catalog_id/);
});
test('missing secret disables access', async () => {
  await assert.rejects(createVinalfa({}, () => assert.fail('unexpected request')).catalogs(), /oem_unconfigured/);
});
test('provider errors cannot expose provider payloads', async () => {
  for (const [status, code] of [[401,'oem_access_unavailable'],[403,'oem_access_unavailable'],[429,'oem_limit'],[404,'oem_not_found'],[500,'oem_unavailable']]) {
    const api = createVinalfa({VINALFA_API_TOKEN:'test-only'}, async () => new Response('sensitive provider detail', {status}));
    await assert.rejects(api.catalogs(), e => e.message === code);
  }
});
test('rejects malformed successful responses', async () => {
  for (const data of [{}, {data:[]}, {data:{},error:{message:'private'}}]) {
    const api = createVinalfa({VINALFA_API_TOKEN:'test-only'}, async () => Response.json(data));
    await assert.rejects(api.catalogs(), /oem_invalid_response/);
  }
});
