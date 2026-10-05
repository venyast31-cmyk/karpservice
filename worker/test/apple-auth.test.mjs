import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import worker from '../src/index.js';
import { verifyAppleIdentity, getAppleSession, ensureAppleCustomer } from '../src/apple-auth.js';
import { sha256Hex } from '../src/auth.js';

class Statement {
  constructor(db, sql, values = []) { Object.assign(this, { db, sql, values }); }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  async first() { return this.db.prepare(this.sql).get(...this.values) || null; }
  async run() { const result = this.db.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values) }; }
}
const timestamp = () => Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

async function setup() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_auth.sql', '0002_hidden_customer_cars.sql', '0003_deletion_requests.sql', '0004_review_accounts.sql', '0006_apple_sign_in.sql']) db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const signing = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const kid = randomUUID();
  const jwk = { ...rsa.publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  const jwt = claims => {
    const content = `${encode({ alg: 'RS256', kid })}.${encode({ iss: 'https://appleid.apple.com', aud: 'ua.karpservice.client', sub: 'apple-test-user', email: 'relay@privaterelay.appleid.com', email_verified: true, iat: timestamp(), exp: timestamp() + 300, ...claims })}`;
    return `${content}.${sign('RSA-SHA256', Buffer.from(content), rsa.privateKey).toString('base64url')}`;
  };
  const env = { AUTH_DB: { prepare: sql => new Statement(db, sql), batch: async statements => {
    db.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; }
  } }, SESSION_SECRET: 'test-only-session-secret-at-least-32-characters', APPLE_SIGN_IN_KEY_ID: 'TESTKEY123', APPLE_SIGN_IN_PRIVATE_KEY: signing.privateKey.export({ format: 'pem', type: 'pkcs8' }), ROAPP_API_KEY: 'test-crm', TELEGRAM_BOT_TOKEN: 'test-bot', TELEGRAM_WEBHOOK_SECRET: 'test-webhook', TELEGRAM_CHAT_ID: 'test-chat', ACCOUNT_DELETION_DAYS: '7' };
  const calls = [], codes = new Map();
  let rejectRefresh = false;
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), body: init.body });
    if (url.toString() === 'https://appleid.apple.com/auth/keys') return Response.json({ keys: [jwk] });
    if (url.toString() === 'https://appleid.apple.com/auth/token') {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('client_id'), 'ua.karpservice.client');
      if (body.get('grant_type') === 'refresh_token') return rejectRefresh ? Response.json({ error: 'invalid_grant' }, { status: 400 }) : Response.json({ access_token: 'access' });
      const identity = codes.get(body.get('code'));
      if (!identity) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      codes.delete(body.get('code'));
      return Response.json({ id_token: identity, refresh_token: 'private-test-refresh-token' });
    }
    if (url.toString() === 'https://appleid.apple.com/auth/revoke') {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('token'), 'private-test-refresh-token');
      return Response.json({});
    }
    if (url.toString() === 'https://api.roapp.io/v2/contacts/people' && init.method === 'POST') {
      const body = JSON.parse(init.body);
      assert.equal(body.email, 'relay@privaterelay.appleid.com');
      assert.deepEqual(body.phones, []);
      return Response.json({ data: { id: 123 } });
    }
    if (url.pathname === '/v2/orders') { assert.deepEqual(url.searchParams.getAll('client_ids'), ['123']); return Response.json({ data: [], count: 0 }); }
    if (url.pathname === '/v2/warehouse/assets') return Response.json({ data: [] });
    if (url.pathname === '/v2/orders/999') return Response.json({ data: { id: 999, client_id: 999 } });
    if (url.hostname === 'api.telegram.org') return Response.json({ ok: true, result: {} });
    throw new Error(`Unexpected external request: ${url.origin}${url.pathname}`);
  };
  const call = (path, method = 'GET', body, token) => worker.fetch(new Request(`https://example.test/${path}`, { method, headers: { 'CF-Connecting-IP': 'test', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} });
  const start = async (mode = 'login', token) => (await (await call('auth/apple/start', 'POST', { mode }, token)).json());
  const complete = async (challenge, claims = {}, token) => {
    const identity = jwt({ nonce: challenge.nonce, ...claims });
    const code = randomUUID(); codes.set(code, identity);
    const body = { challenge_id: challenge.challenge_id, identity_token: identity, authorization_code: code, name: 'Тест Apple', phone: '380670000000', customer_id: 999 };
    return { response: await call('auth/apple/complete', 'POST', body, token), body };
  };
  return { db, env, jwt, calls, call, start, complete, revoke: () => { rejectRefresh = true; }, close: () => { globalThis.fetch = previous; db.close(); } };
}

