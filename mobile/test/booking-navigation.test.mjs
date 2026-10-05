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

test('central booking button opens the car chooser when several cars are present', () => {
  const { actions, elements } = tapBooking([{ id: 11 }, { id: 22 }, { id: 33 }]);
  assert.deepEqual(actions, ['renderCars', ['screen', 'cars']]);
  assert.match(elements.get('carsHeading').textContent, /автомобіль.*запис/iu);
});

test('central booking button starts booking directly for the only car', () => {
  const { actions } = tapBooking([{ id: '11' }]);
  assert.deepEqual(actions, [['bookCar', '11']]);
});

test('central booking button opens the cars screen when a car must be added first', () => {
  const { actions } = tapBooking([]);
  assert.deepEqual(actions, ['openCars']);
});
