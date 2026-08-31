import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  corsHeadersFor,
  handleAuthRoute,
  requireAuthSession
} from "../src/auth.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.database, this.sql, values);
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: Number(result.lastInsertRowid || 0)
      }
    };
  }

  async all() {
    return {
      success: true,
      results: this.database.prepare(this.sql).all(...this.values)
    };
  }
}

class MemoryD1 {
  constructor() {
    this.database = new DatabaseSync(":memory:");
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

const APP_ORIGIN = "https://karpservice-app.pages.dev";
const API_ORIGIN = "https://karpservice-api.test";
const PHONE = "380671234567";

test("Telegram-only link, OTP, session, logout and CORS", async () => {
  const authDb = new MemoryD1();
  authDb.database.exec(await readFile(new URL("../migrations/0001_auth.sql", import.meta.url), "utf8"));

  const env = {
    AUTH_DB: authDb,
    SESSION_SECRET: "test-session-secret-that-is-longer-than-32-bytes",
    TELEGRAM_BOT_TOKEN: "test-bot-token",
    TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
    TELEGRAM_WEBHOOK_ORIGIN: API_ORIGIN,
    ALLOWED_ORIGINS: APP_ORIGIN
  };
  const telegramCalls = [];
  const otpCodes = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.telegram.org");
    const method = url.pathname.split("/").pop();
    const body = JSON.parse(String(init.body || "{}"));
    telegramCalls.push({ method, body });

    if (method === "getMe") {
      return Response.json({ ok: true, result: { id: 1, username: "KarpserviceTestBot" } });
    }
    if (method === "sendMessage") {
      const match = String(body.text || "").match(/\b(\d{6})\b/);
      if (match) otpCodes.push(match[1]);
      return Response.json({ ok: true, result: { message_id: telegramCalls.length } });
    }
    if (method === "setWebhook") {
      return Response.json({ ok: true, result: true });
    }
    throw new Error(`Unexpected Telegram method: ${method}`);
  };

  const customerLookups = [];
  const findCustomerByPhone = async (_env, phone) => {
    customerLookups.push({ phone, type: typeof phone });
    return String(phone) === PHONE
      ? { id: 123, first_name: "Тест", last_name: "Клієнт" }
      : null;
  };

  const callRoute = async (path, init = {}) => {
    const pending = [];
    const request = new Request(`${API_ORIGIN}${path}`, {
      ...init,
      headers: {
        Origin: APP_ORIGIN,
        ...(init.headers || {})
      }
    });
    const response = await handleAuthRoute({
      request,
      env,
      ctx: { waitUntil: (promise) => pending.push(Promise.resolve(promise)) },
      headers: corsHeadersFor(request, env),
      findCustomerByPhone
    });
    await Promise.all(pending);
    return response;
  };

  try {
    const untrustedRequest = new Request(`${API_ORIGIN}/`, {
      headers: { Origin: "https://evil.example" }
    });
    assert.equal(corsHeadersFor(untrustedRequest, env)["Access-Control-Allow-Origin"], undefined);

    const unauthenticatedRequest = new Request(`${API_ORIGIN}/`, {
      headers: { Origin: APP_ORIGIN }
    });
    const unauthenticated = await requireAuthSession(
      unauthenticatedRequest,
      env,
      corsHeadersFor(unauthenticatedRequest, env)
    );
    assert.equal(unauthenticated.response.status, 401);

    const requestResponse = await callRoute("/auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: PHONE })
    });
    assert.equal(requestResponse.status, 200);
    const link = await requestResponse.json();
    assert.equal(link.stage, "telegram_link");
    assert.match(link.link_url, /^https:\/\/t\.me\/KarpserviceTestBot\?start=/);
    assert.equal(telegramCalls.some(({ method }) => method === "setWebhook"), true);

    const pendingResponse = await callRoute("/auth/link-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link_token: link.link_token })
    });
    assert.equal((await pendingResponse.json()).stage, "pending");

    const startResponse = await callRoute("/telegram/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET
      },
      body: JSON.stringify({
        message: {
          from: { id: 777 },
          chat: { id: 777, type: "private" },
          text: `/start ${link.link_token}`
        }
      })
    });
    assert.equal(startResponse.status, 200);

    const awaitingResponse = await callRoute("/auth/link-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link_token: link.link_token })
    });
    assert.equal((await awaitingResponse.json()).stage, "awaiting_contact");

    await callRoute("/telegram/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET
      },
      body: JSON.stringify({
        message: {
          from: { id: 777 },
          chat: { id: 777, type: "private" },
          contact: { user_id: 999, phone_number: `+${PHONE}` }
        }
      })
    });
    assert.equal(otpCodes.length, 0, "a mismatched Telegram contact must not receive an OTP");

    await callRoute("/telegram/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET
      },
      body: JSON.stringify({
        message: {
          from: { id: 777 },
          chat: { id: 777, type: "private" },
          contact: { user_id: 777, phone_number: `+${PHONE}` }
        }
      })
    });
    const linkState = authDb.database.prepare(
      "SELECT phone, state, telegram_user_id, chat_id FROM link_requests WHERE token_hash IS NOT NULL"
    ).get();
    assert.equal(
      otpCodes.length,
      1,
      JSON.stringify({ linkState, customerLookups, telegramCalls: telegramCalls.map(({ method, body }) => ({ method, text: body.text })) })
    );

    const codeResponse = await callRoute("/auth/link-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link_token: link.link_token })
    });
    const challenge = await codeResponse.json();
    assert.equal(challenge.stage, "code");

    const wrongCodeResponse = await callRoute("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge_id: challenge.challenge_id, code: "000000" })
    });
    assert.equal(wrongCodeResponse.status, 401);

    const verifyResponse = await callRoute("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge_id: challenge.challenge_id, code: otpCodes[0] })
    });
    assert.equal(verifyResponse.status, 200);
    const verified = await verifyResponse.json();
    assert.match(verified.token, /^[A-Za-z0-9_-]{40,100}$/);
    const sessionLifetime = Number(verified.expires_at) - Math.floor(Date.now() / 1000);
    assert.ok(sessionLifetime >= 7 * 24 * 60 * 60 - 5);
    assert.ok(sessionLifetime <= 7 * 24 * 60 * 60 + 5);

    const reusedCodeResponse = await callRoute("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge_id: challenge.challenge_id, code: otpCodes[0] })
    });
    assert.equal(reusedCodeResponse.status, 401, "an OTP must be one-time only");

    const authenticatedRequest = new Request(`${API_ORIGIN}/`, {
      headers: { Origin: APP_ORIGIN, Authorization: `Bearer ${verified.token}` }
    });
    const authenticated = await requireAuthSession(
      authenticatedRequest,
      env,
      corsHeadersFor(authenticatedRequest, env)
    );
    assert.equal(Number(authenticated.session.customer_id), 123);
    assert.equal(authenticated.session.phone, PHONE);

    const logoutResponse = await callRoute("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${verified.token}` }
    });
    assert.equal(logoutResponse.status, 200);
    const afterLogout = await requireAuthSession(
      authenticatedRequest,
      env,
      corsHeadersFor(authenticatedRequest, env)
    );
    assert.equal(afterLogout.response.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    authDb.database.close();
  }
});
