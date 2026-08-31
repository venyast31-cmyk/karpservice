const UPSTREAM_ORIGIN = "https://karpservice-api.venyast31.workers.dev";
const FRONTEND_ORIGIN = "https://venyast31-cmyk.github.io";
const TRUSTED_UPSTREAM_ORIGIN = "https://karpservice-app.pages.dev";

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (origin !== FRONTEND_ORIGIN) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (origin && origin !== FRONTEND_ORIGIN) {
      return json({ success: false, error: "Origin is not allowed" }, 403);
    }

    const incomingUrl = new URL(request.url);
    if (incomingUrl.pathname === "/healthz") {
      return json({ success: true, service: "Karpservice API bridge" }, 200);
    }

    const upstreamUrl = new URL(incomingUrl.pathname || "/", UPSTREAM_ORIGIN);
    upstreamUrl.search = incomingUrl.search;

    const headers = new Headers(request.headers);
    headers.delete("Host");
    headers.delete("Content-Length");
    headers.delete("CF-Connecting-IP");
    headers.delete("CF-IPCountry");
    headers.delete("CF-Ray");
    headers.set("Origin", TRUSTED_UPSTREAM_ORIGIN);

    const init = {
      method: request.method,
      headers,
      redirect: "manual"
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = request.body;
    }

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, init);
    } catch (error) {
      console.error("Karpservice bridge upstream error", error);
      return json({ success: false, error: "Не вдалося з’єднатися із сервісом" }, 502);
    }

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("Access-Control-Allow-Origin");
    responseHeaders.delete("Access-Control-Allow-Credentials");
    responseHeaders.delete("Access-Control-Allow-Headers");
    responseHeaders.delete("Access-Control-Allow-Methods");
    responseHeaders.set("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    responseHeaders.set("Access-Control-Max-Age", "86400");
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("Vary", "Origin");
    responseHeaders.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=UTF-8"
    }
  });
}
