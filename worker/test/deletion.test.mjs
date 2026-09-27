import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { handleDeletionRoute } from '../src/deletion.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
class Statement {
  constructor(db, sql, args = []) { Object.assign(this, { db, sql, args }); }
  bind(...args) { return new Statement(this.db, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async run() { return this.db.prepare(this.sql).run(...this.args); }
}

test('deletion requires confirmed identity, an operator deadline and reliable notification', async () => {
  const db = new DatabaseSync(':memory:');
  for (const migration of ['0001_auth.sql', '0003_deletion_requests.sql']) {
    db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  const now = Math.floor(Date.now() / 1000);
  const token = 'T'.repeat(43);
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    createHash('sha256').update(`session:${token}`).digest('hex'),
    '380670000001', 42, 'Тестовий клієнт', '1001', now, now + 3600, now);
  const env = { AUTH_DB: { prepare: sql => new Statement(db, sql) },
    SESSION_SECRET: 'test-only-secret', TELEGRAM_BOT_TOKEN: 'test-only-token',
    TELEGRAM_WEBHOOK_SECRET: 'test-only-hook', TELEGRAM_CHAT_ID: 'service-test-chat' };
  const call = (route, method, body, authenticated = true) => handleDeletionRoute(new Request(
    `https://example.test/account/${route}`, { method,
      headers: authenticated ? { Authorization: `Bearer ${token}` } : {},
      ...(body ? { body: JSON.stringify(body) } : {}) }), env, {});
  const previousFetch = globalThis.fetch;
  let shouldFail = true;
  const notifications = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, 'api.telegram.org');
    notifications.push(JSON.parse(options.body));
    return Response.json({ ok: !shouldFail }, { status: shouldFail ? 503 : 200 });
  };
  try {
    assert.equal((await call('deletion', 'POST', { confirmed: true }, false)).status, 401);
    assert.equal((await call('deletion-policy', 'GET')).status, 503);
    env.ACCOUNT_DELETION_DAYS = '7'; // Fixture, not an agreed production deadline.
    assert.equal((await (await call('deletion-policy', 'GET')).json()).days, 7);
    assert.equal((await call('deletion', 'POST', { confirmed: false })).status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM deletion_requests').get().n, 0);
    assert.equal((await call('deletion', 'POST', { confirmed: true, customer_id: 999, phone: 'attacker' })).status, 502);
    const pending = db.prepare('SELECT * FROM deletion_requests').get();
    assert.equal(pending.customer_id, 42);
    assert.equal(pending.phone, '380670000001');
    assert.equal(pending.notified_at, null);
    assert.equal(pending.deadline_at - pending.created_at, 7 * 86400);
    shouldFail = false;
    const result = await (await call('deletion', 'POST', { confirmed: true })).json();
    assert.equal(result.request_id, pending.request_id);
    assert.equal(result.status, 'pending');
    assert.ok(db.prepare('SELECT notified_at FROM deletion_requests').get().notified_at);
    assert.equal(notifications.at(-1).chat_id, 'service-test-chat');
    assert.match(notifications.at(-1).text, /CRM ID: 42/);
    assert.doesNotMatch(notifications.at(-1).text, /attacker|999/);
    await call('deletion', 'POST', { confirmed: true });
    assert.equal(notifications.length, 2, 'A delivered request must not be notified again on retry');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1, 'A pending request is not completed deletion');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM deletion_requests').get().n, 1);
  } finally { globalThis.fetch = previousFetch; db.close(); }
});