test('Apple tokens reject wrong issuer, audience, nonce, expiry and signature', async () => {
  const t = await setup();
  try {
    const nonce = 'nonce';
    assert.equal((await verifyAppleIdentity(t.jwt({ nonce }), nonce)).sub, 'apple-test-user');
    for (const bad of [{ iss: 'https://evil.test' }, { aud: 'another-app' }, { nonce: 'another-attempt' }, { exp: timestamp() - 1 }, { iat: timestamp() + 120 }, { sub: '' }]) {
      await assert.rejects(verifyAppleIdentity(t.jwt({ nonce, ...bad }), nonce));
    }
    const token = t.jwt({ nonce });
    const [head, payload, signature] = token.split('.');
    await assert.rejects(verifyAppleIdentity(`${head}.${encode({ ...JSON.parse(Buffer.from(payload, 'base64url')), sub: 'victim' })}.${signature}`, nonce));
    await assert.rejects(verifyAppleIdentity(`${encode({ alg: 'none' })}.${payload}.${signature}`, nonce));
  } finally { t.close(); }
});

test('Apple sign-in is independent of Telegram, replay-safe and does not merge by email or supplied IDs', async () => {
  const t = await setup();
  try {
    delete t.env.TELEGRAM_BOT_TOKEN;
    delete t.env.TELEGRAM_WEBHOOK_SECRET;
    const challenge = await t.start();
    const result = await t.complete(challenge);
    assert.equal(result.response.status, 200);
    const auth = await result.response.json();
    assert.match(auth.token, /^apple_/);
    assert.equal((await t.call('auth/apple/complete', 'POST', result.body)).status, 401);
    let response = await t.call('', 'GET', null, auth.token);
    const profile = await response.json();
    assert.equal(response.status, 200);
    assert.equal(profile.found, true);
    assert.equal(profile.customer.id, 0);
    assert.equal(profile.customer.phone, '');
    assert.equal(profile.customer.email, 'relay@privaterelay.appleid.com');
    assert.deepEqual(profile.cars, []);
    assert.equal(t.calls.some(call => call.url.includes('roapp') || call.url.includes('telegram')), false);
    const row = t.db.prepare('SELECT * FROM apple_accounts').get();
    assert.notEqual(row.refresh_token, 'private-test-refresh-token');
    assert.equal(row.customer_id, null);
    const second = await (await (await t.complete(await t.start(), { sub: 'different-apple-same-email' })).response.json());
    assert.notEqual(second.token, auth.token);
    assert.equal(t.db.prepare('SELECT count(*) AS count FROM apple_accounts').get().count, 2);
    await t.call('auth/logout', 'POST', {}, auth.token);
    assert.equal((await t.call('', 'GET', null, auth.token)).status, 401);
    assert.equal((await t.call('', 'GET', null, second.token)).status, 200);
  } finally { t.close(); }
});

