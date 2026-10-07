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
  let booking = null;
  let generation = 0;
  let reviewAccount = false;
  const transport = createTransport(api);
  const demo = createDemoSession(transport);
  const updateDemoUi = () => {
    const banner = document.getElementById('nativeDemoBanner');
    if (banner) {
      banner.hidden = !(demo.active || reviewAccount);
      const copy = banner.querySelector('div');
      if (copy) copy.innerHTML = reviewAccount
        ? '<strong>Тестовий акаунт · вигадані дані</strong>Дані зберігаються на сервері. Справжній візит не створюється.'
        : '<strong>Демо · вигадані дані</strong>Записи залишаються на цьому пристрої.';
    }
    const doneTitle = document.querySelector('#done h1');
    if (doneTitle) doneTitle.textContent = (demo.active || reviewAccount) ? 'Пробний запис готовий' : 'Готово!';
    const doneCopy = document.querySelector('#done .card p');
    if (doneCopy) doneCopy.textContent = (demo.active || reviewAccount)
      ? 'Це демонстрація. Візит у сервіс не заброньовано.' : 'Ваш запис на сервіс створено. До зустрічі в Karpservice!';
  };
  window.KarpDemo = {
    start: () => { demo.start(); generation += 1; window.stopTelegramLinkPolling?.(); updateDemoUi(); },
    get active() { return demo.active; }
  };
  window.KarpNative = {
    request: async (path, options) => {
      const capturedGeneration = generation;
      const response = await demo.request(path, options);
      const payload = await response.clone().json().catch(() => null);
      if (capturedGeneration === generation && payload?.success && payload.review_account === true) reviewAccount = true;
      updateDemoUi();
      if (capturedGeneration !== generation && path !== 'auth/logout') throw new Error('Вхід завершено.');
      return response;
    },
    didBook: (details) => {
      booking = { ...details, demo: demo.active || reviewAccount };
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
      reviewAccount = false;
      updateDemoUi();
      const actions = document.getElementById('nativeBookingActions');
      if (actions) actions.hidden = true;
      LocalNotifications.getPending().then(({ notifications }) => LocalNotifications.cancel({ notifications })).catch(() => {});
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('native-ios');
    updateDemoUi();
    const appleButton = document.getElementById('nativeAppleLogin');
    if (appleButton) api.appleButtonArtwork({ width: appleButton.getBoundingClientRect().width || 320 }).then(({ image }) => {
      if (!/^data:image\/png;base64,/.test(image || '')) return;
      const img = document.createElement('img');
      img.src = image;
      img.alt = 'Увійти через Apple';
      appleButton.replaceChildren(img);
    }).catch(() => {});
    const appleLogin = async (button, mode, status) => {
      button.disabled = true;
      status.textContent = '';
      const capturedGeneration = generation;
      try {
        const result = await api.signInWithApple({ mode });
        if (result.cancelled || capturedGeneration !== generation) return;
        if (!result.success || !result.session_stored) throw new Error('Не вдалося зберегти вхід.');
        demo.stop();
        reviewAccount = false;
        generation += 1;
        window.stopTelegramLinkPolling?.();
        updateDemoUi();
        await window.loadCustomer?.({ targetScreen: 'home' });
      } catch (error) { if (capturedGeneration === generation) status.textContent = error?.message || 'Не вдалося увійти через Apple.'; }
      finally { button.disabled = false; }
    };
    appleButton?.addEventListener('click', event => appleLogin(event.currentTarget, 'login', document.getElementById('nativeAppleStatus')));
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
    document.getElementById('nativeDeleteAccount')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const status = document.getElementById('nativeProfileStatus');
      const capturedGeneration = generation;
      button.disabled = true;
      try {
        const policyResponse = await window.KarpNative.request('account/deletion-policy');
        const policy = await policyResponse.json();
        if (!policyResponse.ok || !policy.success) throw new Error(policy.error);
        if (capturedGeneration !== generation) return;
        const message = policy.apple_account && policy.immediate
          ? 'Видалити профіль Karpservice та відкликати доступ через Apple? Цю дію не можна скасувати. Ваш Apple Account залишиться без змін.'
          : policy.review_account
          ? 'Видалити серверні дані тестового акаунта та закрити доступ до нього? Цю дію не можна скасувати в застосунку.'
          : demo.active
          ? 'Це пробний запит із вигаданими даними. Реальні дані та повідомлення сервісу не зміняться. Продовжити?'
          : `Ви подаєте запит на видалення профілю, прив’язок входу, автомобілів та історії обслуговування. Сервіс виконає його протягом ${policy.days} календарних днів. Доступ через підключений Apple Account буде відкликано. Якщо окремі документи необхідно зберегти за законом, сервіс пояснить обсяг і підставу. Підтвердити запит?`;
        if (!window.confirm(message)) return;
        const response = await window.KarpNative.request('account/deletion', { method: 'POST', body: JSON.stringify({ confirmed: true }) });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error);
        if (capturedGeneration !== generation) return;
        if (data.status === 'deleted') { window.logout?.(); window.alert(data.apple_account ? 'Профіль Karpservice видалено. Доступ через Apple відкликано.' : 'Тестовий акаунт і його дані видалено.'); return; }
        if (data.signed_out) { window.logout?.(); window.alert(`Запит ${data.request_id} прийнято. Доступ через Apple відкликано. Видалення даних сервісу буде завершене до ${new Date(data.deadline_at * 1000).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' })}. Збережіть номер запиту для звернення до підтримки.`); return; }
        status.textContent = demo.active ? 'Демонстрація завершена. Справжній запит на видалення не надіслано.'
          : `Запит ${data.request_id} прийнято. Видалення ще не завершене. Строк виконання — до ${new Date(data.deadline_at * 1000).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' })}. Сервіс повідомить результат за вашим підтвердженим номером.`;
      } catch (error) {
        if (capturedGeneration === generation) status.textContent = error?.message || 'Не вдалося подати запит. Спробуйте ще раз.';
      } finally { button.disabled = false; }
    });
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
