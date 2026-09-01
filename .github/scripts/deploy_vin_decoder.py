from pathlib import Path
import sys

SOURCE = Path("worker/src/index.js")
TEST = Path("worker/test/worker-security.test.mjs")
HEALTH_MARKER = '      if (url.pathname === "/health" && request.method === "GET") {'
CHECK_ROUTE_START = '      if (url.pathname === "/health/vin-decoder-check" && request.method === "GET") {'

NEW_LOOKUP_FUNCTION = r'''function cleanVehicleIdentityText(value, maxLength) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  if (!text || /^(?:unknown|null|undefined|n\/a|not found|-)$/i.test(text)) {
    return "";
  }
  return text;
}
__name(cleanVehicleIdentityText, "cleanVehicleIdentityText");
async function lookupVehicleIdentityByVin(vin) {
  const normalizedVin = normalizeVin(vin);
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalizedVin)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(
      `https://db.vin/api/v1/vin/${encodeURIComponent(normalizedVin)}`,
      {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Karpservice/1.0 VIN lookup"
        }
      }
    );
    if (!response.ok) {
      console.warn(JSON.stringify({
        event: "vin_identity_lookup",
        source: "db_vin",
        success: false,
        reason: "http_error",
        status: response.status
      }));
      return null;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!/application\/json/i.test(contentType)) {
      console.warn(JSON.stringify({
        event: "vin_identity_lookup",
        source: "db_vin",
        success: false,
        reason: "unexpected_content_type"
      }));
      return null;
    }
    const raw = await response.text();
    if (!raw || raw.length > 200000) return null;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!data || typeof data !== "object") return null;
    if (normalizeVin(data.vin) !== normalizedVin) {
      console.warn(JSON.stringify({
        event: "vin_identity_lookup",
        source: "db_vin",
        success: false,
        reason: "vin_mismatch"
      }));
      return null;
    }
    const brand = cleanVehicleIdentityText(data.brand ?? data.make, 80);
    const model = cleanVehicleIdentityText(data.model, 120);
    const numericYear = Number(data.year ?? data.modelYear ?? data.model_year);
    const maxYear = new Date().getUTCFullYear() + 2;
    const year = Number.isInteger(numericYear) && numericYear >= 1886 && numericYear <= maxYear
      ? String(numericYear)
      : "";
    if (!brand || !model) return null;
    return { brand, model, year };
  } catch (error) {
    console.warn(JSON.stringify({
      event: "vin_identity_lookup",
      source: "db_vin",
      success: false,
      reason: error?.name === "AbortError" ? "timeout" : "request_failed"
    }));
    return null;
  } finally {
    clearTimeout(timer);
  }
}
__name(lookupVehicleIdentityByVin, "lookupVehicleIdentityByVin");'''

CHECK_ROUTE = r'''      if (url.pathname === "/health/vin-decoder-check" && request.method === "GET") {
        const identity = await lookupVehicleIdentityByVin("TMBDX41U79B008586");
        const success = Boolean(
          identity &&
          String(identity.brand).toLowerCase() === "skoda" &&
          String(identity.model).toLowerCase() === "octavia" &&
          String(identity.year) === "2008"
        );
        return json2({
          marker: "vin_decoder_dbvin_v1",
          success,
          identity
        }, success ? 200 : 502, corsHeaders);
      }
'''

TEST_DB_VIN_BLOCK = r'''    if (url.hostname === "db.vin") {
      vinIdentityLookups += 1;
      const vin = url.pathname.split("/").at(-1);
      if (vin === "TMBDX41U79B008586") {
        return Response.json({
          vin,
          brand: "Skoda",
          model: "Octavia",
          year: 2008
        });
      }
      return Response.json({ message: "Not found" }, { status: 404 });
    }
'''


def remove_old_diagnostics(text: str) -> str:
    health_pos = text.find(HEALTH_MARKER)
    if health_pos < 0:
        raise RuntimeError("health route marker not found")
    markers = [
        '      if (url.pathname === "/health/vin-source"',
        '      if (url.pathname === "/health/roapp-app-vin"',
        '      if (url.pathname === "/health/roapp-vin-lookup"',
        CHECK_ROUTE_START,
    ]
    positions = [
        pos for marker in markers
        if (pos := text.find(marker)) >= 0 and pos < health_pos
    ]
    return text[:min(positions)] + text[health_pos:] if positions else text


def patch_test() -> None:
    text = TEST.read_text(encoding="utf-8")
    old_start = '    if (url.hostname === "autoua.com.ua") {'
    next_marker = '    assert.equal(url.hostname, "api.roapp.io");'
    start = text.find(old_start)
    if start < 0:
        if TEST_DB_VIN_BLOCK in text:
            return
        raise RuntimeError("old VIN decoder test mock not found")
    end = text.find(next_marker, start)
    if end < 0:
        raise RuntimeError("RO App test request marker not found")
    TEST.write_text(text[:start] + TEST_DB_VIN_BLOCK + text[end:], encoding="utf-8")


def patch() -> None:
    text = remove_old_diagnostics(SOURCE.read_text(encoding="utf-8"))
    start_marker = "async function lookupVehicleIdentityByVin(vin) {"
    end_marker = '__name(lookupVehicleIdentityByVin, "lookupVehicleIdentityByVin");'
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError("lookupVehicleIdentityByVin start marker not found")
    end = text.find(end_marker, start)
    if end < 0:
        raise RuntimeError("lookupVehicleIdentityByVin end marker not found")
    end += len(end_marker)
    text = text[:start] + NEW_LOOKUP_FUNCTION + text[end:]
    health_pos = text.find(HEALTH_MARKER)
    if health_pos < 0:
        raise RuntimeError("health route marker disappeared")
    text = text[:health_pos] + CHECK_ROUTE + text[health_pos:]
    SOURCE.write_text(text, encoding="utf-8")
    patch_test()


def cleanup() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    start = text.find(CHECK_ROUTE_START)
    if start < 0:
        raise RuntimeError("temporary VIN decoder route not found")
    end = text.find(HEALTH_MARKER, start)
    if end < 0:
        raise RuntimeError("health route after temporary check not found")
    SOURCE.write_text(text[:start] + text[end:], encoding="utf-8")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "patch":
        patch()
    elif mode == "cleanup":
        cleanup()
    else:
        raise SystemExit("usage: deploy_vin_decoder.py patch|cleanup")
