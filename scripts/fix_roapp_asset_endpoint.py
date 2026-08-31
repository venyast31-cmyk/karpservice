from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


path = Path("worker/src/index.js")
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    'var ROAPP_BASE = "https://api.roapp.io/v2";\n',
    'var ROAPP_BASE = "https://api.roapp.io/v2";\n'
    'var ROAPP_ASSET_BASES = [\n'
    '  "https://api.roapp.io/warehouse/assets",\n'
    '  `${ROAPP_BASE}/warehouse/assets`\n'
    '];\n',
    "asset API base list",
)

old_get_assets = '''async function getCustomerAssets(env, customerId) {
  const assetsUrl = new URL(`${ROAPP_BASE}/warehouse/assets`);
  assetsUrl.searchParams.append("owner_id", String(customerId));
  const response = await roappRequest(env, assetsUrl.toString());
  const assets = extractList(response.data, ["assets"]);
  return assets.filter((asset) => {
    const ownerId = assetOwnerId(asset);
    return ownerId === 0 || ownerId === Number(customerId);
  });
}'''
new_get_assets = '''async function getCustomerAssets(env, customerId) {
  const response = await roappAssetRequest(env, (baseUrl) => {
    const assetsUrl = new URL(baseUrl);
    assetsUrl.searchParams.append("owner_id", String(customerId));
    return assetsUrl.toString();
  });
  const assets = extractList(response.data, ["assets"]);
  return assets.filter((asset) => {
    const ownerId = assetOwnerId(asset);
    return ownerId === 0 || ownerId === Number(customerId);
  });
}'''
text = replace_once(text, old_get_assets, new_get_assets, "customer asset loading")

old_find_asset = '''async function findAssetByVin(env, vin) {
  const assetsUrl = new URL(`${ROAPP_BASE}/warehouse/assets`);
  assetsUrl.searchParams.append("uid", vin);
  const response = await roappRequest(env, assetsUrl.toString());
  const assets = extractList(response.data, ["assets"]);
  return assets.find((asset) => assetVin(asset) === vin) || null;
}'''
new_find_asset = '''async function findAssetByVin(env, vin) {
  const response = await roappAssetRequest(env, (baseUrl) => {
    const assetsUrl = new URL(baseUrl);
    assetsUrl.searchParams.append("uid", vin);
    return assetsUrl.toString();
  });
  const assets = extractList(response.data, ["assets"]);
  return assets.find((asset) => assetVin(asset) === vin) || null;
}'''
text = replace_once(text, old_find_asset, new_find_asset, "VIN asset lookup")

old_create = '''  const createResponse = await roappRequest(
    env,
    `${ROAPP_BASE}/warehouse/assets`,
    {
      method: "POST",
      body: JSON.stringify({ uid: vin, owner_id: numericCustomerId })
    }
  );'''
new_create = '''  const createResponse = await roappAssetRequest(
    env,
    (baseUrl) => baseUrl,
    {
      method: "POST",
      body: JSON.stringify({ uid: vin, owner_id: numericCustomerId })
    }
  );'''
text = replace_once(text, old_create, new_create, "asset creation")

helper = '''async function roappAssetRequest(env, buildUrl, options = {}) {
  let lastError = null;
  for (const baseUrl of ROAPP_ASSET_BASES) {
    const url = buildUrl(baseUrl);
    try {
      return await roappRequest(env, url, options);
    } catch (error) {
      lastError = error;
      const status = Number(error?.status);
      if (![404, 405].includes(status)) throw error;
      console.warn(JSON.stringify({
        event: "roapp_asset_endpoint_fallback",
        status,
        endpoint: new URL(url).pathname
      }));
    }
  }
  throw lastError || new Error("RO App не повернув API автомобілів");
}
__name(roappAssetRequest, "roappAssetRequest");
'''
text = replace_once(
    text,
    'async function roappRequest(env, url, options = {}) {',
    helper + 'async function roappRequest(env, url, options = {}) {',
    "asset request fallback helper",
)

path.write_text(text, encoding="utf-8")
