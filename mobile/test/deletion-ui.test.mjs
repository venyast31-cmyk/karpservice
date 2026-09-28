import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createDemoSession } from '../src/demo.mjs';

const source = (await readFile(new URL('../src/native.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
function harness({ confirm = true, fail = false, pause = false } = {}) {
  const events = new Map(), nodes = new Map(), calls = [], prompts = [];
  for (const id of ['nativeDeleteAccount', 'nativeProfileStatus']) nodes.set(id, {
    disabled: false, textContent: '', addEventListener: (name, fn) => events.set(`${id}:${name}`, fn)
  });
  let ready, resume;
  const pending = new Promise(resolve => { resume = resolve; });
  const window = { addEventListener() {}, confirm: text => { prompts.push(text); return confirm; } };
  runInNewContext(source, { window, document: {
    getElementById: id => nodes.get(id), querySelector: () => null,
    documentElement: { classList: { add() {} } },
    addEventListener: (name, fn) => { if (name === 'DOMContentLoaded') ready = fn; }
  }, navigator: { onLine: true }, Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({}), App: { addListener: async () => {} },
  LocalNotifications: { getPending: async () => ({ notifications: [] }), cancel: async () => {} },
  Haptics: {}, Share: {}, ImpactStyle: {}, reminderDate() {}, notificationId() {}, createDemoSession,
  createTransport: () => async (path, options) => {
    calls.push({ path, options });
    if (pause) await pending;
    if (path === 'account/deletion-policy') return Response.json({ success: true, days: 7 });
    return Response.json(fail ? { success: false, error: 'Сервіс недоступний' } :
      { success: true, request_id: 'TEST-DELETE', deadline_at: 1790899200, status: 'pending' }, { status: fail ? 502 : 200 });
  } });
  ready();
  return { window, calls, prompts, resume, button: nodes.get('nativeDeleteAccount'), status: nodes.get('nativeProfileStatus'),
    click: () => events.get('nativeDeleteAccount:click')({ currentTarget: nodes.get('nativeDeleteAccount') }) };
}
test('deletion cancellation sends no deletion request', async () => {
  const h = harness({ confirm: false }); await h.click();
  assert.equal(h.calls.length, 1); assert.match(h.prompts[0], /7 календарних днів/); assert.equal(h.button.disabled, false);
});
test('confirmed deletion shows pending status and sends no customer-supplied identity', async () => {
  const h = harness(); await h.click();
  assert.deepEqual(JSON.parse(h.calls[1].options.body), { confirmed: true });
  assert.match(h.status.textContent, /TEST-DELETE/); assert.match(h.status.textContent, /ще не завершене/);
  assert.equal(h.button.disabled, false);
});
test('delivery failure is visible and can be retried', async () => {
  const h = harness({ fail: true }); await h.click();
  assert.equal(h.status.textContent, 'Сервіс недоступний'); assert.equal(h.button.disabled, false);
  await h.click(); assert.equal(h.calls.length, 4);
});
test('demo deletion never calls live transport', async () => {
  const h = harness(); h.window.KarpDemo.start(); await h.click();
  assert.equal(h.calls.length, 0); assert.match(h.status.textContent, /Справжній запит.*не надіслано/);
});
test('logout while policy is loading prevents confirmation and deletion', async () => {
  const h = harness({ pause: true }); const request = h.click();
  assert.equal(h.button.disabled, true); h.window.KarpNative.didLogout(); h.resume(); await request;
  assert.equal(h.calls.length, 1); assert.equal(h.prompts.length, 0); assert.equal(h.button.disabled, false);
});
