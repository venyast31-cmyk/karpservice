from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


worker_path = Path("worker/src/index.js")
worker = worker_path.read_text(encoding="utf-8")
worker = replace_once(
    worker,
    'assetsUrl.searchParams.append("owner_id", String(customerId));',
    'assetsUrl.searchParams.append("owner_id[]", String(customerId));',
    "owner asset array filter",
)
worker = replace_once(
    worker,
    'assetsUrl.searchParams.append("uid", vin);',
    'assetsUrl.searchParams.append("uid[]", vin);',
    "VIN asset array filter",
)
worker_path.write_text(worker, encoding="utf-8")


test_path = Path("worker/test/worker-security.test.mjs")
test = test_path.read_text(encoding="utf-8")

test = replace_once(
    test,
    '  let orderOwnerId = 123;\n  const originalFetch = globalThis.fetch;',
    '  let orderOwnerId = 123;\n  let createdAsset = null;\n  const originalFetch = globalThis.fetch;',
    "test asset state",
)

test = replace_once(
    test,
    '''    roappCalls.push({ url, method: String(init.method || "GET").toUpperCase() });

    if (url.pathname === "/v2/contacts/people") {''',
    '''    const method = String(init.method || "GET").toUpperCase();
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

    if (url.pathname === "/v2/contacts/people") {''',
    "asset API mock",
)

test = replace_once(
    test,
    '''    assert.equal(
      contactCall.url.searchParams.getAll("phones").some((phone) => phone.replace(/\\D/g, "") === PHONE),
      true
    );

    orderOwnerId = 999;''',
    '''    assert.equal(
      contactCall.url.searchParams.getAll("phones").some((phone) => phone.replace(/\\D/g, "") === PHONE),
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

    orderOwnerId = 999;''',
    "asset regression assertions",
)

test_path.write_text(test, encoding="utf-8")
