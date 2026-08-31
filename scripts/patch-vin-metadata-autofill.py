from pathlib import Path
import re
import textwrap


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return updated


worker_path = Path("worker/src/index.js")
worker = worker_path.read_text(encoding="utf-8")

helpers = textwrap.dedent(r'''
function shouldRetryRoappAssetEncoding(error) {
  const status = Number(error?.status);
  if (status === 415) return true;
  if (![400, 422].includes(status)) return false;
  const text = String(error?.message || "").toLowerCase();
  return /invalid data type|invalid type|type error|content[- ]?type|malformed|invalid json|request body/.test(text);
}
__name(shouldRetryRoappAssetEncoding, "shouldRetryRoappAssetEncoding");
function decodeVinHtmlText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
      const number = Number.parseInt(code, 16);
      return Number.isInteger(number) && number > 0 && number <= 1114111
        ? String.fromCodePoint(number)
        : match;
    })
    .replace(/&#([0-9]+);/g, (match, code) => {
      const number = Number.parseInt(code, 10);
      return Number.isInteger(number) && number > 0 && number <= 1114111
        ? String.fromCodePoint(number)
        : match;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}
__name(decodeVinHtmlText, "decodeVinHtmlText");
function extractVinHtmlField(html, label) {
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html || "").match(
    new RegExp(`<th[^>]*>\\s*${escapedLabel}\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "i")
  );
  return decodeVinHtmlText(match?.[1] || "");
}
__name(extractVinHtmlField, "extractVinHtmlField");
function validDecodedVehicleText(value, maxLength) {
  const text = decodeVinHtmlText(value).slice(0, maxLength);
  if (!text || /not found|unknown|невідом/i.test(text)) return "";
  return text;
}
__name(validDecodedVehicleText, "validDecodedVehicleText");
async function lookupVehicleIdentityByVin(vin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(
      `https://autoua.com.ua/vin/${encodeURIComponent(vin)}?lang=en`,
      {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en,uk;q=0.9",
          "User-Agent": "Karpservice/1.0 VIN lookup"
        }
      }
    );
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html/i.test(contentType)) return null;
    const html = await response.text();
    if (html.length > 600000 || !html.toUpperCase().includes(vin)) return null;

    const brand = validDecodedVehicleText(extractVinHtmlField(html, "Make"), 80);
    const model = validDecodedVehicleText(extractVinHtmlField(html, "Model"), 120);
    const rawYear = extractVinHtmlField(html, "Year");
    const year = /^\d{4}$/.test(rawYear) ? rawYear : "";
    if (!brand || !model) return null;
    return { brand, model, year };
  } catch (error) {
    console.warn(JSON.stringify({
      event: "vin_identity_lookup",
      success: false,
      reason: error?.name === "AbortError" ? "timeout" : "request_failed"
    }));
    return null;
  } finally {
    clearTimeout(timer);
  }
}
__name(lookupVehicleIdentityByVin, "lookupVehicleIdentityByVin");
function needsVehicleIdentity(error) {
  if (!isRoappAssetValidationError(error)) return false;
  const text = String(error?.message || "");
  return /(brand|марка|model|модель)/i.test(text) &&
    /(required|must|необхідно|заповнити|обов'язков)/i.test(text);
}
__name(needsVehicleIdentity, "needsVehicleIdentity");
''').strip("\n")

worker = replace_once(
    worker,
    '__name(isRoappAssetValidationError, "isRoappAssetValidationError");\nfunction buildRoappAssetCreateOptions',
    '__name(isRoappAssetValidationError, "isRoappAssetValidationError");\n' + helpers + '\nfunction buildRoappAssetCreateOptions',
    "VIN identity helpers",
)

worker = replace_once(
    worker,
    '      if (!isRoappAssetValidationError(error)) throw error;',
    '      if (!shouldRetryRoappAssetEncoding(error)) throw error;',
    "encoding retry condition",
)

create_block = textwrap.dedent(r'''
  let createPayload = { uid: vin, owner_id: numericCustomerId };
  let createResponse = null;
  let createError = null;

  for (let attempt = 0; attempt < 3 && !createResponse; attempt++) {
    try {
      createResponse = await createRoappAssetCompatible(env, createPayload);
    } catch (error) {
      createError = error;
      if (!isRoappAssetValidationError(error)) throw error;

      const errorText = String(error?.message || "");
      let payloadChanged = false;

      if (needsVehicleIdentity(error) && (!createPayload.brand || !createPayload.model)) {
        const identity = await lookupVehicleIdentityByVin(vin);
        if (!identity) {
          return json({
            success: false,
            error: "Не вдалося автоматично визначити марку та модель за цим VIN. Перевірте VIN або зверніться до сервісу."
          }, 422, responseHeaders);
        }
        createPayload = {
          ...createPayload,
          brand: identity.brand,
          model: identity.model,
          ...(identity.year ? { year: identity.year } : {})
        };
        payloadChanged = true;
      }

      if (/group|груп/i.test(errorText) && !createPayload.group) {
        createPayload = {
          ...createPayload,
          group: await inferCustomerVehicleGroup(env, numericCustomerId)
        };
        payloadChanged = true;
      }

      if (!payloadChanged) throw error;
    }
  }

  if (!createResponse) {
    throw createError || new Error("RO App не створив автомобіль");
  }
  let asset = extractRecord(createResponse.data, ["asset"]);
''').rstrip("\n")

