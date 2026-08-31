import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../src/index.js";

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
    return { success: true, meta: { changes: Number(result.changes || 0) } };
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

const API_ORIGIN = "https://karpservice-api.test";
const APP_ORIGIN = "https://karpservice-app.pages.dev";
const PHONE = "380671234567";
const ATTACKER_PHONE = "380991111111";
const SESSION_TOKEN = "S".repeat(43);

test("protected API derives ownership from the Telegram session", async () => {
  const authDb = new MemoryD1();
  authDb.database.exec(await readFile(new URL("../migrations/0001_auth.sql", import.meta.url), "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const tokenHash = createHash("sha256").update(`session:${SESSION_TOKEN}`).digest("hex");
  authDb.database.prepare(
    `INSERT INTO sessions
      (token_hash, phone, customer_id, customer_name, telegram_user_id,
       created_at, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(tokenHash, PHONE, 123, "Тест Клієнт", "777", now, now + 3600, now);

  const env = {
    AUTH_DB: authDb,
    ROAPP_API_KEY: "test-roapp-token",
    ROAPP_BRANCH_ID: "136446",
    SESSION_SECRET: "test-session-secret-that-is-longer-than-32-bytes",
    TELEGRAM_BOT_TOKEN: "test-bot-token",
    TELEGRAM_CHAT_ID: "test-service-chat",
    TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
    ALLOWED_ORIGINS: APP_ORIGIN
  };

  const roappCalls = [];
  let orderOwnerId = 123;
  let createdAsset = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.roapp.io");
    const method = String(init.method || "GET").toUpperCase();
    let requestBody = null;
    if (init.body) {
      const bodyText = typeof init.body === "string"
        ? init.body
        : new TextDecoder().decode(init.body);
      requestBody = JSON.parse(bodyText);
    }
    roappCalls.push({ url, method, body: requestBody });

    if (url.pathname === "/v2/warehouse/assets" || url.pathname === "/warehouse/assets") {
      if (method === "POST") {
        const payload = requestBody || {};
        createdAsset = {
          id: 501,
          uid: payload.uid,
          owner_id: payload.owner_id,
          brand: "Mitsubishi",
          model: "Outlander",
          group: payload.group || "Автомобіль"
        };
        return Response.json({});
      }

      const uidFilters = url.searchParams.getAll("uid[]");
      const ownerFilters = url.searchParams.getAll("owner_id[]");
      if (uidFilters.length) {
        return Response.json({
          data: createdAsset && uidFilters.includes(createdAsset.uid) ? [createdAsset] : []
        });
      }
      if (ownerFilters.length) {
        return Response.json({
          data: createdAsset && ownerFilters.includes(String(createdAsset.owner_id))
            ? [createdAsset]
            : []
        });
      }
      return Response.json({ data: [] });
    }

    if (url.pathname === "/v2/contacts/people") {
      return Response.json({
        data: [{ id: 123, first_name: "Тест", last_name: "Клієнт", phones: [`+${PHONE}`] }]
      });
    }
    if (url.pathname === "/v2/orders/456") {
      return Response.json({
        data: {
          id: 456,
          number: "A456",
          client_id: orderOwnerId,
          status: { name: "Закрито" },
          items: [{ id: 1, service_id: 1, name: "Діагностика", quantity: 1, total: 100 }]
        }
      });
    }
    if (url.pathname === "/v2/orders") {
      return Response.json({
        data: [{
          id: 456,
          number: "A456",
          client_id: 123,
          asset: { id: 88, brand: "Land Rover", model: "Range Rover Sport", uid: "VIN123" }
        }],
        meta: { total: 1 }
      });
    }
    throw new Error(`Unexpected RO App request: ${url.pathname}`);
  };

  const callWorker = async (path, init = {}) => {
    const pending = [];
    const response = await worker.fetch(
      new Request(`${API_ORIGIN}${path}`, {
        ...init,
        headers: {
          Origin: APP_ORIGIN,
          Authorization: `Bearer ${SESSION_TOKEN}`,
          ...(init.headers || {})
        }
      }),
      env,
      { waitUntil: (promise) => pending.push(Promise.resolve(promise)) }
    );
    await Promise.all(pending);
    return response;
  };

  try {
    const customerResponse = await callWorker(`/?phone=${ATTACKER_PHONE}`);
    assert.equal(customerResponse.status, 200);
    const customerData = await customerResponse.json();
    assert.equal(Number(customerData.customer.id), 123);
    const contactCall = roappCalls.find(({ url }) => url.pathname === "/v2/contacts/people");
    assert.equal(contactCall.url.searchParams.getAll("phones").includes(ATTACKER_PHONE), false);
    assert.equal(
      contactCall.url.searchParams.getAll("phones").some((phone) => phone.replace(/\D/g, "") === PHONE),
      true
    );

    const ownerAssetCall = roappCalls.find(({ url, method }) =>
      method === "GET" &&
      url.pathname === "/v2/warehouse/assets" &&
      url.searchParams.has("owner_id[]")
    );
    assert.ok(ownerAssetCall, "customer assets must use the owner_id[] array filter");
    assert.deepEqual(ownerAssetCall.url.searchParams.getAll("owner_id[]"), ["123"]);
    assert.equal(ownerAssetCall.url.searchParams.has("owner_id"), false);

    const vin = "JMBSRCS3A6U011108";
    const addCarResponse = await callWorker("/cars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vin })
    });
    assert.equal(addCarResponse.status, 200);
    const addCarData = await addCarResponse.json();
    assert.equal(addCarData.success, true);
    assert.equal(addCarData.car.vin, vin);

    const vinLookupCall = roappCalls.find(({ url, method }) =>
      method === "GET" &&
      url.pathname === "/v2/warehouse/assets" &&
      url.searchParams.has("uid[]")
    );
    assert.ok(vinLookupCall, "VIN lookup must use the uid[] array filter");
    assert.deepEqual(vinLookupCall.url.searchParams.getAll("uid[]"), [vin]);
    assert.equal(vinLookupCall.url.searchParams.has("uid"), false);

    const createAssetCall = roappCalls.find(({ url, method }) =>
      method === "POST" && url.pathname === "/v2/warehouse/assets"
    );
    assert.ok(createAssetCall, "asset must be created through the RO App API");
    assert.equal(typeof createAssetCall.body.uid, "string");
    assert.equal(createAssetCall.body.uid, vin);
    assert.equal(createAssetCall.body.owner_id, 123);

    orderOwnerId = 999;
    const foreignOrder = await callWorker("/order?order_id=456");
    assert.equal(foreignOrder.status, 404, "another customer's order must stay hidden");

    orderOwnerId = 123;
    const ownOrder = await callWorker("/order?order_id=456");
    assert.equal(ownOrder.status, 200);
    assert.equal(Number((await ownOrder.json()).order.id), 456);

    const sundayBooking = await callWorker("/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduled_for: "2099-01-04T10:00:00+02:00",
        scheduled_to: "2099-01-04T11:00:00+02:00",
        service: "Діагностика",
        car: "Land Rover"
      })
    });
    assert.equal(sundayBooking.status, 400);
    assert.match((await sundayBooking.json()).error, /неділю/i);

    const crossClientBooking = await callWorker("/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: 999,
        scheduled_for: "2026-09-10T10:00:00+03:00",
        scheduled_to: "2026-09-10T11:00:00+03:00",
        service: "Діагностика",
        car: "Land Rover"
      })
    });
    assert.equal(crossClientBooking.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
    authDb.database.close();
  }
});
