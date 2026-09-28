import { createDemoSession } from '../../mobile/src/demo.mjs';
import { consumeRateLimit, normalizeUkrainianPhone, randomToken, sha256Hex, safeEqual } from './auth.js';

export async function passwordHash(password, salt) {
  const encode = value => new TextEncoder().encode(value);
  const key = await crypto.subtle.importKey('raw', encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function handleReviewAccount(request, env, headers) {
  const url = new URL(request.url);
  const login = url.pathname === '/auth/password';
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  // Reserved prefix always terminates here, including invalid/expired sessions.
  if (!login && !token.startsWith('review_')) return null;
  const reply = (data, status = 200) => Response.json(data, { status, headers });
  const error = (message, status) => reply({ success: false, error: message }, status);
  if (!env.AUTH_DB || !env.SESSION_SECRET) return error('Вхід тимчасово недоступний.', 503);
  const now = Math.floor(Date.now() / 1000);
  if (login) {
    if (request.method !== 'POST') return error('Метод не підтримується.', 405);
    if (!await consumeRateLimit(env, `review-ip:${request.headers.get('CF-Connecting-IP') || 'unknown'}`, 20, 900)) return error('Забагато спроб. Спробуйте пізніше.', 429);
    const raw = await request.text();
    if (raw.length > 2048) return error('Некоректний запит.', 400);
    let body; try { body = JSON.parse(raw); } catch { return error('Некоректний запит.', 400); }
    const phone = normalizeUkrainianPhone(body?.phone);
    const password = body?.password;
    if (!/^380\d{9}$/.test(phone) || typeof password !== 'string' || password.length < 12 || password.length > 128) return error('Невірний номер або пароль.', 401);
    if (!await consumeRateLimit(env, `review-phone:${phone}`, 20, 900)) return error('Забагато спроб. Спробуйте пізніше.', 429);
    const account = await env.AUTH_DB.prepare('SELECT * FROM review_accounts WHERE phone = ?').bind(phone).first();
    const candidate = await passwordHash(password, account?.password_salt || 'missing-account');
    if (!account || account.disabled || !safeEqual(candidate, account.password_hash)) return error('Невірний номер або пароль.', 401);
    const rawToken = `review_${randomToken(32)}`;
    await env.AUTH_DB.prepare('DELETE FROM review_sessions WHERE expires_at <= ?').bind(now).run();
    await env.AUTH_DB.prepare('INSERT INTO review_sessions (token_hash, phone, expires_at) SELECT ?, phone, ? FROM review_accounts WHERE phone = ? AND disabled = 0')
      .bind(await sha256Hex(rawToken), now + 86400, phone).run();
    return reply({ success: true, token: rawToken, expires_at: now + 86400, review_account: true });
  }
  if (!/^review_[A-Za-z0-9_-]{43}$/.test(token)) return error('Сесія завершена.', 401);
  const hash = await sha256Hex(token);
  const account = await env.AUTH_DB.prepare('SELECT a.* FROM review_accounts a JOIN review_sessions s ON s.phone = a.phone WHERE s.token_hash = ? AND s.expires_at > ? AND a.disabled = 0').bind(hash, now).first();
  if (!account) return error('Сесія завершена.', 401);
  if (url.pathname === '/auth/logout' && request.method === 'POST') {
    await env.AUTH_DB.prepare('DELETE FROM review_sessions WHERE token_hash = ?').bind(hash).run();
    return reply({ success: true });
  }
  if (url.pathname === '/auth/me' && request.method === 'GET') return reply({ success: true, review_account: true });
  if (url.pathname === '/account/deletion-policy' && request.method === 'GET') return reply({ success: true, review_account: true, days: 0 });
  if (url.pathname === '/account/deletion' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (body?.confirmed !== true) return error('Підтвердьте видалення.', 400);
    // Erase the isolated account and all its sessions; a new login cannot recreate it.
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare('DELETE FROM review_sessions WHERE phone = ?').bind(account.phone),
      env.AUTH_DB.prepare('DELETE FROM review_accounts WHERE phone = ?').bind(account.phone)
    ]);
    return reply({ success: true, review_account: true, status: 'deleted' });
  }
  const allowed = { '/': 'GET', '/order': 'GET', '/cars': 'POST', '/cars/remove': 'POST', '/booking': 'POST', '/availability': 'GET' };
  if (allowed[url.pathname] !== request.method) return error('Маршрут недоступний.', 403);
  if (url.pathname === '/availability') return reply({ success: true, bookings: [], review_account: true });
  const tour = createDemoSession(() => { throw new Error('Review account cannot access live transport'); });
  tour.start(account.state_json);
  const response = await tour.request(url.pathname.slice(1) + url.search, { method: request.method, ...(request.method === 'POST' ? { body: await request.text() } : {}) });
  const data = await response.json();
  if (request.method === 'POST' && response.ok) {
    const changed = await env.AUTH_DB.prepare('UPDATE review_accounts SET state_json = ?, revision = revision + 1 WHERE phone = ? AND revision = ? AND disabled = 0 RETURNING revision').bind(tour.snapshot(), account.phone, account.revision).first();
    if (!changed) return error('Дані змінилися. Оновіть сторінку та повторіть дію.', 409);
  }
  return reply({ ...data, review_account: true }, response.status);
}
