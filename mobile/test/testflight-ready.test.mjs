import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignInternalBuild } from '../scripts/testflight-ready.mjs';

test('Only the exact processed build is assigned to the existing internal group', async () => {
  let member = false, polls = 0;
  const api = async (resource, body) => {
    if (resource === '/v1/apps/6816711108') return { data: { attributes: { bundleId: 'ua.karpservice.client' } } };
    if (resource === '/v1/apps/6816711108/betaGroups?limit=200') return { data: [
      { id: 'external', attributes: { name: 'Тест Karpservice', isInternalGroup: false } },
      { id: 'internal', attributes: { name: 'Тест Karpservice', isInternalGroup: true } }
    ] };
    if (resource.startsWith('/v1/builds?')) return { data: ++polls === 1 ? [] : [{ id: 'build', attributes: { version: '11.1.0', processingState: 'VALID', expired: false } }] };
    if (resource === '/v1/builds/build/relationships/betaGroups?limit=200') return { data: member ? [{ id: 'internal' }] : [] };
    assert.equal(resource, '/v1/betaGroups/internal/relationships/builds');
    assert.deepEqual(body, { data: [{ type: 'builds', id: 'build' }] });
    member = true; return {};
  };
  const result = await assignInternalBuild(api, '11.1.0', { wait: async () => {}, attempts: 2 });
  assert.equal(result.buildId, 'build');
  assert.equal(member, true);
});

test('Wrong app cannot receive a TestFlight assignment', async () => {
  await assert.rejects(assignInternalBuild(async () => ({ data: { attributes: { bundleId: 'other.app' } } }), '11.1.0'), /Unexpected App Store application/);
});
