import { authJson, consumeRateLimit, getAuthSession, randomToken, sha256Hex, safeEqual } from './auth.js';

const CLIENT_ID = 'ua.karpservice.client';
const TEAM_ID = 'L6W4586456';
const ISSUER = 'https://appleid.apple.com';
const SESSION_SECONDS = 7 * 86400;
const encoder = new TextEncoder();
let publicKeys = { keys: [], until: 0 };
const now = () => Math.floor(Date.now() / 1000);
const fail = (message = 'Не вдалося підтвердити вхід через Apple.', status = 401) => Object.assign(new Error(message), { status });
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unb64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw fail();
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), x => x.charCodeAt(0));
}

export function appleConfigured(env) {
  return Boolean(env.AUTH_DB && env.SESSION_SECRET && env.APPLE_SIGN_IN_KEY_ID && env.APPLE_SIGN_IN_PRIVATE_KEY);
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > 16384) throw fail('Запит завеликий.', 400);
  try { const data = JSON.parse(raw); if (data && typeof data === 'object' && !Array.isArray(data)) return data; } catch {}
  throw fail('Некоректний запит.', 400);
}

// Only Apple's pinned issuer/JWKS origin is used; JWT headers never choose URLs.
export async function verifyAppleIdentity(token, expectedNonce) {
  if (typeof token !== 'string' || token.length > 12000) throw fail();
  const parts = token.split('.');
  if (parts.length !== 3) throw fail();
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(unb64(parts[1])));
  } catch { throw fail(); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 100) throw fail();
  if (publicKeys.until <= now() || !publicKeys.keys.some(key => key.kid === header.kid)) {
    const response = await fetch(`${ISSUER}/auth/keys`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw fail('Apple тимчасово недоступна. Спробуйте ще раз.', 503);
    const data = await response.json();
    if (!Array.isArray(data.keys)) throw fail();
    publicKeys = { keys: data.keys, until: now() + 3600 };
  }
  const jwk = publicKeys.keys.find(key => key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig');
  if (!jwk) throw fail();
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid || claims.iss !== ISSUER || claims.aud !== CLIENT_ID ||
      !Number.isFinite(claims.exp) || claims.exp <= now() ||
      !Number.isFinite(claims.iat) || claims.iat > now() + 60 || claims.iat < now() - 600 ||
      !safeEqual(claims.nonce, expectedNonce) || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 256) throw fail();
  return claims;
}

async function clientSecret(env) {
  if (!/^[A-Z0-9]{10}$/.test(env.APPLE_SIGN_IN_KEY_ID || '')) throw fail('Вхід через Apple ще не налаштований.', 503);
  const pem = String(env.APPLE_SIGN_IN_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const der = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(der), x => x.charCodeAt(0)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64(encoder.encode(JSON.stringify({ alg: 'ES256', kid: env.APPLE_SIGN_IN_KEY_ID })));
  const payload = b64(encoder.encode(JSON.stringify({ iss: TEAM_ID, iat: now(), exp: now() + 300, aud: ISSUER, sub: CLIENT_ID })));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64(signature)}`;
}

async function appleTokenRequest(env, path, fields) {
  const response = await fetch(`${ISSUER}/auth/${path}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: await clientSecret(env), ...fields })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    // Never log tokens, authorization codes, Apple response bodies, or private keys.
    throw fail(data.error === 'invalid_grant' ? 'Вхід через Apple завершився. Увійдіть ще раз.' : 'Не вдалося перевірити вхід у Apple. Спробуйте ще раз.', data.error === 'invalid_grant' ? 401 : 503);
  }
  return data;
}

async function encryptionKey(env) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(CLIENT_ID), info: encoder.encode('apple-refresh-token-v1') }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(env, value, subject) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(subject) }, await encryptionKey(env), encoder.encode(value));
  return `${b64(iv)}.${b64(encrypted)}`;
}
async function unseal(env, value, subject) {
  const [iv, encrypted] = value.split('.');
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: encoder.encode(subject) }, await encryptionKey(env), unb64(encrypted));
  return new TextDecoder().decode(bytes);
}

export async function getAppleSession(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!/^apple_[A-Za-z0-9_-]{43}$/.test(token) || !env.AUTH_DB) return null;
  const row = await env.AUTH_DB.prepare(`SELECT a.*, s.token_hash, s.expires_at, s.created_at AS session_created_at
    FROM apple_sessions s JOIN apple_accounts a ON a.subject_hash = s.subject_hash
    WHERE s.token_hash = ? AND s.expires_at > ? AND a.disabled_at IS NULL`)
    .bind(await sha256Hex(`session:${token}`), now()).first();
  if (!row) return null;
  if (Number(row.validated_at) < now() - 86400) {
    try {
      await appleTokenRequest(env, 'token', { grant_type: 'refresh_token', refresh_token: await unseal(env, row.refresh_token, row.subject_hash) });
      await env.AUTH_DB.prepare('UPDATE apple_accounts SET validated_at = ? WHERE subject_hash = ?').bind(now(), row.subject_hash).run();
    } catch (error) {
      if (error.status !== 401) throw error;
      await env.AUTH_DB.prepare('DELETE FROM apple_sessions WHERE subject_hash = ?').bind(row.subject_hash).run();
      return null;
    }
  }
  return { ...row, auth_provider: 'apple', apple_subject_hash: row.subject_hash, customer_id: Number(row.customer_id || 0), created_at: row.session_created_at };
}

