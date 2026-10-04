import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';

// Exercise the actual bundled handlers, including mobile-specific transforms.
execFileSync(process.execPath, [new URL('../scripts/build.mjs', import.meta.url).pathname]);
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const names = ['show', 'openGuestLogin', 'openClientHome', 'openCars', 'openAddCar', 'openAllHistory', 'openQuickBooking', 'initializeApp'];
const handlers = names.map(name => {
  const source = html.match(new RegExp(`(?:async )?function ${name}\\(.*?\\)\\{[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(source, `${name} exists in the bundled app`);
  return source;
}).join('\n');

function app(customerData = null) {
  let current, booked, finished = false;
  const context = createContext({
    customerData,
    document: {
      querySelectorAll: () => [],
      getElementById: id => ({ classList: { add: () => { current = id; } }, textContent: '' }),
    },
    window: { scrollTo() {} },
    resetAuthFlow() {}, renderCustomer() {},
    startBooking: id => { booked = id; },
    loadCustomer: async () => false,
    finishInitialLoading: () => { finished = true; },
  });
  runInContext(handlers, context);
  return { context, screen: () => current, booked: () => booked, finished: () => finished };
}

test('fresh signed-out launch and public tabs do not require an account', async () => {
  const ui = app();
  await runInContext('initializeApp()', ui.context);
  assert.equal(ui.screen(), 'home');
  assert.equal(ui.finished(), true);
  runInContext('openQuickBooking()', ui.context);
  assert.equal(ui.screen(), 'guestServices');
  runInContext("show('guestContacts')", ui.context);
  assert.equal(ui.screen(), 'guestContacts');
  await runInContext('openClientHome()', ui.context);
  assert.equal(ui.screen(), 'home');
  const catalogue = html.match(/<section id="guestServices"[\s\S]*?<\/section>/)[0];
  assert.equal((catalogue.match(/<article/g) || []).length, 4);
  assert.match(catalogue, /Заміна масла/);
});

test('guest access cannot reveal private screens or start a booking', () => {
  const ui = app();
  for (const screen of ['cars', 'profile', 'allHistory', 'order', 'service', 'time', 'done']) {
    runInContext(`show('${screen}')`, ui.context);
    assert.equal(ui.screen(), 'login', screen);
  }
  for (const handler of ['openCars', 'openAddCar', 'openAllHistory']) {
    runInContext(`${handler}()`, ui.context);
    assert.equal(ui.screen(), 'login', handler);
  }
  assert.equal(ui.booked(), undefined);
});

test('signed-in customers retain private navigation and direct booking', () => {
  const ui = app({ cars: [{ id: 42 }] });
  runInContext("show('profile')", ui.context);
  assert.equal(ui.screen(), 'profile');
  runInContext('openQuickBooking()', ui.context);
  assert.equal(ui.booked(), 42);
});
