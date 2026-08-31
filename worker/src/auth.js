const OTP_TTL_SECONDS = 5 * 60;
const LINK_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_OTP_ATTEMPTS = 5;
const DEFAULT_ORIGIN = "https://karpservice-app.pages.dev";

let telegramBotCache = null;
let telegramBotCacheUntil = 0;
let webhookConfiguredUntil = 0;

export function authConfigured(env) {
  return Boolean(
    env.AUTH_DB &&
    env.SESSION_SECRET &&
    env.TELEGRAM_BOT_TOKEN &&
    env.TELEGRAM_WEBHOOK_SECRET
  );
}

export function corsHeadersFor(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGIN)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const isProjectPreview = Boolean(
    origin && /^https:\/\/[a-z0-9-]+\.karpservice-app\.pages\.dev$/i.test(origin)
  );
  const isAllowed = Boolean(origin && (allowedOrigins.includes(origin) || isProjectPreview));
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
  if (isAllowed) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function authJson(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}

export async function handleAuthRoute({
  request,
  env,
  ctx,
  headers,
  findCustomerByPhone
}) {
  const url = new URL(request.url);

  if (url.pathname === "/telegram/webhook" && request.method === "POST") {
    if (!authConfigured(env)) {
      return authJson({ success: false }, 503, headers);
    }
    const providedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
    if (!safeEqual(providedSecret, String(env.TELEGRAM_WEBHOOK_SECRET))) {
      return authJson({ success: false }, 403, headers);
    }
    const update = await readJson(request);
    if (!update) return authJson({ success: false }, 400, headers);
    ctx.waitUntil(
      processTelegramUpdate(env, update, findCustomerByPhone).catch((error) => {
        console.error(JSON.stringify({
          event: "telegram_auth_webhook",
          success: false,
          message: error instanceof Error ? error.message : String(error)
        }));
      })
    );
    return authJson({ success: true }, 200, headers);
  }

  if (!url.pathname.startsWith("/auth/")) return null;
  if (!authConfigured(env)) {
    return authJson({
      success: false,
      error: "Підтвердження через Telegram ще не налаштоване"
    }, 503, headers);
  }

  ctx.waitUntil(cleanupExpiredAuthData(env));

  if (url.pathname === "/auth/request" && request.method === "POST") {
    return requestTelegramAuth(request, env, headers);
  }
  if (url.pathname === "/auth/link-status" && request.method === "POST") {
    return getTelegramLinkStatus(request, env, headers);
  }
  if (url.pathname === "/auth/verify" && request.method === "POST") {
    return verifyTelegramCode(request, env, headers, findCustomerByPhone);
  }
  if (url.pathname === "/auth/me" && request.method === "GET") {
    const session = await getAuthSession(request, env);
    if (!session) return unauthorized(headers);
    return authJson({
      success: true,
      phone_masked: maskPhone(session.phone),
      expires_at: session.expires_at
    }, 200, headers);
  }
  if (url.pathname === "/auth/logout" && request.method === "POST") {
    const token = bearerToken(request);
    if (token) {
      await env.AUTH_DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
        .bind(await sha256Hex(`session:${token}`))
        .run();
    }
    return authJson({ success: true }, 200, headers);
  }

  return authJson({ success: false, error: "Маршрут не знайдено" }, 404, headers);
}

export async function requireAuthSession(request, env, headers) {
  if (!authConfigured(env)) {
    return {
      response: authJson({
        success: false,
        error: "Підтвердження через Telegram ще не налаштоване"
      }, 503, headers)
    };
  }
  const session = await getAuthSession(request, env);
  if (!session) return { response: unauthorized(headers) };
  return { session };
}

