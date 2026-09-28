import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import worker from '../src/index.js';
import { passwordHash } from '../src/review-account.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
class Statement {
  constructor(db, sql, args = []) { Object.assign(this, { db, sql, args }); }
  bind(...args) { return new Statement(this.db, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async run() { return this.db.prepare(this.sql).run(...this.args); }
}
async function setup() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_auth.sql', '0004_review_accounts.sql']) db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  const env = { AUTH_DB: { prepare: sql => new Statement(db, sql), batch: statements => Promise.all(statements.map(s => s.run())) }, SESSION_SECRET: 'isolated-test-secret' };
  const password = 'test-only-password-123456';
  const phone = '380730000001';
  db.prepare('INSERT INTO review_accounts (phone,password_salt,password_hash) VALUES (?,?,?)').run(phone, 'test-salt', await passwordHash(password, 'test-salt'));
  const call = (path, method = 'GET', body, token) => worker.fetch(new Request(`https://example.test/${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, ...(body ? { body: JSON.stringify(body) } : {}) }), env, {waitUntil() {}});
  const login = async () => (await (await call('auth/password', 'POST', {phone,password})).json()).token;
  return { db, call, login, phone, password };
}

test('password account is server-persistent, scoped and never calls CRM or Telegram', async () => {
  const {db,call,login,phone,password} = await setup();
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Unexpected live CRM/Telegram access'); };
  try {
    assert.equal((await call('auth/password','POST',{phone,password:'wrong-password-000'})).status,401);
    assert.equal((await call('auth/password','POST',{phone:'380730000002',password})).status,401);
    const token = await login();
    assert.match(token,/^review_/);
    let data = await (await call('', 'GET', null, token)).json();
    assert.equal(data.customer.first_name,'Демонстраційний');
    assert.equal(data.cars.length,2);
    assert.equal((await call('order?order_id=999999','GET',null,token)).status,404);
    assert.equal((await call('auth/verify','POST',{challenge_id:'anything',code:'123456'},token)).status,403);
    assert.equal((await call('cars','POST',{vin:'TEST0000000000003'},token)).status,200);
    const token2 = await login();
    data = await (await call('', 'GET', null, token2)).json();
    assert.equal(data.cars.length,3,'State survives a fresh authenticated session');
    assert.equal((await call('cars/remove','POST',{car_id:999999},token)).status,404);
    const booked = await (await call('booking','POST',{car:'Toyota Camry',service:'Діагностика',scheduled_for:new Date(Date.now()+86400000).toISOString(),client_id:999999},token)).json();
    assert.ok(booked.success);
    data = await (await call('order?order_id='+booked.order.id,'GET',null,token2)).json();
    assert.equal(data.order.items[0].name,'Діагностика');
    assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0,'No live session ever exists');
    assert.equal((await call('', 'GET', null, 'review_'+'x'.repeat(43))).status,401);
    await call('auth/logout','POST',null,token);
    assert.equal((await call('','GET',null,token)).status,401);
    assert.equal((await call('account/deletion','POST',{confirmed:false},token2)).status,400);
    assert.equal((await (await call('account/deletion','POST',{confirmed:true},token2)).json()).status,'deleted');
    assert.equal((await call('','GET',null,token2)).status,401);
    assert.equal((await call('auth/password','POST',{phone,password})).status,401);
    assert.equal(db.prepare('SELECT count(*) n FROM review_accounts').get().n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM review_sessions').get().n,0);
  } finally { globalThis.fetch = previous; db.close(); }
});

test('password rate limit applies before credential verification', async () => {
  const {db,call,phone} = await setup();
  try {
    for(let i=0;i<20;i++) assert.equal((await call('auth/password','POST',{phone,password:'incorrect-password'})).status,401);
    assert.equal((await call('auth/password','POST',{phone,password:'incorrect-password'})).status,429);
  } finally {db.close();}
});
