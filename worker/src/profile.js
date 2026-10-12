import { authJson, requireAuthSession } from './auth.js';

export async function handleProfileRoute(request, env, headers) {
  const path = new URL(request.url).pathname;
  if (!['/account/name', '/account/birth-date'].includes(path)) return null;
  const reply = (data, status = 200) => authJson(data, status, headers);
  const auth = await requireAuthSession(request, env, headers);
  if (auth.response) return auth.response;
  if (request.method !== 'POST') return reply({ success: false }, 405);
  if (auth.session.auth_provider !== 'apple') return reply({ success: false, error: 'Увійдіть через Apple.' }, 403);
  const body = await request.json().catch(() => null);
  if (path === '/account/birth-date') {
    const birth = body?.birth_date;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const parsed = typeof birth === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(birth) ? new Date(`${birth}T00:00:00Z`) : null;
    if (birth !== '' && (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birth || birth < '1900-01-01' || birth > today)) {
      return reply({ success: false, error: 'Вкажіть коректну дату народження, не пізніше сьогодні.' }, 400);
    }
    const updated = await env.AUTH_DB.prepare('UPDATE apple_accounts SET birth_date = ? WHERE subject_hash = ? AND disabled_at IS NULL RETURNING subject_hash')
      .bind(birth || null, auth.session.apple_subject_hash).first();
    if (!updated) return reply({ success: false, error: 'Увійдіть у профіль ще раз.' }, 401);
    return reply({ success: true, birth_date: birth });
  }
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/gu, ' ') : '';
  if (!name || name.length > 160 || /[\u0000-\u001f\u007f]/u.test(body.name)) {
    return reply({ success: false, error: 'Введіть ім’я від 1 до 160 символів.' }, 400);
  }
  // The authenticated Apple subject is the only account selector; never trust a client ID.
  const updated = await env.AUTH_DB.prepare('UPDATE apple_accounts SET profile_name = ? WHERE subject_hash = ? AND disabled_at IS NULL RETURNING subject_hash')
    .bind(name, auth.session.apple_subject_hash).first();
  if (!updated) return reply({ success: false, error: 'Увійдіть у профіль ще раз.' }, 401);
  return reply({ success: true, name });
}
