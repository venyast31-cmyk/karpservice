import { authJson, requireAuthSession } from './auth.js';

// Requests start in the authenticated app. Staff complete the deletion across
// CRM and authentication storage; accepting a request never claims completion.
export async function handleDeletionRoute(request, env, headers) {
  const path = new URL(request.url).pathname;
  if (!['/account/deletion-policy', '/account/deletion'].includes(path)) return null;
  const auth = await requireAuthSession(request, env, headers);
  if (auth.response) return auth.response;
  const reply = (data, status = 200) => authJson(data, status, headers);
  const days = Number(env.ACCOUNT_DELETION_DAYS);
  // The operator must confirm an actual service deadline before enabling this.
  if (!Number.isInteger(days) || days < 1 || days > 30 || !env.TELEGRAM_CHAT_ID) {
    return reply({ success: false, error: 'Подання запиту тимчасово недоступне. Спробуйте пізніше.' }, 503);
  }
  if (path === '/account/deletion-policy' && request.method === 'GET') {
    return reply({ success: true, days });
  }
  if (path !== '/account/deletion' || request.method !== 'POST') {
    return reply({ success: false, error: 'Метод не підтримується.' }, 405);
  }
  let body;
  try { body = await request.json(); } catch { /* handled below */ }
  if (body?.confirmed !== true) {
    return reply({ success: false, error: 'Підтвердьте запит на видалення.' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const customerId = Number(auth.session.customer_id);
  // Idempotent per customer. Identity always comes from the verified session.
  await env.AUTH_DB.prepare(`INSERT INTO deletion_requests
    (customer_id, request_id, phone, customer_name, created_at, deadline_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(customer_id) DO NOTHING`)
    .bind(customerId, crypto.randomUUID(), auth.session.phone,
      auth.session.customer_name || '', now, now + days * 86400).run();
  const pending = await env.AUTH_DB.prepare('SELECT * FROM deletion_requests WHERE customer_id = ?')
    .bind(customerId).first();
  if (!pending.notified_at) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: [
          'Запит клієнта на видалення профілю та пов’язаних даних Karpservice',
          `Номер: ${pending.request_id}`,
          `Клієнт: ${pending.customer_name}; CRM ID: ${pending.customer_id}`,
          `Телефон: ${pending.phone}`,
          `Виконати до: ${new Date(pending.deadline_at * 1000).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' })}`,
          'Запит подано з підтвердженого профілю. Видаліть дані CRM, авто та історію, прив’язку Telegram і всі сесії. Повідомте клієнту результат; якщо щось необхідно зберегти за законом — обсяг і підставу.'
        ].join('\n') })
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error('Notification unavailable');
      await env.AUTH_DB.prepare('UPDATE deletion_requests SET notified_at = ? WHERE customer_id = ?')
        .bind(now, customerId).run();
    } catch {
      // Keep the request for a retry. Do not falsely show a delivered request.
      return reply({ success: false, error: 'Не вдалося підтвердити передавання запиту сервісу. Повторіть спробу; повторний запит не створить дубль.' }, 502);
    }
  }
  return reply({ success: true, request_id: pending.request_id,
    deadline_at: pending.deadline_at, status: 'pending' });
}
