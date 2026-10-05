import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { createTransport } from './transport.mjs';
import { reminderDate, notificationId } from './reminder.mjs';
import { createDemoSession } from './demo.mjs';

if (Capacitor.isNativePlatform()) {
  const api = registerPlugin('KarpserviceAPI');
  const appleLogin = async () => {
    const { identityToken } = await api.signInWithApple();
    const res = await api.request({ path:'auth/apple', method:'POST', body:JSON.stringify({identity_token:identityToken}) });
    if (!(res.status >= 200 && res.status < 300) || !res.data?.success) throw new Error(res.data?.error || 'Не вдалося увійти через Apple.');
    if (res.data.phone_linked) await window.loadCustomer?.();
    else {
      window.setAuthSession?.(true);
      window.show?.('profile');
      window.showStatus?.('Підключіть номер телефону та підтвердьте його через Telegram, щоб відкрити авто, історію та запис.', 'ok', 'nativeProfileStatus');
    }
  };
  let booking = null;
  let generation = 0;
  const transport = createTransport(api);
  const demo = createDemoSession(transport);
  const updateDemoUi = () => {
    const banner = document.getElementById('nativeDemoBanner');
    if (banner) banner.hidden = !demo.active;
    const doneTitle = document.querySelector('#done h1');
    if (doneTitle) doneTitle.textContent = demo.active ? 'Пробний запис готовий' : 'Готово!';
    const doneCopy = document.querySelector('#done .card p');
    if (doneCopy) doneCopy.textContent = demo.active
      ? 'Це демонстрація. Візит у сервіс не заброньовано.' : 'Ваш запис на сервіс створено. До зустрічі в Karpservice!';
  };
  window.KarpDemo = {
    start: () => { demo.start(); generation += 1; window.stopTelegramLinkPolling?.(); updateDemoUi(); },
    get active() { return demo.active; }
  };
  window.KarpNative = {
    signInWithApple: appleLogin,
    request: async (path, options) => {
      const capturedGeneration = generation;
      const response = await demo.request(path, options);
      updateDemoUi();
      if (capturedGeneration !== generation && path !== 'auth/logout') throw new Error('Вхід завершено.');
      return response;
    },
    didBook: (details) => {
      booking = { ...details, demo: demo.active };
      const actions = document.getElementById('nativeBookingActions');
      if (actions) actions.hidden = false;
      const status = document.getElementById('nativeBookingStatus');
      if (status) status.textContent = '';
      Haptics.notification({ type: 'SUCCESS' }).catch(() => {});
    },
    didLogout: () => {
      generation += 1;
      booking = null;
      demo.stop();
      updateDemoUi();
      const actions = document.getElementById('nativeBookingActions');
      if (actions) actions.hidden = true;
      LocalNotifications.getPending().then(({ notifications }) => LocalNotifications.cancel({ notifications })).catch(() => {});
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('native-ios');
    document.getElementById('nativeAppleLogin')?.addEventListener('click', () => appleLogin().catch(err => window.showStatus?.(err.message || 'Не вдалося увійти через Apple.')));
    updateDemoUi();
    document.getElementById('nativeDemoStart')?.addEventListener('click', async () => {
      window.KarpDemo.start();
      await window.loadCustomer?.({ targetScreen: 'cars' });
    });
    document.getElementById('nativeDemoExit')?.addEventListener('click', () => window.logout?.());
    document.getElementById('nativeReminder')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const status = document.getElementById('nativeBookingStatus');
      const capturedBooking = booking;
      const capturedGeneration = generation;
      if (!capturedBooking || !reminderDate(capturedBooking.scheduledFor)) {
        status.textContent = 'До запису залишилося замало часу для нагадування.';
        return;
      }
      button.disabled = true;
      try {
        const permission = await LocalNotifications.requestPermissions();
        if (generation !== capturedGeneration || booking !== capturedBooking) return;
        if (permission.display !== 'granted') {
          status.textContent = 'Сповіщення вимкнені. Їх можна дозволити в налаштуваннях iPhone.';
          return;
        }
        const at = reminderDate(capturedBooking.scheduledFor);
        if (!at) { status.textContent = 'Час нагадування вже минув.'; return; }
        const id = notificationId(capturedBooking.scheduledFor);
        await LocalNotifications.schedule({ notifications: [{
          id, title: capturedBooking.demo ? 'Karpservice · Демо' : 'Karpservice',
          body: capturedBooking.demo ? 'Пробне нагадування. Реального візиту немає.' : 'Наближається ваш запис на сервіс.',
          schedule: { at }, extra: { destination: 'profile' }
        }] });
        if (generation !== capturedGeneration) {
          await LocalNotifications.cancel({ notifications: [{ id }] });
          return;
        }
        status.textContent = 'Нагадування додано на цьому iPhone.';
      } catch {
        status.textContent = 'Не вдалося додати нагадування. Спробуйте ще раз.';
      } finally { button.disabled = false; }
    });

    document.getElementById('nativeShareBooking')?.addEventListener('click', async () => {
      if (!booking) return;
      const date = new Intl.DateTimeFormat('uk-UA', {
        timeZone: 'Europe/Kyiv', dateStyle: 'long', timeStyle: 'short'
      }).format(new Date(booking.scheduledFor));
      try {
        await Share.share({ title: 'Запис у Karpservice', text: `${booking.demo ? 'ДЕМО — реального запису немає\n' : ''}${date}\n${booking.car}\n${booking.service}\nБориспіль, Київський Шлях, 10\n073 44 47 344`, dialogTitle: 'Поділитися записом' });
      } catch { /* Closing the share sheet is a normal action. */ }
    });

    document.getElementById('nativeRefresh')?.addEventListener('click', () => window.loadCustomer?.({ targetScreen: 'profile' }));
    document.getElementById('nativeOpenSettings')?.addEventListener('click', () => api.openSettings().catch(() => {}));
    document.getElementById('nativeClearReminders')?.addEventListener('click', async () => {
      const status = document.getElementById('nativeProfileStatus');
      try {
        const { notifications } = await LocalNotifications.getPending();
        await LocalNotifications.cancel({ notifications });
        status.textContent = 'Нагадування видалені з цього iPhone.';
      } catch { status.textContent = 'Не вдалося видалити нагадування. Спробуйте ще раз.'; }
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('.bottom-nav button')) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      const anchor = event.target.closest('a[href]');
      if (!anchor) return;
      const url = new URL(anchor.href);
      if (['https:', 'tel:'].includes(url.protocol)) {
        event.preventDefault();
        api.openExternal({ url: url.href }).catch(() => {
          window.alert('Не вдалося відкрити посилання.');
        });
      }
    });

    const updateConnectivity = () => {
      const banner = document.getElementById('nativeOffline');
      if (banner) banner.hidden = navigator.onLine;
    };
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    updateConnectivity();
  });

  App.addListener('appStateChange', ({ isActive }) => {
    const step = document.getElementById('telegramLinkStep');
    if (isActive && step && !step.hidden) {
      window.stopTelegramLinkPolling?.();
      window.pollTelegramLink?.();
    }
  }).catch(() => {});
}