async function requestTelegramAuth(request, env, headers) {
  const body = await readJson(request);
  const phone = normalizeUkrainianPhone(body?.phone);
  if (!isValidUkrainianPhone(phone)) {
    return authJson({ success: false, error: "Перевірте номер телефону" }, 400, headers);
  }

  const ipKey = await requestIpKey(request, env);
  if (!await consumeRateLimit(env, `auth-request-ip:${ipKey}`, 12, 60 * 60)) {
    return tooManyRequests(headers);
  }
  if (!await consumeRateLimit(env, `auth-request-phone:${phone}`, 6, 60 * 60)) {
    return tooManyRequests(headers);
  }

  const telegramLink = await env.AUTH_DB.prepare(
    "SELECT phone, telegram_user_id, chat_id FROM telegram_links WHERE phone = ?"
  ).bind(phone).first();

  if (telegramLink?.chat_id) {
    const challenge = await createAndSendOtp(env, telegramLink);
    if (challenge.cooldown) {
      return authJson({
        success: false,
        error: "Зачекайте хвилину перед повторним надсиланням коду",
        retry_after: challenge.retryAfter
      }, 429, headers);
    }
    return authJson({
      success: true,
      stage: "code",
      challenge_id: challenge.id,
      phone_masked: maskPhone(phone),
      expires_in: OTP_TTL_SECONDS
    }, 200, headers);
  }

  const bot = await ensureTelegramWebhook(env);
  const rawToken = randomToken(24);
  const tokenHash = await sha256Hex(`link:${rawToken}`);
  const now = unixTime();
  await env.AUTH_DB.prepare(
    `INSERT INTO link_requests
      (token_hash, phone, state, created_at, expires_at)
     VALUES (?, ?, 'pending', ?, ?)`
  ).bind(tokenHash, phone, now, now + LINK_TTL_SECONDS).run();

  return authJson({
    success: true,
    stage: "telegram_link",
    link_token: rawToken,
    link_url: `https://t.me/${encodeURIComponent(bot.username)}?start=${encodeURIComponent(rawToken)}`,
    phone_masked: maskPhone(phone),
    expires_in: LINK_TTL_SECONDS
  }, 200, headers);
}

async function getTelegramLinkStatus(request, env, headers) {
  const body = await readJson(request);
  const rawToken = String(body?.link_token || "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(rawToken)) {
    return authJson({ success: false, error: "Некоректний запит" }, 400, headers);
  }
  const ipKey = await requestIpKey(request, env);
  if (!await consumeRateLimit(env, `link-status:${ipKey}`, 180, 15 * 60)) {
    return tooManyRequests(headers);
  }
  const tokenHash = await sha256Hex(`link:${rawToken}`);
  const row = await env.AUTH_DB.prepare(
    `SELECT state, challenge_id, expires_at
       FROM link_requests
      WHERE token_hash = ?`
  ).bind(tokenHash).first();
  if (!row || Number(row.expires_at) <= unixTime()) {
    return authJson({ success: true, stage: "expired" }, 200, headers);
  }
  if (row.state === "otp_sent" && row.challenge_id) {
    return authJson({
      success: true,
      stage: "code",
      challenge_id: row.challenge_id,
      expires_in: OTP_TTL_SECONDS
    }, 200, headers);
  }
  if (row.state === "failed") {
    return authJson({
      success: true,
      stage: "failed",
      error: "Не вдалося прив’язати Telegram до цього номера"
    }, 200, headers);
  }
  return authJson({ success: true, stage: row.state || "pending" }, 200, headers);
}

