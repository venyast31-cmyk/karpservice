import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSession } from '../src/demo.mjs';

test('demo reads, writes and unknown/auth routes never call the live transport', async () => {
  const demo = createDemoSession(() => { throw new Error('Demo leaked to live API'); });
  demo.start();
  const profile = await (await demo.request('')).json();
  assert.equal(profile.cars.length, 2);
  assert.equal((await (await demo.request('order?order_id=1024')).json()).order.items.length, 3);
  assert.equal((await demo.request('order?order_id=999999')).status, 404);
  for (const route of ['auth/request', 'auth/verify', 'private/customer', 'https://example.com']) {
    assert.equal((await demo.request(route, { method: 'POST', body: '{}' })).status, 403);
  }
  const post = (route, data) => demo.request(route, { method: 'POST', body: JSON.stringify(data) });
  await post('cars/remove', { car_id: 1 });
  const hidden = await (await demo.request('')).json();
  assert.equal(hidden.cars.length, 1);
  assert.equal(hidden.history_cars.length, 2);
  await post('cars', { vin: profile.cars[0].vin });
  await post('cars', { vin: 'TEST0000000000003' });
  assert.equal((await (await demo.request('')).json()).cars.length, 3);
  const result = await (await post('booking', { car: 'Toyota Camry', service: 'Діагностика', scheduled_for: '2026-10-01T14:00:00+03:00' })).json();
  assert.equal(result.demo, true);
  assert.match(result.order.number, /^DEMO/);
  assert.equal((await (await demo.request('')).json()).cars[0].history[0].number, result.order.number);
  demo.stop(); demo.start();
  assert.equal((await (await demo.request('')).json()).cars.length, 2);
  assert.equal((await demo.request(`order?order_id=${result.order.id}`)).status, 404);
  await demo.request('auth/logout', { method: 'POST' });
  assert.equal(demo.active, false);
});

test('normal requests still use the original authenticated transport after demo exit', async () => {
  const calls = [];
  const demo = createDemoSession(async (...args) => { calls.push(args); return new Response('{}', { status: 401 }); });
  assert.equal((await demo.request('')).status, 401);
  demo.start();
  await demo.request('');
  await demo.request('auth/logout', { method: 'POST' });
  assert.equal(calls.length, 1);
  assert.equal((await demo.request('')).status, 401);
  assert.equal(calls.length, 2);
});
