from pathlib import Path

path = Path("worker/src/index.js")
text = path.read_text(encoding="utf-8")
marker = '      if (url.pathname === "/health" && request.method === "GET") {'
if text.count(marker) != 1:
    raise SystemExit(f"health marker count: {text.count(marker)}")

route = r'''      if (url.pathname === "/health/roapp-vin-lookup" && request.method === "GET") {
        const vin = "TMBDX41U79B008586";
        const variant = String(url.searchParams.get("variant") || "");
        const apiKey = String(env.ROAPP_API_KEY || "");
        const encodedVin = encodeURIComponent(vin);
        const baseHeaders = {
          Accept: "application/json,text/plain,*/*",
          "X-Requested-With": "XMLHttpRequest",
          Origin: "https://web.roapp.io",
          Referer: "https://web.roapp.io/"
        };
        const variants = {
          api_v2_get_bearer: {
            target: `https://api.roapp.io/v2/integrations/service/vin-lookup?vin=${encodedVin}`,
            init: {
              method: "GET",
              headers: { ...baseHeaders, Authorization: `Bearer ${apiKey}` }
            }
          },
          api_get_bearer: {
            target: `https://api.roapp.io/integrations/service/vin-lookup?vin=${encodedVin}`,
            init: {
              method: "GET",
              headers: { ...baseHeaders, Authorization: `Bearer ${apiKey}` }
            }
          },
          api_v2_get_query: {
            target: `https://api.roapp.io/v2/integrations/service/vin-lookup?vin=${encodedVin}&token=${encodeURIComponent(apiKey)}`,
            init: { method: "GET", headers: baseHeaders }
          },
          api_get_query: {
            target: `https://api.roapp.io/integrations/service/vin-lookup?vin=${encodedVin}&token=${encodeURIComponent(apiKey)}`,
            init: { method: "GET", headers: baseHeaders }
          },
          api_v2_post_bearer_json: {
            target: "https://api.roapp.io/v2/integrations/service/vin-lookup",
            init: {
              method: "POST",
              headers: {
                ...baseHeaders,
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ vin })
            }
          },
          api_post_bearer_form: {
            target: "https://api.roapp.io/integrations/service/vin-lookup",
            init: {
              method: "POST",
              headers: {
                ...baseHeaders,
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
              },
              body: new URLSearchParams({ vin }).toString()
            }
          },
          web_get_bearer: {
            target: `https://web.roapp.io/integrations/service/vin-lookup?vin=${encodedVin}`,
            init: {
              method: "GET",
              headers: { ...baseHeaders, Authorization: `Bearer ${apiKey}` }
            }
          },
          web_post_bearer_form: {
            target: "https://web.roapp.io/integrations/service/vin-lookup",
            init: {
              method: "POST",
              headers: {
                ...baseHeaders,
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
              },
              body: new URLSearchParams({ vin }).toString()
            }
          },
          remonline_api_get_bearer: {
            target: `https://api.remonline.app/integrations/service/vin-lookup?vin=${encodedVin}`,
            init: {
              method: "GET",
              headers: { ...baseHeaders, Authorization: `Bearer ${apiKey}` }
            }
          },
          remonline_web_get_bearer: {
            target: `https://web.remonline.app/integrations/service/vin-lookup?vin=${encodedVin}`,
            init: {
              method: "GET",
              headers: { ...baseHeaders, Authorization: `Bearer ${apiKey}` }
            }
          }
        };
        const probe = variants[variant];
        if (!probe) {
          return json2({
            success: false,
            error: "Unknown variant",
            variants: Object.keys(variants)
          }, 400, corsHeaders);
        }
        const startedAt = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(probe.target, {
            ...probe.init,
            redirect: "manual",
            signal: controller.signal
          });
          const text = await response.text();
          let data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            data = text.slice(0, 1200);
          }
          const location = response.headers.get("location") || "";
          return json2({
            success: response.ok,
            variant,
            status: response.status,
            status_text: response.statusText,
            content_type: response.headers.get("content-type") || "",
            location_host: location ? new URL(location, probe.target).host : "",
            www_authenticate: response.headers.get("www-authenticate") || "",
            allow: response.headers.get("allow") || "",
            data,
            elapsed_ms: Date.now() - startedAt
          }, 200, corsHeaders);
        } catch (error) {
          return json2({
            success: false,
            variant,
            error_name: error?.name || "Error",
            error: error instanceof Error ? error.message : String(error),
            elapsed_ms: Date.now() - startedAt
          }, 200, corsHeaders);
        } finally {
          clearTimeout(timer);
        }
      }
'''

path.write_text(text.replace(marker, route + marker, 1), encoding="utf-8")