test('existing customers can link Apple only with their own recent verified session', async () => {
  const t = await setup();
  try {
    assert.equal((await t.call('auth/apple/start', 'POST', { mode: 'link', customer_id: 123 })).status, 401);
    const telegramToken = 'T'.repeat(43);
    t.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)').run(await sha256Hex(`session:${telegramToken}`), '380670000000', 123, 'Власник', 'test-telegram', timestamp(), timestamp() + 3600, timestamp());
    const challenge = await t.start('link', telegramToken);
    assert.equal((await t.complete(challenge)).response.status, 401);
    const linked = await t.complete(challenge, {}, telegramToken);
    assert.equal(linked.response.status, 200);
    const auth = await linked.response.json();
    const profile = await (await t.call('', 'GET', null, auth.token)).json();
    assert.equal(profile.customer.id, 123);
    assert.equal(profile.customer.first_name, 'Власник');
    assert.equal((await t.call('order?order_id=999&phone=380671111111', 'GET', null, auth.token)).status, 404);
    t.db.prepare('UPDATE sessions SET created_at=?').run(timestamp() - 600);
    assert.equal((await t.call('auth/apple/start', 'POST', { mode: 'link' }, telegramToken)).status, 401);
  } finally { t.close(); }
});

test('CRM profile creation uses verified Apple account, runs once and cannot claim an existing customer', async () => {
  const t = await setup();
  try {
    const auth = await (await t.complete(await t.start())).response.json();
    const request = new Request('https://example.test', { headers: { Authorization: `Bearer ${auth.token}` } });
    const session = await getAppleSession(request, t.env);
    assert.equal(await ensureAppleCustomer(t.env, session), 123);
    assert.equal(await ensureAppleCustomer(t.env, session), 123);
    assert.equal(t.calls.filter(call => call.url === 'https://api.roapp.io/v2/contacts/people').length, 1);
    const current = await getAppleSession(request, t.env);
    assert.equal(current.customer_id, 123);
    const profile = await (await t.call('', 'GET', null, auth.token)).json();
    assert.equal(profile.customer.id, 123);
  } finally { t.close(); }
});

test('account deletion revokes Apple token and removes unlinked profile plus every session', async () => {
  const t = await setup();
  try {
    const first = await (await t.complete(await t.start())).response.json();
    const second = await (await t.complete(await t.start())).response.json();
    assert.equal((await t.call('account/deletion', 'POST', { confirmed: false }, first.token)).status, 400);
    const response = await t.call('account/deletion', 'POST', { confirmed: true }, first.token);
    assert.equal((await response.json()).status, 'deleted');
    assert.ok(t.calls.some(call => call.url.endsWith('/auth/revoke')));
    assert.equal(t.db.prepare('SELECT count(*) AS count FROM apple_accounts').get().count, 0);
    assert.equal((await t.call('', 'GET', null, second.token)).status, 401);
    assert.equal(t.calls.some(call => call.url.includes('roapp') || call.url.includes('telegram')), false);
  } finally { t.close(); }
});

test('revoked Apple authorization invalidates all sessions during daily validation', async () => {
  const t = await setup();
  try {
    const auth = await (await t.complete(await t.start())).response.json();
    t.db.prepare('UPDATE apple_accounts SET validated_at = ?').run(timestamp() - 90000);
    t.revoke();
    assert.equal((await t.call('', 'GET', null, auth.token)).status, 401);
    assert.equal(t.db.prepare('SELECT count(*) AS count FROM apple_sessions').get().count, 0);
  } finally { t.close(); }
});

test('invalid vehicle data does not create a CRM record and deletion waits for CRM creation', async () => {
  const t = await setup();
  try {
    const auth = await (await t.complete(await t.start())).response.json();
    assert.equal((await t.call('cars', 'POST', { vin: 'invalid' }, auth.token)).status, 400);
    assert.equal(t.calls.some(call => call.url.includes('roapp')), false);
    t.db.prepare('UPDATE apple_accounts SET crm_creation_started_at = ?').run(timestamp());
    assert.equal((await t.call('account/deletion', 'POST', { confirmed: true }, auth.token)).status, 409);
    assert.equal(t.calls.some(call => call.url.endsWith('/auth/revoke')), false);
    assert.equal(t.db.prepare('SELECT count(*) AS n FROM apple_accounts').get().n, 1);
  } finally { t.close(); }
});
