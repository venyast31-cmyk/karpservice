import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../../functions/api/[[path]].js";

const TOKEN = "A".repeat(43);

test("Pages proxy keeps the weekly session in a secure HttpOnly cookie", async () => {
  const originalFetch = globalThis.fetch;
  const upstreamRequests = [];

  globalThis.fetch = async (input, init = {}) => {
    upstreamRequests.push({ url: String(input), init });
    const path = new URL(String(input)).pathname;
    if (path === "/auth/verify") {
      return Response.json({
        success: true,
        token: TOKEN,
        token_type: "Bearer",
        expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
      });
    }
    if (path === "/") {
      return Response.json({ success: true, found: true, customer: {}, cars: [] });
    }
    if (path === "/auth/logout") {
      return Response.json({ success: true });
    }
    return Response.json({ success: false }, { status: 404 });
  };

  try {
    const verify = await onRequest({
      request: new Request("https://karpservice-app.pages.dev/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_id: "challenge", code: "123456" })
      })
    });
    assert.equal(verify.status, 200);
    const verifyBody = await verify.json();
    assert.equal(verifyBody.success, true);
    assert.equal("token" in verifyBody, false);
    assert.equal("token_type" in verifyBody, false);
    const setCookie = verify.headers.get("Set-Cookie");
    assert.match(setCookie, /^__Host-karpservice_session=/);
    const maxAge = Number(setCookie.match(/Max-Age=(\d+)/)?.[1]);
    assert.ok(maxAge >= 7 * 24 * 60 * 60 - 5);
    assert.ok(maxAge <= 7 * 24 * 60 * 60);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Strict/);

    const cookiePair = setCookie.split(";", 1)[0];
    const customer = await onRequest({
      request: new Request("https://karpservice-app.pages.dev/api/", {
        headers: { Cookie: cookiePair }
      })
    });
    assert.equal(customer.status, 200);
    assert.equal(upstreamRequests.at(-1).init.headers.get("Authorization"), `Bearer ${TOKEN}`);
    assert.equal(upstreamRequests.at(-1).init.headers.has("Cookie"), false);

    const migrated = await onRequest({
      request: new Request("https://karpservice-app.pages.dev/api/", {
        headers: { Authorization: `Bearer ${TOKEN}` }
      })
    });
    assert.equal(migrated.status, 200);
    assert.match(migrated.headers.get("Set-Cookie"), /^__Host-karpservice_session=/);

    const logout = await onRequest({
      request: new Request("https://karpservice-app.pages.dev/api/auth/logout", {
        method: "POST",
        headers: { Cookie: cookiePair }
      })
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("Set-Cookie"), /Max-Age=0/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
