// A visible, local product tour. No credentials, network, or real CRM identifiers.
export function createDemoSession(liveRequest) {
  let state = null;
  const reply = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
  const reject = (message, status = 400) => reply({ success: false, error: message }, status);
  return {
    get active() { return state !== null; },
    start() { state = initialState(); },
    stop() { state = null; },
    async request(path = '', options = {}) {
      if (!state) return liveRequest(path, options);
      const method = String(options.method || 'GET').toUpperCase();
      const [route, query = ''] = String(path).split('?');
      let body = {};
      try { body = options.body ? JSON.parse(options.body) : {}; }
      catch { return reject('Некоректні демодані.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reject('Некоректні демодані.');

      if (route === '' && method === 'GET') return reply({ success: true, found: true,
        customer: { id: 1, first_name: 'Демонстраційний', last_name: 'клієнт', phone: 'Демо — номер не потрібен' },
        cars: state.cars.filter(car => !state.hidden.has(car.id)), history_cars: state.cars });
      if (route === 'order' && method === 'GET') {
        const id = Number(new URLSearchParams(query).get('order_id'));
        const order = state.orders.find(item => item.id === id);
        return order ? reply({ success: true, order }) : reject('Демонстраційне замовлення не знайдено.', 404);
      }
      if (route === 'cars' && method === 'POST') {
        const vin = String(body.vin || '').toUpperCase();
        if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return reject('VIN має містити 17 символів.');
        const car = state.cars.find(item => item.vin === vin);
        if (car) state.hidden.delete(car.id);
        else state.cars.push({ id: ++state.nextId, brand: 'Демонстраційне', model: 'авто', year: 2024, vin, history: [] });
        return reply({ success: true, already_exists: Boolean(car) });
      }
      if (route === 'cars/remove' && method === 'POST') {
        const id = Number(body.car_id);
        if (!state.cars.some(car => car.id === id)) return reject('Авто не знайдено.', 404);
        state.hidden.add(id);
        return reply({ success: true, message: 'Демоавто приховано. Історія доступна у вкладці «Історія».' });
      }
      if (route === 'booking' && method === 'POST') {
        const car = state.cars.find(item => `${item.brand} ${item.model}` === body.car && !state.hidden.has(item.id));
        if (!car || !body.service || !Number.isFinite(Date.parse(body.scheduled_for))) return reject('Оберіть демоавто, послугу та час.');
        const id = ++state.nextId;
        const order = { id, number: `DEMO${id}`, created_at: new Date().toISOString(), scheduled_for: body.scheduled_for,
          status: 'Демонстраційний запис', total: 0,
          items: [{ name: String(body.service), kind: 'service', quantity: 1, total: 0 }] };
        car.history.unshift(order);
        state.orders.push(order);
        return reply({ success: true, demo: true, order });
      }
      if (route === 'auth/logout' && method === 'POST') {
        state = null;
        return reply({ success: true });
      }
      // Unknown paths never fall through to the live API while the tour is active.
      return reject('Ця дія недоступна в деморежимі.', 403);
    }
  };
}

function initialState() {
  const orders = [
    { id: 1024, number: 'A1024', created_at: '2026-09-15T09:00:00Z', status: 'Закрито', total: 3500,
      items: [ { name: 'Заміна мастила та фільтра', kind: 'service', quantity: 1, total: 500 },
        { name: 'Моторне мастило', kind: 'product', quantity: 5, uom: 'л', total: 2500 },
        { name: 'Масляний фільтр', kind: 'product', quantity: 1, total: 500 } ] },
    { id: 1006, number: 'A1006', created_at: '2026-08-21T09:00:00Z', status: 'Закрито', total: 1800,
      items: [{ name: 'Діагностика та обслуговування гальм', kind: 'service', quantity: 1, total: 1800 }] },
    { id: 998, number: 'A998', created_at: '2026-08-10T09:00:00Z', status: 'Закрито', total: 4200,
      items: [{ name: 'Роботи з підвіски', kind: 'service', quantity: 1, total: 1700 },
        { name: 'Деталі підвіски', kind: 'product', quantity: 1, total: 2500 }] }
  ];
  return { nextId: 2000, hidden: new Set(), orders, cars: [
    { id: 1, brand: 'Toyota', model: 'Camry', year: 2021, vin: 'TEST0000000000001', history: [orders[0], orders[1]] },
    { id: 2, brand: 'Skoda', model: 'Octavia', year: 2018, vin: 'TEST0000000000002', history: [orders[2]] }
  ] };
}