export async function handleAppleAuthRoute(request, env, headers) {
  const path = new URL(request.url).pathname;
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const appleRoute = path.startsWith('/auth/apple/');
  if (!appleRoute && !(token.startsWith('apple_') && ['/auth/me', '/auth/logout'].includes(path))) return null;
  const reply = (data, status = 200) => authJson(data, status, headers);
  if (!appleConfigured(env)) return reply({ success: false, error: 'Вхід через Apple тимчасово недоступний.' }, 503);
  if (path === '/auth/logout' && request.method === 'POST') {
    await env.AUTH_DB.prepare('DELETE FROM apple_sessions WHERE token_hash = ?').bind(await sha256Hex(`session:${token}`)).run();
    return reply({ success: true });
  }
  if (path === '/auth/me' && request.method === 'GET') {
    const session = await getAppleSession(request, env);
    return session ? reply({ success: true, auth_provider: 'apple', expires_at: session.expires_at }) : reply({ success: false, error: 'Увійдіть у профіль.' }, 401);
  }
  if (request.method !== 'POST') return reply({ success: false, error: 'Метод не підтримується.' }, 405);
  if (!await consumeRateLimit(env, `apple:${request.headers.get('CF-Connecting-IP') || 'unknown'}`, 30, 900)) return reply({ success: false, error: 'Забагато спроб. Спробуйте пізніше.' }, 429);
  const body = await readBody(request);
  if (path === '/auth/apple/start') {
    let link = null;
    if (env.APPLE_ONLY_AUTH === 'true' && body.mode !== 'login') return reply({success:false,error:'Спочатку увійдіть через Apple, потім підключіть номер.'},400);
    if (body.mode === 'link') {
      link = await getAuthSession(request, env);
      if (!link || link.auth_provider === 'apple' || Number(link.created_at) < now() - 300) return reply({ success: false, error: 'Для підключення Apple спочатку увійдіть у наявний профіль через Telegram ще раз.' }, 401);
    } else if (body.mode !== 'login') return reply({ success: false, error: 'Некоректний спосіб входу.' }, 400);
    const id = randomToken(24), nonce = await sha256Hex(randomToken(32));
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare('DELETE FROM apple_challenges WHERE expires_at <= ?').bind(now()),
      env.AUTH_DB.prepare('DELETE FROM apple_sessions WHERE expires_at <= ?').bind(now()),
      env.AUTH_DB.prepare('INSERT INTO apple_challenges(id,nonce,link_session_hash,created_at,expires_at) VALUES(?,?,?,?,?)')
        .bind(id, nonce, link?.token_hash || null, now(), now() + 300)
    ]);
    return reply({ success: true, challenge_id: id, nonce });
  }
  if (path !== '/auth/apple/complete') return reply({ success: false, error: 'Маршрут не знайдено.' }, 404);
  if (!/^[A-Za-z0-9_-]{32}$/.test(body.challenge_id || '') || typeof body.authorization_code !== 'string' || !body.authorization_code || body.authorization_code.length > 4096) throw fail();
  const challenge = await env.AUTH_DB.prepare('SELECT * FROM apple_challenges WHERE id = ? AND expires_at > ?').bind(body.challenge_id, now()).first();
  if (!challenge) throw fail('Спроба входу завершилася. Почніть знову.');
  let linkedSession;
  if (challenge.link_session_hash) {
    linkedSession = await getAuthSession(request, env);
    if (!linkedSession || !safeEqual(linkedSession.token_hash, challenge.link_session_hash) || linkedSession.auth_provider === 'apple') throw fail();
  }
  const identity = await verifyAppleIdentity(body.identity_token, challenge.nonce);
  const claimed = await env.AUTH_DB.prepare('DELETE FROM apple_challenges WHERE id = ? AND expires_at > ? RETURNING id').bind(challenge.id, now()).first();
  if (!claimed) throw fail('Цю спробу входу вже використано.');
  const tokens = await appleTokenRequest(env, 'token', { grant_type: 'authorization_code', code: body.authorization_code });
  const exchanged = await verifyAppleIdentity(tokens.id_token, challenge.nonce);
  if (exchanged.sub !== identity.sub || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) throw fail();
  const subject = await sha256Hex(`apple:${identity.sub}`);
  const existing = await env.AUTH_DB.prepare('SELECT * FROM apple_accounts WHERE subject_hash = ?').bind(subject).first();
  if (existing?.disabled_at) throw fail('Для цього профілю вже подано запит на видалення. Зверніться до сервісу.', 403);
  const email = String(identity.email || existing?.email || '');
  if ((!existing && ![true, 'true'].includes(identity.email_verified)) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw fail();
  const name = existing?.customer_name || String(body.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160) || 'Клієнт Karpservice';
  // Never merge by name, email, client-supplied phone, VIN, or customer ID.
  if (linkedSession && existing && !existing.customer_id && existing.crm_creation_started_at !== null) throw fail('Профіль синхронізується або видаляється. Спробуйте пізніше.', 409);
  if (linkedSession && existing?.customer_id && Number(existing.customer_id) !== Number(linkedSession.customer_id)) throw fail('Цей Apple Account уже підключений до іншого профілю Karpservice.', 409);
  if (linkedSession) {
    const other = await env.AUTH_DB.prepare('SELECT subject_hash FROM apple_accounts WHERE customer_id = ?').bind(Number(linkedSession.customer_id)).first();
    if (other && other.subject_hash !== subject) throw fail('До цього профілю вже підключений інший Apple Account.', 409);
  }
  const encryptedRefresh = await seal(env, tokens.refresh_token, subject);
  await env.AUTH_DB.prepare(`INSERT INTO apple_accounts(subject_hash,customer_id,customer_name,email,phone,refresh_token,created_at,validated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(subject_hash) DO UPDATE SET refresh_token=excluded.refresh_token, validated_at=excluded.validated_at`)
    .bind(subject, linkedSession?.customer_id || null, linkedSession?.customer_name || name, email, linkedSession?.phone || '', encryptedRefresh, now(), now()).run();
  if (linkedSession && !existing?.customer_id) {
    await env.AUTH_DB.prepare('UPDATE apple_accounts SET customer_id=?,customer_name=?,phone=? WHERE subject_hash=? AND customer_id IS NULL AND crm_creation_started_at IS NULL AND disabled_at IS NULL')
      .bind(linkedSession.customer_id, linkedSession.customer_name, linkedSession.phone, subject).run();
    const bound = await env.AUTH_DB.prepare('SELECT customer_id FROM apple_accounts WHERE subject_hash=? AND disabled_at IS NULL').bind(subject).first();
    if (Number(bound?.customer_id) !== Number(linkedSession.customer_id)) throw fail('Профіль змінився під час входу. Спробуйте ще раз.', 409);
  }
  const rawToken = `apple_${randomToken(32)}`;
  const expires = now() + SESSION_SECONDS;
  await env.AUTH_DB.prepare('INSERT INTO apple_sessions(token_hash,subject_hash,created_at,expires_at) VALUES(?,?,?,?)')
    .bind(await sha256Hex(`session:${rawToken}`), subject, now(), expires).run();
  return reply({ success: true, token: rawToken, token_type: 'Bearer', expires_at: expires, auth_provider: 'apple' });
}

