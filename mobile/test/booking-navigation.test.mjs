import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const quickBooking = html.match(/function openQuickBooking\(\)\s*\{[\s\S]*?\n\}/)?.[0];
const bookingClick = html.match(/<button\b[^>]*\bid="bookingNav"[^>]*\bonclick="([^"]+)"/)?.[1];
assert.ok(quickBooking && bookingClick, 'The booking navigation and its handler must exist.');

function tapBooking(cars) {
  // Derive existing IDs from the shipped page so a removed element stays missing.
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, { textContent: '' }]));
  const actions = [];
  const context = createContext({
    customerData: { cars },
    document: { getElementById: id => elements.get(id) ?? null },
    renderCustomer: () => actions.push('renderCars'),
    show: screen => actions.push(['screen', screen]),
    openCars: () => actions.push('openCars'),
    startBooking: id => actions.push(['bookCar', id]),
  });
  runInContext(`${quickBooking}\n${bookingClick}`, context);
  return { actions, elements };
}

for (const cars of [[], [{id:11}], [{id:11},{id:22}]]) {
  test(`booking opens its own flow with ${cars.length} cars`, () => {
    assert.deepEqual(tapBooking(cars).actions, [['bookCar', null]]);
  });
}