worker = sub_once(
    worker,
    r'''  const createPayload = \{ uid: vin, owner_id: numericCustomerId \};\n  let createResponse;[\s\S]*?\n  let asset = extractRecord\(createResponse\.data, \["asset"\]\);''',
    create_block,
    "CRM create flow",
)

worker = replace_once(
    worker,
    '    car: publicAssetCar(asset || { uid: vin })',
    '    car: publicAssetCar(asset || { uid: vin, brand: createPayload.brand, model: createPayload.model, year: createPayload.year })',
    "created car fallback",
)

worker_path.write_text(worker, encoding="utf-8")

test_path = Path("worker/test/worker-security.test.mjs")
test = test_path.read_text(encoding="utf-8")

test = replace_once(
    test,
    '  let createdAsset = null;\n  const originalFetch = globalThis.fetch;',
    '  let createdAsset = null;\n  let vinIdentityLookups = 0;\n  const originalFetch = globalThis.fetch;',
    "test VIN lookup state",
)

test = replace_once(
    test,
    '''    const url = new URL(String(input));
    assert.equal(url.hostname, "api.roapp.io");
    const method = String(init.method || "GET").toUpperCase();''',
    '''    const url = new URL(String(input));
    if (url.hostname === "autoua.com.ua") {
      vinIdentityLookups += 1;
      if (url.pathname.includes("TMBDX41U79B008586")) {
        return new Response(`<!doctype html><html><head>
          <title>Skoda Octavia 2008 - Vehicle Information TMBDX41U79B008586</title>
          </head><body><table>
          <tr><th>Make</th><td>Skoda</td></tr>
          <tr><th>Model</th><td>Octavia</td></tr>
          <tr><th>Year</th><td>2008</td></tr>
          </table></body></html>`, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=UTF-8" }
        });
      }
      return new Response("Not found", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=UTF-8" }
      });
    }
    assert.equal(url.hostname, "api.roapp.io");
    const method = String(init.method || "GET").toUpperCase();''',
    "test external VIN source",
)

test = replace_once(
    test,
    '''      if (method === "POST") {
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
      }''',
    '''      if (method === "POST") {
        const payload = requestBody || {};
        if (!payload.brand || !payload.model) {
          return Response.json({
            errors: {
              brand: ["Необхідно заповнити"],
              model: ["Необхідно заповнити"]
            }
          }, { status: 422 });
        }
        createdAsset = {
          id: 501,
          uid: payload.uid,
          owner_id: payload.owner_id,
          brand: payload.brand,
          model: payload.model,
          year: payload.year || "",
          group: payload.group || "Автомобіль"
        };
        return Response.json({});
      }''',
    "test CRM required identity fields",
)

test = replace_once(
    test,
    '    const vin = "JMBSRCS3A6U011108";',
    '    const vin = "TMBDX41U79B008586";',
    "test current VIN",
)

old_assertions = '''    const createAssetCall = roappCalls.find(({ url, method }) =>
      method === "POST" && url.pathname === "/v2/warehouse/assets"
    );
    assert.ok(createAssetCall, "asset must be created through the RO App API");
    assert.equal(typeof createAssetCall.body.uid, "string");
    assert.equal(createAssetCall.body.uid, vin);
    assert.equal(createAssetCall.body.owner_id, 123);'''

new_assertions = '''    const createAssetCalls = roappCalls.filter(({ url, method, body }) =>
      method === "POST" &&
      url.pathname === "/v2/warehouse/assets" &&
      body?.uid === vin
    );
    assert.equal(createAssetCalls.length, 2, "CRM is retried once with decoded identity");
    const createAssetCall = createAssetCalls.at(-1);
    assert.equal(typeof createAssetCall.body.uid, "string");
    assert.equal(createAssetCall.body.uid, vin);
    assert.equal(createAssetCall.body.owner_id, 123);
    assert.equal(createAssetCall.body.brand, "Skoda");
    assert.equal(createAssetCall.body.model, "Octavia");
    assert.equal(createAssetCall.body.year, "2008");
    assert.equal(vinIdentityLookups, 1);

    const unknownVinResponse = await callWorker("/cars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vin: "WVWZZZ1JZXW000001" })
    });
    assert.equal(unknownVinResponse.status, 422);
    assert.match((await unknownVinResponse.json()).error, /марку та модель/i);'''

test = replace_once(test, old_assertions, new_assertions, "VIN regression assertions")
test_path.write_text(test, encoding="utf-8")
