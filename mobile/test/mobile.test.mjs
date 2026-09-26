import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeRequest, createTransport } from '../src/transport.mjs';
import { reminderDate, notificationId } from '../src/reminder.mjs';

test('native bridge accepts only the known API paths and methods', () => {
  assert.deepEqual(nativeRequest('order?order_id=42'), { path: 'order?order_id=42', method: 'GET' });
  for (const path of ['https://evil.invalid', '//evil.invalid', '/auth/verify', '../auth/verify', 'auth/verify#x', 'telegram/webhook', 'order\\x']) {
    assert.throws(() => nativeRequest(path, { method: 'POST' }));
  }
  assert.throws(() => nativeRequest('booking'));
  assert.throws(() => nativeRequest('auth/verify', { method: 'POST', body: '[]' }));
  assert.throws(() => nativeRequest('booking', { method: 'POST', body: 'broken' }));
});

test('HTTP status and JSON are preserved, but JavaScript-supplied credentials are not forwarded', async () => {
  let received;
  const request = createTransport({ request: async input => { received = input; return { status: 401, data: { success: false } }; } });
  const response = await request('order?order_id=42', { headers: { Authorization: 'Bearer should-never-cross-the-bridge' } });
  assert.equal(response.status, 401);
  assert.equal(response.ok, false);
  assert.deepEqual(await response.json(), { success: false });
  assert.equal('headers' in received, false);
});

test('near-term and distant reminders use absolute instants, including Kyiv DST changes', () => {
  const now = Date.parse('2026-10-25T08:00:00+02:00');
  assert.equal(reminderDate('2026-10-25T10:30:00+02:00', now).toISOString(), '2026-10-25T07:30:00.000Z');
  assert.equal(reminderDate('2026-10-25T08:30:00+02:00', now).toISOString(), '2026-10-25T06:15:00.000Z');
  assert.equal(reminderDate('2026-10-25T08:05:00+02:00', now), null);
  assert.equal(reminderDate('2026-10-25T07:00:00+02:00', now), null);
  assert.equal(reminderDate('invalid', now), null);
  assert.equal(notificationId('2026-10-25T10:30:00+02:00'), notificationId('2026-10-25T08:30:00Z'));
});
