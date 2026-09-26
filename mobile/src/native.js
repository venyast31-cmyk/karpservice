import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { createTransport } from './transport.mjs';
import { reminderDate, notificationId } from './reminder.mjs';

if (Capacitor.isNativePlatform()) {
  const api = registerPlugin('KarpserviceAPI');
  let booking = null;
  let generation = 0;
  const transport = createTransport(api);
  window.KarpNative = {
    request: async (path, options) => {
      const capturedGeneration = generation;
      const response = await transport(path, options);
      if (capturedGeneration !== generation && path !== 'auth/logout') throw new Error('Вхід завершено.');
      return response;
    },
    didBook: (details) => {
      booking = { ...details };
      const actions = document.getElementById('nativeBookingActions');
      if (actions) actions.hidden = false;
      const status = document.getElementById('nativeBookingStatus');
      if (status) status.textContent = '';
      Haptics.notification({ type: 'SUCCESS' }).catch(() => {});
    },
    didLogout: () => {
      generation += 1;
      booking = null;
      LocalNotifications.getPending().then(({ notifications }) => LocalNotifications.cancel({ notifications })).catch(() => {});
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('native-ios');
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
          id, title: 'Karpservice', body: 'Наближається ваш запис на сервіс.',
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
        await Share.share({ title: 'Запис у Karpservice', text: `${date}\n${booking.car}\n${booking.service}\nБориспіль, Київський Шлях, 10\n073 44 47 344`, dialogTitle: 'Поділитися записом' });
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
