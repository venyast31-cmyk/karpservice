import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProfile, buildNumber, TEAM, BUNDLE } from '../scripts/ci-signing.mjs';

function profile() {
  return { UUID: '12345678-1234-1234-1234-123456789abc', TeamIdentifier: [TEAM], ExpirationDate: '2030-01-01T00:00:00Z', certificateSHA1: ['A'.repeat(40)], Entitlements: { 'application-identifier': `${TEAM}.${BUNDLE}`, 'com.apple.developer.team-identifier': TEAM, 'get-task-allow': false } };
}

test('release signing rejects development, ad-hoc, enterprise and wrong-app profiles', () => {
  assert.doesNotThrow(() => verifyProfile(profile()));
  for (const bad of [
    { ...profile(), ProvisionedDevices: ['device'] },
    { ...profile(), ProvisionsAllDevices: true },
    { ...profile(), TeamIdentifier: ['OTHERTEAM1'] },
    { ...profile(), ExpirationDate: '2000-01-01T00:00:00Z' },
    { ...profile(), Entitlements: { ...profile().Entitlements, 'application-identifier': `${TEAM}.another.app` } },
    { ...profile(), Entitlements: { ...profile().Entitlements, 'get-task-allow': true } },
  ]) assert.throws(() => verifyProfile(bad));
});

test('re-running a CI upload gets a new valid Apple build number', () => {
  assert.equal(buildNumber('42', '1'), '42.1.0');
  assert.notEqual(buildNumber('42', '1'), buildNumber('42', '2'));
  for (const input of ['0', '10000', '1\nOTHER=value', undefined]) assert.throws(() => buildNumber(input, '1'));
});
