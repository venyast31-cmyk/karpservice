import { authJson, requireAuthSession } from './auth.js';

export async function handleProfileRoute(request, env, headers) {
  if (new URL(request.url).pathname !== '/account/name') return null;
  const reply = (data, status = 200) => authJson(data, status, headers);
  const auth = await requireAuthSession(request, env, headers);
  if (auth.response) return auth.response;
  if (request.method !== 'POST') return reply({ success: false }, 405);
  if (auth.session.auth_provider !== 'apple') return reply({ success: false, error: 'Увійдіть через Apple.' }, 403);
  const body = await request.json().catch(() => null);
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
