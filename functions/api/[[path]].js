const UPSTREAM_ORIGIN = "https://karpservice-api.venyast31.workers.dev";
const APP_ORIGIN = "https://karpservice-app.pages.dev";
const COOKIE_NAME = "__Host-karpservice_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export async function onRequest({ request }) {
  const incomingUrl = new URL(request.url);
  const apiPath = incomingUrl.pathname.replace(/^\/api/, "") || "/";
  const upstreamUrl = new URL(apiPath, UPSTREAM_ORIGIN);
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  const cookieToken = readCookieToken(headers.get("Cookie"));
  const legacyToken = bearerToken(headers.get("Authorization"));
  const sessionToken = cookieToken || legacyToken;

  headers.delete("Cookie");
  headers.delete("Host");
  headers.delete("Content-Length");
  headers.set("Origin", APP_ORIGIN);
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  else headers.delete("Authorization");

  const init = {
    method: request.method,
    headers,
    redirect: "manual"
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(upstreamUrl, init);
  const responseHeaders = cleanResponseHeaders(upstream.headers);

  if (apiPath === "/auth/verify") {
    const data = await readJson(upstream);
    if (upstream.ok && validToken(data.token)) {
      responseHeaders.set("Set-Cookie", sessionCookie(data.token, data.expires_at));
      delete data.token;
      delete data.token_type;
    }
    return jsonResponse(data, upstream.status, responseHeaders);
  }

  if (apiPath === "/auth/logout") {
    responseHeaders.set("Set-Cookie", clearSessionCookie());
  } else if (!cookieToken && validToken(legacyToken) && upstream.ok && apiPath === "/") {
    responseHeaders.set("Set-Cookie", sessionCookie(legacyToken));
  } else if (cookieToken && upstream.status === 401) {
    responseHeaders.set("Set-Cookie", clearSessionCookie());
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

function readCookieToken(cookieHeader) {
  const cookies = String(cookieHeader || "").split(";");
  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === COOKIE_NAME) {
      const value = decodeURIComponent(rawValue.join("="));
      return validToken(value) ? value : "";
    }
  }
  return "";
}

function bearerToken(value) {
  const match = String(value || "").match(/^Bearer\s+([A-Za-z0-9_-]{40,100})$/i);
  return match ? match[1] : "";
}

function validToken(value) {
  return /^[A-Za-z0-9_-]{40,100}$/.test(String(value || ""));
}

function sessionCookie(token, expiresAt) {
  const secondsRemaining = Number(expiresAt) - Math.floor(Date.now() / 1000);
  const maxAge = Number.isFinite(secondsRemaining)
    ? Math.max(1, Math.min(SESSION_MAX_AGE, Math.floor(secondsRemaining)))
    : SESSION_MAX_AGE;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function cleanResponseHeaders(source) {
  const headers = new Headers(source);
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Credentials");
  headers.delete("Vary");
  headers.set("Cache-Control", "no-store");
  return headers;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return { success: false, error: "Сервіс повернув некоректну відповідь" };
  }
}

function jsonResponse(data, status, headers) {
  headers.set("Content-Type", "application/json; charset=UTF-8");
  return new Response(JSON.stringify(data), { status, headers });
}