async function verifyTelegramCode(request, env, headers, findCustomerByPhone) {
  const body = await readJson(request);
  const challengeId = String(body?.challenge_id || "");
  const code = String(body?.code || "").replace(/\D/g, "");
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(challengeId) || !/^\d{6}$/.test(code)) {
    return authJson({ success: false, error: "Введіть шестизначний код" }, 400, headers);
  }
  const ipKey = await requestIpKey(request, env);
  if (!await consumeRateLimit(env, `auth-verify:${ipKey}`, 30, 60 * 60)) {
    return tooManyRequests(headers);
  }

  const challenge = await env.AUTH_DB.prepare(
    `SELECT id, phone, telegram_user_id, code_hash, attempts, expires_at, used_at
       FROM otp_challenges
      WHERE id = ?`
  ).bind(challengeId).first();
  const now = unixTime();
  if (!challenge || challenge.used_at || Number(challenge.expires_at) <= now) {
    return authJson({ success: false, error: "Код прострочений. Запросіть новий" }, 401, headers);
  }
  if (Number(challenge.attempts) >= MAX_OTP_ATTEMPTS) {
    return authJson({ success: false, error: "Забагато спроб. Запросіть новий код" }, 429, headers);
  }

  const candidateHash = await hmacHex(
    env.SESSION_SECRET,
    `otp:${challenge.id}:${challenge.phone}:${code}`
  );
  if (!safeEqual(candidateHash, String(challenge.code_hash))) {
    await env.AUTH_DB.prepare(
      "UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?"
    ).bind(challenge.id).run();
    return authJson({ success: false, error: "Невірний код" }, 401, headers);
  }

  const customer = await findCustomerByPhone(env, challenge.phone);
  if (!customer?.id) {
    return authJson({ success: false, error: "Клієнта з таким номером не знайдено" }, 404, headers);
  }

  const rawSessionToken = randomToken(32);
  const sessionHash = await sha256Hex(`session:${rawSessionToken}`);
  const customerName = [customer.first_name || customer.name, customer.last_name]
    .filter(Boolean)
    .join(" ")
    .slice(0, 160);
  const expiresAt = now + SESSION_TTL_SECONDS;
  const claimed = await env.AUTH_DB.prepare(
    `UPDATE otp_challenges
        SET used_at = ?
      WHERE id = ? AND used_at IS NULL
      RETURNING id`
  ).bind(now, challenge.id).first();
  if (!claimed?.id) {
    return authJson({ success: false, error: "Код уже використано" }, 401, headers);
  }
  await env.AUTH_DB.prepare(
    `INSERT INTO sessions
      (token_hash, phone, customer_id, customer_name, telegram_user_id,
       created_at, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sessionHash,
    challenge.phone,
    Number(customer.id),
    customerName,
    String(challenge.telegram_user_id),
    now,
    expiresAt,
    now
  ).run();

  return authJson({
    success: true,
    token: rawSessionToken,
    token_type: "Bearer",
    expires_at: expiresAt,
    phone_masked: maskPhone(challenge.phone)
  }, 200, headers);
}

async function getAuthSession(request, env) {
  const token = bearerToken(request);
  if (!token || token.length < 30 || token.length > 100) return null;
  const tokenHash = await sha256Hex(`session:${token}`);
  const now = unixTime();
  const session = await env.AUTH_DB.prepare(
    `SELECT token_hash, phone, customer_id, customer_name, telegram_user_id,
            expires_at, last_used_at
       FROM sessions
      WHERE token_hash = ? AND expires_at > ?`
  ).bind(tokenHash, now).first();
  if (!session) return null;
  if (now - Number(session.last_used_at || 0) > 5 * 60) {
    await env.AUTH_DB.prepare(
      "UPDATE sessions SET last_used_at = ? WHERE token_hash = ?"
    ).bind(now, tokenHash).run();
  }
  return session;
}

async function processTelegramUpdate(env, update, findCustomerByPhone) {
  const message = update?.message;
  if (!message || message.chat?.type !== "private" || !message.from?.id) return;
  const chatId = String(message.chat.id);
  const telegramUserId = String(message.from.id);
  const text = String(message.text || "");
  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{20,64}))?$/i);

  if (startMatch) {
    const rawToken = startMatch[1];
    if (!rawToken) {
      await sendTelegramMessage(env, chatId, {
        text: "Відкрийте застосунок Karpservice, введіть номер телефону та натисніть «Підтвердити через Telegram»."
      });
      return;
    }
    const tokenHash = await sha256Hex(`link:${rawToken}`);
    const now = unixTime();
    const linkRequest = await env.AUTH_DB.prepare(
      `SELECT token_hash, phone, state, expires_at
         FROM link_requests
        WHERE token_hash = ?`
    ).bind(tokenHash).first();
    if (!linkRequest || Number(linkRequest.expires_at) <= now || linkRequest.state === "otp_sent") {
      await sendTelegramMessage(env, chatId, {
        text: "Посилання прострочене. Поверніться в застосунок і сформуйте нове."
      });
      return;
    }

    await env.AUTH_DB.prepare(
      `UPDATE link_requests
          SET telegram_user_id = ?, chat_id = ?, state = 'awaiting_contact'
        WHERE token_hash = ?`
    ).bind(telegramUserId, chatId, tokenHash).run();

    const existingLink = await env.AUTH_DB.prepare(
      "SELECT phone FROM telegram_links WHERE telegram_user_id = ?"
    ).bind(telegramUserId).first();
    if (existingLink?.phone === linkRequest.phone) {
      await completeTelegramLink(
        env,
        { ...linkRequest, telegram_user_id: telegramUserId, chat_id: chatId },
        findCustomerByPhone
      );
      return;
    }

    await sendTelegramMessage(env, chatId, {
      text: "Для безпечної прив’язки підтвердьте номер, який належить цьому Telegram-акаунту.",
      reply_markup: {
        keyboard: [[{ text: "Підтвердити номер", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    return;
  }

  if (message.contact) {
    if (String(message.contact.user_id || "") !== telegramUserId) {
      await sendTelegramMessage(env, chatId, {
        text: "Потрібно поділитися саме власним номером через кнопку нижче."
      });
      return;
    }
    const linkRequest = await env.AUTH_DB.prepare(
      `SELECT token_hash, phone, state, expires_at, telegram_user_id, chat_id
         FROM link_requests
        WHERE telegram_user_id = ? AND state = 'awaiting_contact'
        ORDER BY created_at DESC
        LIMIT 1`
    ).bind(telegramUserId).first();
    if (!linkRequest || Number(linkRequest.expires_at) <= unixTime()) {
      await sendTelegramMessage(env, chatId, {
        text: "Запит прострочений. Поверніться в застосунок і почніть ще раз.",
        reply_markup: { remove_keyboard: true }
      });
      return;
    }
    const sharedPhone = normalizeUkrainianPhone(message.contact.phone_number);
    if (sharedPhone !== linkRequest.phone) {
      await env.AUTH_DB.prepare(
        "UPDATE link_requests SET state = 'failed' WHERE token_hash = ?"
      ).bind(linkRequest.token_hash).run();
      await sendTelegramMessage(env, chatId, {
        text: "Номер Telegram не збігається з номером, введеним у застосунку. Перевірте номер і повторіть.",
        reply_markup: { remove_keyboard: true }
      });
      return;
    }
    await completeTelegramLink(env, linkRequest, findCustomerByPhone);
  }
}

async function completeTelegramLink(env, linkRequest, findCustomerByPhone) {
  const claimedRequest = await env.AUTH_DB.prepare(
    `UPDATE link_requests
        SET state = 'linking'
      WHERE token_hash = ? AND state = 'awaiting_contact'
      RETURNING token_hash, phone, telegram_user_id, chat_id, expires_at`
  ).bind(linkRequest.token_hash).first();
  if (!claimedRequest || Number(claimedRequest.expires_at) <= unixTime()) return;
  linkRequest = claimedRequest;

  try {
    const customer = await findCustomerByPhone(env, linkRequest.phone);
    if (!customer?.id) {
      await env.AUTH_DB.prepare(
        "UPDATE link_requests SET state = 'failed' WHERE token_hash = ?"
      ).bind(linkRequest.token_hash).run();
      await sendTelegramMessage(env, linkRequest.chat_id, {
        text: "Цей номер не знайдено серед клієнтів Karpservice.",
        reply_markup: { remove_keyboard: true }
      });
      return;
    }

    const now = unixTime();
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(
        "DELETE FROM telegram_links WHERE phone = ? OR telegram_user_id = ?"
      ).bind(linkRequest.phone, String(linkRequest.telegram_user_id)),
      env.AUTH_DB.prepare(
        `INSERT INTO telegram_links
          (phone, telegram_user_id, chat_id, linked_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(
        linkRequest.phone,
        String(linkRequest.telegram_user_id),
        String(linkRequest.chat_id),
        now,
        now
      )
    ]);

    await sendTelegramMessage(env, linkRequest.chat_id, {
      text: "Номер успішно прив’язано до Karpservice.",
      reply_markup: { remove_keyboard: true }
    });
    const challenge = await createAndSendOtp(env, {
      phone: linkRequest.phone,
      telegram_user_id: String(linkRequest.telegram_user_id),
      chat_id: String(linkRequest.chat_id)
    }, { skipCooldown: true });
    await env.AUTH_DB.prepare(
      `UPDATE link_requests
          SET state = 'otp_sent', challenge_id = ?
        WHERE token_hash = ?`
    ).bind(challenge.id, linkRequest.token_hash).run();
  } catch (error) {
    await env.AUTH_DB.prepare(
      "UPDATE link_requests SET state = 'failed' WHERE token_hash = ? AND state = 'linking'"
    ).bind(linkRequest.token_hash).run().catch(() => {});
    throw error;
  }
}

