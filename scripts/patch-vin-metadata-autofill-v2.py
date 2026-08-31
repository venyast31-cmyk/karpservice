from pathlib import Path
import re
import runpy


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


# The first patch script already has the complete Worker transformation. It exits
# only when it reaches an outdated test fixture; keep its Worker changes and patch
# the current fixture below.
try:
    runpy.run_path("scripts/patch-vin-metadata-autofill.py", run_name="__main__")
except SystemExit as error:
    if "test VIN lookup state" not in str(error):
        raise


test_path = Path("worker/test/worker-security.test.mjs")
test = test_path.read_text(encoding="utf-8")

test = replace_once(
    test,
    '  let createdAsset = null;\n  let rejectJsonAssetCreate = true;\n  const originalFetch = globalThis.fetch;',
    '  let createdAsset = null;\n  let rejectJsonAssetCreate = true;\n  let vinIdentityLookups = 0;\n  const originalFetch = globalThis.fetch;',
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
        if (rejectJsonAssetCreate && requestContentType.includes("application/json")) {
          rejectJsonAssetCreate = false;
          return Response.json({ uid: ["Invalid data type"] }, { status: 400 });
        }
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
        if (rejectJsonAssetCreate && requestContentType.includes("application/json")) {
          rejectJsonAssetCreate = false;
          return Response.json({ uid: ["Invalid data type"] }, { status: 400 });
        }
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

new_assertions = '''    const createAssetCalls = roappCalls.filter(({ url, method, body }) =>
      method === "POST" &&
      url.pathname === "/v2/warehouse/assets" &&
      body?.uid === vin
    );
    assert.equal(createAssetCalls.length, 3, "CRM retries encoding, then retries with decoded identity");
    const createAssetCall = createAssetCalls.at(-1);
    assert.equal(typeof createAssetCall.body.uid, "string");
    assert.equal(createAssetCall.body.uid, vin);
    assert.equal(createAssetCall.body.owner_id, 123);
    assert.equal(createAssetCall.body.brand, "Skoda");
    assert.equal(createAssetCall.body.model, "Octavia");
    assert.equal(createAssetCall.body.year, "2008");
    assert.equal(vinIdentityLookups, 1);
    assert.ok(createAssetCalls[0].contentType.includes("application/json"));
    assert.ok(
      createAssetCalls[1].contentType.includes("application/x-www-form-urlencoded") ||
        !createAssetCalls[1].contentType,
      "a non-JSON format must be attempted after the data-type error"
    );

    const unknownVinResponse = await callWorker("/cars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vin: "WVWZZZ1JZXW000001" })
    });
    assert.equal(unknownVinResponse.status, 422);
    assert.match((await unknownVinResponse.json()).error, /марку та модель/i);'''

test = sub_once(
    test,
    r'''    const createAssetCall = roappCalls\.find\(\(\{ url, method \}\) =>[\s\S]*?      "a non-JSON request format must be attempted after RO App rejects JSON"\n    \);''',
    new_assertions,
    "VIN regression assertions",
)

test_path.write_text(test, encoding="utf-8")
