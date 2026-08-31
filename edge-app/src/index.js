const STATIC_ORIGIN = "https://venyast31-cmyk.github.io";
const STATIC_BASE = "/karpservice";
const API_ORIGIN = "https://karpservice-api.venyast31.workers.dev";
const TRUSTED_API_ORIGIN = "https://karpservice-app.pages.dev";
const COOKIE_NAME = "__Host-karpservice_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return json({ success: true, service: "Karpservice edge app" });
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApi(request);
    }

    return handleStatic(request);
  }
};

async function handleStatic(request) {
  const incoming = new URL(request.url);
  const upstream = new URL(STATIC_ORIGIN);
  const path = incoming.pathname === "/" ? "/" : incoming.pathname;
  upstream.pathname = `${STATIC_BASE}${path}`.replace(/\/+/g, "/");
  upstream.search = incoming.search;

  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.delete("Cookie");
  headers.delete("Origin");
  headers.delete("Referer");

  const response = await fetch(upstream, {
    method: request.method,
    headers,
    redirect: "follow"
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("Set-Cookie");
  responseHeaders.delete("Content-Security-Policy");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("Referrer-Policy", "no-referrer");
  responseHeaders.set("X-Frame-Options", "DENY");
  responseHeaders.set(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
  );

  const contentType = responseHeaders.get("Content-Type") || "";
  if (contentType.includes("text/html")) {
    let html = await response.text();
    html = normalizeFrontend(html);
    responseHeaders.delete("Content-Length");
    responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  }

  if (incoming.pathname.endsWith("manifest.webmanifest")) {
    responseHeaders.set("Cache-Control", "no-cache");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

function normalizeFrontend(html) {
  html = html.replace(
    /const API_URL = (?:new URL\('\/api\/', window\.location\.origin\)\.href|['\"]https:\/\/[^'\"]+['\"]);/,
    "const API_URL = new URL('/api/', window.location.origin).href;"
  );

  const tokenBlock = [
    "    if (typeof data.token === 'string' && /^[A-Za-z0-9_-]{40,100}$/.test(data.token)){",
    "      legacyAuthToken = data.token;",
    "      try{ window.sessionStorage.setItem(LEGACY_AUTH_TOKEN_KEY, data.token); }catch{}",
    "    }else{",
    "      throw new Error('Сервіс не повернув токен входу.');",
    "    }",
    "    setAuthSession(true);",
    "    authChallengeId = '';",
    "    await loadCustomer();"
  ].join("\n");

  const cookieBlock = [
    "    setAuthSession(true);",
    "    clearLegacyAuthToken();",
    "    authChallengeId = '';",
    "    await loadCustomer();"
  ].join("\n");

  if (html.includes(tokenBlock)) {
    html = html.replace(tokenBlock, cookieBlock);
  }

  const currentSuccess = [
    "    customerData = data;",
    "    setAuthSession(true);",
    "    renderCustomer();"
  ].join("\n");

  const originalSuccess = [
    "    customerData = data;",
    "    setAuthSession(true);",
    "    clearLegacyAuthToken();",
    "    renderCustomer();"
  ].join("\n");

  if (html.includes(currentSuccess)) {
    html = html.replace(currentSuccess, originalSuccess);
  }

  return html;
}

async function handleApi(request) {
  const incomingUrl = new URL(request.url);
  const apiPath = incomingUrl.pathname.replace(/^\/api/, "") || "/";
  const upstreamUrl = new URL(apiPath, API_ORIGIN);
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  const cookieToken = readCookieToken(headers.get("Cookie"));
  const legacyToken = bearerToken(headers.get("Authorization"));
  const sessionToken = cookieToken || legacyToken;

  headers.delete("Cookie");
  headers.delete("Host");
  headers.delete("Content-Length");
  headers.set("Origin", TRUSTED_API_ORIGIN);
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  else headers.delete("Authorization");

  const init = {
    method: request.method,
    headers,
    redirect: "manual"
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (error) {
    console.error("Karpservice API upstream error", error);
    return json({ success: false, error: "Не вдалося з’єднатися із сервісом" }, 502);
  }

  const responseHeaders = cleanApiResponseHeaders(upstream.headers);

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

function cleanApiResponseHeaders(source) {
  const headers = new Headers(source);
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Credentials");
  headers.delete("Access-Control-Allow-Headers");
  headers.delete("Access-Control-Allow-Methods");
  headers.delete("Vary");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