async function createAndSendOtp(env, telegramLink, options = {}) {
  const now = unixTime();
  if (!options.skipCooldown) {
    const previous = await env.AUTH_DB.prepare(
      `SELECT created_at
         FROM otp_challenges
        WHERE phone = ?
        ORDER BY created_at DESC
        LIMIT 1`
    ).bind(telegramLink.phone).first();
    const elapsed = now - Number(previous?.created_at || 0);
    if (previous && elapsed < 60) {
      return { cooldown: true, retryAfter: 60 - elapsed };
    }
  }
  if (!await consumeRateLimit(env, `otp-phone:${telegramLink.phone}`, 6, 60 * 60)) {
    const error = new Error("Забагато кодів для цього номера");
    error.status = 429;
    throw error;
  }

  const id = randomToken(16);
  const code = randomSixDigitCode();
  const codeHash = await hmacHex(
    env.SESSION_SECRET,
    `otp:${id}:${telegramLink.phone}:${code}`
  );
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(
      "UPDATE otp_challenges SET used_at = ? WHERE phone = ? AND used_at IS NULL"
    ).bind(now, telegramLink.phone),
    env.AUTH_DB.prepare(
      `INSERT INTO otp_challenges
        (id, phone, telegram_user_id, code_hash, attempts, created_at, expires_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    ).bind(
      id,
      telegramLink.phone,
      String(telegramLink.telegram_user_id),
      codeHash,
      now,
      now + OTP_TTL_SECONDS
    )
  ]);

  try {
    await sendTelegramMessage(env, telegramLink.chat_id, {
      text: `Код входу Karpservice: ${code}\n\nКод діє 5 хвилин. Нікому його не повідомляйте.`
    });
  } catch (error) {
    await env.AUTH_DB.prepare("DELETE FROM otp_challenges WHERE id = ?").bind(id).run();
    throw error;
  }
  return { id };
}

async function ensureTelegramWebhook(env) {
  const nowMs = Date.now();
  let bot = telegramBotCache;
  if (!bot || telegramBotCacheUntil <= nowMs) {
    const result = await telegramApi(env, "getMe");
    bot = result;
    telegramBotCache = bot;
    telegramBotCacheUntil = nowMs + 10 * 60 * 1000;
  }
  if (!bot?.username) throw new Error("Telegram-бот не має username");

  if (webhookConfiguredUntil <= nowMs) {
    const origin = String(
      env.TELEGRAM_WEBHOOK_ORIGIN || "https://karpservice-api.venyast31.workers.dev"
    ).replace(/\/$/, "");
    await telegramApi(env, "setWebhook", {
      url: `${origin}/telegram/webhook`,
      secret_token: String(env.TELEGRAM_WEBHOOK_SECRET),
      allowed_updates: ["message"],
      drop_pending_updates: false
    });
    webhookConfiguredUntil = nowMs + 10 * 60 * 1000;
  }
  return bot;
}

async function sendTelegramMessage(env, chatId, payload) {
  return telegramApi(env, "sendMessage", {
    chat_id: chatId,
    ...payload
  });
}

async function telegramApi(env, method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    }
  );
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const error = new Error(`Telegram API ${method} повернув помилку`);
    error.status = 502;
    throw error;
  }
  return data.result;
}

async function consumeRateLimit(env, rawKey, limit, windowSeconds) {
  const now = unixTime();
  const bucketStart = Math.floor(now / windowSeconds) * windowSeconds;
  const keyHash = await hmacHex(env.SESSION_SECRET, `rate:${rawKey}`);
  await env.AUTH_DB.prepare(
    `INSERT INTO rate_limits (key_hash, bucket_start, expires_at, count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(key_hash, bucket_start)
     DO UPDATE SET count = count + 1`
  ).bind(keyHash, bucketStart, bucketStart + windowSeconds * 2).run();
  const row = await env.AUTH_DB.prepare(
    "SELECT count FROM rate_limits WHERE key_hash = ? AND bucket_start = ?"
  ).bind(keyHash, bucketStart).first();
  return Number(row?.count || 0) <= limit;
}

async function cleanupExpiredAuthData(env) {
  const now = unixTime();
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    env.AUTH_DB.prepare("DELETE FROM otp_challenges WHERE expires_at <= ?").bind(now),
    env.AUTH_DB.prepare("DELETE FROM link_requests WHERE expires_at <= ?").bind(now),
    env.AUTH_DB.prepare("DELETE FROM rate_limits WHERE expires_at <= ?").bind(now)
  ]);
}

async function requestIpKey(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  return hmacHex(env.SESSION_SECRET, `ip:${ip}`);
}

function bearerToken(request) {
  const value = request.headers.get("Authorization") || "";
  const match = value.match(/^Bearer\s+([A-Za-z0-9_-]+)$/i);
  return match ? match[1] : "";
}

function unauthorized(headers) {
  return authJson({
    success: false,
    error: "Потрібне підтвердження через Telegram"
  }, 401, headers);
}

function tooManyRequests(headers) {
  return authJson({
    success: false,
    error: "Забагато спроб. Спробуйте пізніше"
  }, 429, { ...headers, "Retry-After": "60" });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function normalizeUkrainianPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) digits = `38${digits}`;
  return digits;
}

function isValidUkrainianPhone(phone) {
  return /^380\d{9}$/.test(phone);
}

function maskPhone(phone) {
  const digits = String(phone || "");
  if (digits.length !== 12) return "номер телефону";
  return `+${digits.slice(0, 3)} ** *** ** ${digits.slice(-2)}`;
}

function unixTime() {
  return Math.floor(Date.now() / 1000);
}

function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomSixDigitCode() {
  const values = new Uint32Array(1);
  const max = Math.floor(0x100000000 / 1000000) * 1000000;
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= max);
  return String(values[0] % 1000000).padStart(6, "0");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function hmacHex(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(value)));
  return bytesToHex(new Uint8Array(signature));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}
