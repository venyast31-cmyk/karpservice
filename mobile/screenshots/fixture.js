// Used only in the separate simulator copy prepared by capture-store-screenshots.sh.
// Navigation automation is never included in the physical-device build.
(() => {
  if (!window.KarpNative) throw new Error('Screenshot capture requires the native iOS app');
  if (!window.KarpDemo) throw new Error('The production demo must be bundled');
  window.KarpDemo.start();
  // Exercise the public demo, with no screenshot-only data or real API calls.
  window.fetch = async () => { throw new Error('Network disabled in screenshot copy'); };

  window.addEventListener('load', async () => {
    for (let i = 0; i < 60; i++) {
      if (document.body.classList.contains('is-authenticated') && !document.documentElement.classList.contains('app-loading')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!document.body.classList.contains('is-authenticated')) throw new Error('Fixture did not initialize');
    const screen = window.KarpScreenshotScreen;
    if (screen === 'login') {
      await logout();
      openGuestLogin();
    }
    else if (screen === 'cars') document.getElementById('carsNav').click();
    else if (screen === 'history') document.getElementById('historyNav').click();
    else if (screen === 'order') await openOrder(1024, 'allHistory');
    else if (screen === 'service' || screen === 'time' || screen === 'done') {
      startBooking(1);
      if (screen === 'time' || screen === 'done') {
        document.querySelector('.service').click();
        document.getElementById('serviceContinueBtn').click();
        const day = new Date();
        day.setUTCDate(day.getUTCDate() + 3);
        if (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
        const field = document.getElementById('bookingDate');
        field.value = day.toISOString().slice(0, 10);
        field.dispatchEvent(new Event('change', { bubbles: true }));
        [...document.querySelectorAll('.slot')].find(slot => slot.textContent.trim() === '14:00').click();
        if (screen === 'done') {
          await createBooking();
          if (!document.querySelector('#done.active') || !document.querySelector('#done .card p').textContent.includes('не заброньовано')) throw new Error('Demo booking did not finish transparently');
          if (document.getElementById('nativeBookingActions').hidden) throw new Error('Native booking actions missing');
        }
      }
    } else throw new Error('Unknown screenshot screen: ' + screen);
    document.body.dataset.screenshotReady = screen;
  }, { once: true });
})();
