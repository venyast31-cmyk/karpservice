// Used only in the separate simulator copy prepared by capture-store-screenshots.sh.
// Never bundled by build.mjs, exported to iPhone, or uploaded to TestFlight.
(() => {
  if (!window.KarpNative) throw new Error('Screenshot capture requires the native iOS app');
  const cars = [
    { id: 1, brand: 'Toyota', model: 'Camry', year: 2021, vin: 'TEST0000000000001', history: [
      { id: 1024, number: 'A1024', created_at: '2026-09-15T09:00:00Z', status: 'Закрито', total: 3500 },
      { id: 1006, number: 'A1006', created_at: '2026-08-21T09:00:00Z', status: 'Закрито', total: 1800 }
    ] },
    { id: 2, brand: 'Skoda', model: 'Octavia', year: 2018, vin: 'TEST0000000000002', history: [
      { id: 998, number: 'A998', created_at: '2026-08-10T09:00:00Z', status: 'Закрито', total: 4200 }
    ] }
  ];
  window.KarpNative.request = async (path = '', options = {}) => {
    if ((options.method || 'GET') !== 'GET') throw new Error('Screenshot fixture is read-only');
    let data;
    if (path === '') {
      data = { success: true, found: true,
        customer: { id: 1, first_name: 'Демонстраційний', last_name: 'клієнт', phone: '+380000000000' },
        cars, history_cars: cars };
    } else if (path.startsWith('order?')) {
      data = { success: true, order: { id: 1024, number: 'A1024', created_at: '2026-09-15T09:00:00Z',
        status: 'Закрито', total: 3500, items: [
          { name: 'Заміна мастила та фільтра', kind: 'service', quantity: 1, total: 500 },
          { name: 'Моторне мастило', kind: 'product', quantity: 5, uom: 'л', total: 2500 },
          { name: 'Масляний фільтр', kind: 'product', quantity: 1, total: 500 }
        ] } };
    } else throw new Error('Unexpected screenshot request: ' + path);
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  // Screenshots must never contact a real customer's account, Telegram or the CRM.
  window.fetch = async () => { throw new Error('Network disabled in screenshot copy'); };

  window.addEventListener('load', async () => {
    for (let i = 0; i < 60; i++) {
      if (document.body.classList.contains('is-authenticated') && !document.documentElement.classList.contains('app-loading')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!document.body.classList.contains('is-authenticated')) throw new Error('Fixture did not initialize');
    const screen = window.KarpScreenshotScreen;
    if (screen === 'cars') document.getElementById('carsNav').click();
    else if (screen === 'history') document.getElementById('historyNav').click();
    else if (screen === 'order') await openOrder(1024, 'allHistory');
    else if (screen === 'service' || screen === 'time') {
      startBooking(1);
      if (screen === 'time') {
        document.querySelector('.service').click();
        document.getElementById('serviceContinueBtn').click();
        const day = new Date();
        day.setUTCDate(day.getUTCDate() + 3);
        if (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
        const field = document.getElementById('bookingDate');
        field.value = day.toISOString().slice(0, 10);
        field.dispatchEvent(new Event('change', { bubbles: true }));
        [...document.querySelectorAll('.slot')].find(slot => slot.textContent.trim() === '14:00').click();
      }
    } else throw new Error('Unknown screenshot screen: ' + screen);
    document.body.dataset.screenshotReady = screen;
  }, { once: true });
})();