export async function ensureAppleCustomer(env, session) {
  if (session.auth_provider !== 'apple' || session.customer_id > 0) return session.customer_id;
  // Create a separate CRM record only when the user first adds a vehicle.
  // An uncertain external creation is not blindly retried or matched by email.
  const account = await env.AUTH_DB.prepare(`UPDATE apple_accounts SET crm_creation_started_at = ?
    WHERE subject_hash = ? AND customer_id IS NULL AND crm_creation_started_at IS NULL AND disabled_at IS NULL RETURNING *`)
    .bind(now(), session.apple_subject_hash).first();
  if (!account) {
    const current = await env.AUTH_DB.prepare('SELECT customer_id FROM apple_accounts WHERE subject_hash = ?').bind(session.apple_subject_hash).first();
    if (current?.customer_id) return Number(current.customer_id);
    throw fail('Профіль синхронізується із сервісом. Спробуйте пізніше або зверніться до підтримки.', 409);
  }
  const response = await fetch('https://api.roapp.io/v2/contacts/people', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${env.ROAPP_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ first_name: account.customer_name, email: account.email, phones: [], notes: 'Профіль створено клієнтом через Sign in with Apple у Karpservice. Не об’єднуйте автоматично з іншими контактами.' })
  });
  const data = await response.json().catch(() => null);
  const id = Number(data?.data?.id || data?.person?.id || data?.id);
  if (!response.ok || !Number.isSafeInteger(id) || id <= 0) throw fail('Не вдалося створити профіль у сервісі. Зверніться до підтримки.', 502);
  await env.AUTH_DB.prepare('UPDATE apple_accounts SET customer_id = ? WHERE subject_hash = ? AND customer_id IS NULL').bind(id, account.subject_hash).run();
  return id;
}

export async function revokeAppleAccount(env, subject) {
  const row = await env.AUTH_DB.prepare('SELECT * FROM apple_accounts WHERE subject_hash = ?').bind(subject).first();
  if (!row || !row.refresh_token) return;
  await appleTokenRequest(env, 'revoke', { token: await unseal(env, row.refresh_token, subject), token_type_hint: 'refresh_token' });
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare('UPDATE apple_accounts SET refresh_token = ?, disabled_at = ? WHERE subject_hash = ?').bind('', now(), subject),
    env.AUTH_DB.prepare('DELETE FROM apple_sessions WHERE subject_hash = ?').bind(subject)
  ]);
}
