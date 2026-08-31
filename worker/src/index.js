import {
  authConfigured,
  corsHeadersFor,
  handleAuthRoute,
  requireAuthSession
} from "./auth.js";

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/orders.js
var ROAPP_BASE = "https://api.roapp.io/v2";
var ROAPP_ASSET_BASES = [
  `${ROAPP_BASE}/warehouse/assets`,
  "https://api.roapp.io/warehouse/assets"
];
var ORDER_PAGE_SIZE = 100;
var MAX_ORDER_PAGES = 45;
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=UTF-8",
  "Cache-Control": "no-store"
};
async function getCustomerData(url, env, responseHeaders = CORS_HEADERS) {
  const phone = normalizePhone(url.searchParams.get("phone"));
  if (phone.length < 10) {
    return json({ success: false, error: "\u0412\u043A\u0430\u0436\u0456\u0442\u044C \u043D\u043E\u043C\u0435\u0440 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443" }, 400, responseHeaders);
  }
  const customer = await findCustomerByPhone(env, phone);
  if (!customer?.id) {
    return json({ success: true, found: false, customer: null, cars: [] }, 200, responseHeaders);
  }
  const orderResult = await getAllCustomerOrders(env, customer.id);
  let assets = [];
  try {
    assets = await getCustomerAssets(env, customer.id);
  } catch (error) {
    console.error(JSON.stringify({ event: "customer_assets_load", success: false, message: error instanceof Error ? error.message : String(error) }));
  }
  const cars = mergeCustomerAssets(assets, orderResult.orders);
  return json({
    success: true,
    found: true,
    customer: {
      id: Number(customer.id),
      first_name: customer.first_name || customer.name || "",
      last_name: customer.last_name || "",
      phone: `+${phone}`
    },
    cars,
    history: {
      loaded: orderResult.orders.length,
      total: orderResult.total,
      complete: orderResult.complete
    }
  }, 200, responseHeaders);
}
__name(getCustomerData, "getCustomerData");
async function getOrderDetails(url, env, responseHeaders = CORS_HEADERS) {
  const phone = normalizePhone(url.searchParams.get("phone"));
  const orderId = Number(url.searchParams.get("order_id"));
  if (phone.length < 10 || !Number.isInteger(orderId) || orderId <= 0) {
    return json({
      success: false,
      error: "\u041D\u0435 \u0432\u0438\u0441\u0442\u0430\u0447\u0430\u0454 \u0434\u0430\u043D\u0438\u0445 \u0434\u043B\u044F \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0437\u0430\u043C\u043E\u0432\u043B\u0435\u043D\u043D\u044F"
    }, 400, responseHeaders);
  }
  const customer = await findCustomerByPhone(env, phone);
  if (!customer?.id) {
    return json({ success: false, error: "\u041A\u043B\u0456\u0454\u043D\u0442\u0430 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E" }, 404, responseHeaders);
  }
  const detailResponse = await roappRequest(
    env,
    `${ROAPP_BASE}/orders/${orderId}`
  );
  const order = extractRecord(detailResponse.data, ["order"]);
  if (!order?.id) {
    return json({ success: false, error: "\u0417\u0430\u043C\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E" }, 404, responseHeaders);
  }
  let orderClientId = extractOrderClientId(order);
  if (!orderClientId) {
    const checkUrl = new URL(`${ROAPP_BASE}/orders`);
    checkUrl.searchParams.set("page", "1");
    checkUrl.searchParams.set("pageSize", "10");
    checkUrl.searchParams.append("ids", String(orderId));
    checkUrl.searchParams.append("client_ids", String(customer.id));
    const checkResponse = await roappRequest(env, checkUrl.toString());
    const match = extractList(checkResponse.data, ["orders"]).find((item) => Number(item?.id) === orderId);
    orderClientId = extractOrderClientId(match) || (match ? Number(customer.id) : 0);
  }
  if (Number(orderClientId) !== Number(customer.id)) {
    return json({ success: false, error: "\u0417\u0430\u043C\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E" }, 404, responseHeaders);
  }
  let items = extractOrderItems(order);
  if (!items.length) {
    const collections = [
      { path: "items", kind: "" },
      { path: "services", kind: "service" },
      { path: "products", kind: "product" }
    ];
    for (const collection of collections) {
      try {
        const response = await roappRequest(
          env,
          `${ROAPP_BASE}/orders/${orderId}/${collection.path}`
        );
        const loaded = extractOrderItems(response.data, /* @__PURE__ */ new Set(), collection.kind);
        items.push(...loaded);
      } catch (error) {
        if (![404, 405].includes(Number(error?.status))) throw error;
      }
    }
    items = uniqueOrderItems(items);
  }
  return json({
    success: true,
    order: publicOrderDetails(order, items)
  }, 200, responseHeaders);
}
__name(getOrderDetails, "getOrderDetails");
async function findCustomerByPhone(env, phone) {
  const peopleUrl = new URL(`${ROAPP_BASE}/contacts/people`);
  peopleUrl.searchParams.set("page", "1");
  peopleUrl.searchParams.set("sort", "-modified_at");
  for (const variant of phoneVariants(phone)) {
    peopleUrl.searchParams.append("phones", variant);
  }
  const peopleResponse = await roappRequest(env, peopleUrl.toString());
  const people = extractList(peopleResponse.data, ["people", "contacts"]);
  return people.find((person) => personHasPhone(person, phone)) || (people.length === 1 ? people[0] : null);
}
__name(findCustomerByPhone, "findCustomerByPhone");
async function getAllCustomerOrders(env, customerId) {
  const ordersById = /* @__PURE__ */ new Map();
  let total = null;
  let complete = true;
  for (let page = 1; page <= MAX_ORDER_PAGES; page++) {
    const ordersUrl = new URL(`${ROAPP_BASE}/orders`);
    ordersUrl.searchParams.set("page", String(page));
    ordersUrl.searchParams.set("pageSize", String(ORDER_PAGE_SIZE));
    ordersUrl.searchParams.set("sort", "-id");
    ordersUrl.searchParams.append("client_ids", String(customerId));
    const response = await roappRequest(env, ordersUrl.toString());
    const pageOrders = extractList(response.data, ["orders"]);
    const responseTotal = extractCount(response.data);
    if (total === null && Number.isFinite(responseTotal)) total = responseTotal;
    for (const order of pageOrders) {
      const id = Number(order?.id);
      const key = id > 0 ? `id:${id}` : `page:${page}:${ordersById.size}`;
      if (!ordersById.has(key)) ordersById.set(key, order);
    }
    const loaded = ordersById.size;
    if (!pageOrders.length) break;
    if (Number.isFinite(total) && loaded >= total) break;
    if (pageOrders.length < ORDER_PAGE_SIZE) break;
    if (page === MAX_ORDER_PAGES) {
      complete = false;
      break;
    }
    await delay(520);
  }
  const orders = [...ordersById.values()];
  if (total === null) total = orders.length;
  if (orders.length < total) complete = false;
  return { orders, total, complete };
}
__name(getAllCustomerOrders, "getAllCustomerOrders");
async function getCustomerAssets(env, customerId) {
  const response = await roappAssetRequest(env, (baseUrl) => {
    const assetsUrl = new URL(baseUrl);
    assetsUrl.searchParams.append("owner_id[]", String(customerId));
    return assetsUrl.toString();
  });
  const assets = extractList(response.data, ["assets"]);
  return assets.filter((asset) => {
    const ownerId = assetOwnerId(asset);
    return ownerId === 0 || ownerId === Number(customerId);
  });
}
__name(getCustomerAssets, "getCustomerAssets");
function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
}
__name(normalizeVin, "normalizeVin");
function assetVin(asset) {
  return normalizeVin(
    asset?.uid || asset?.vin || asset?.serial || asset?.serial_number || ""
  );
}
__name(assetVin, "assetVin");
function assetOwnerId(asset) {
  return Number(
    asset?.owner_id ?? asset?.owner?.id ?? asset?.client_id ?? asset?.client?.id ?? 0
  ) || 0;
}
__name(assetOwnerId, "assetOwnerId");
function publicAssetCar(asset, history = []) {
  const vin = assetVin(asset);
  const brand = valueTitle(asset?.brand);
  const model = valueTitle(asset?.model);
  const decodedTitle = [brand, model].filter(Boolean).join(" ").trim();
  const rawTitle = firstText(asset?.title, asset?.name);
  const title = decodedTitle || (
    rawTitle && normalizeVin(rawTitle) !== vin ? rawTitle : "Автомобіль"
  );
  return {
    id: Number(asset?.id) || stableNumber(vin),
    title,
    brand,
    model,
    modification: valueTitle(asset?.modification),
    year: asset?.year || asset?.production_year || "",
    vin,
    history: Array.isArray(history) ? history : []
  };
}
__name(publicAssetCar, "publicAssetCar");
function mergeCustomerAssets(assets, orders) {
  const cars = [];
  const byId = /* @__PURE__ */ new Map();
  const byVin = /* @__PURE__ */ new Map();
  const remember = (car) => {
    cars.push(car);
    const id = Number(car?.id);
    const vin = normalizeVin(car?.vin);
    if (id > 0) byId.set(id, car);
    if (vin) byVin.set(vin, car);
  };
  for (const asset of assets || []) {
    remember(publicAssetCar(asset));
  }
  for (const orderCar of buildCarsFromOrders(orders)) {
    const id = Number(orderCar?.id);
    const vin = normalizeVin(orderCar?.vin);
    const current = (id > 0 ? byId.get(id) : null) || (vin ? byVin.get(vin) : null);
    if (!current) {
      remember({ ...orderCar, vin });
      continue;
    }
    current.history = Array.isArray(orderCar.history) ? orderCar.history : [];
    for (const field of ["brand", "model", "modification", "year", "vin"]) {
      if (!current[field] && orderCar[field]) current[field] = orderCar[field];
    }
    if ((!current.title || current.title === "Автомобіль") && orderCar.title) {
      current.title = orderCar.title;
    }
  }
  return cars;
}
__name(mergeCustomerAssets, "mergeCustomerAssets");
async function findAssetByVin(env, vin) {
  const response = await roappAssetRequest(env, (baseUrl) => {
    const assetsUrl = new URL(baseUrl);
    assetsUrl.searchParams.append("uid[]", vin);
    return assetsUrl.toString();
  });
  const assets = extractList(response.data, ["assets"]);
  return assets.find((asset) => assetVin(asset) === vin) || null;
}
__name(findAssetByVin, "findAssetByVin");
async function inferCustomerVehicleGroup(env, customerId) {
  try {
    const assets = await getCustomerAssets(env, customerId);
    for (const asset of assets) {
      const group = valueTitle(asset?.group).trim();
      if (group) return group;
    }
  } catch (error) {
    console.warn(JSON.stringify({
      event: "asset_group_from_assets",
      success: false,
      message: error instanceof Error ? error.message : String(error)
    }));
  }
  try {
    const orderResult = await getAllCustomerOrders(env, customerId);
    for (const order of orderResult.orders) {
      const asset = order?.asset || order?.vehicle || order?.customer_asset;
      const group = valueTitle(asset?.group).trim();
      if (group) return group;
    }
  } catch (error) {
    console.warn(JSON.stringify({
      event: "asset_group_from_orders",
      success: false,
      message: error instanceof Error ? error.message : String(error)
    }));
  }
  return "Автомобіль";
}
__name(inferCustomerVehicleGroup, "inferCustomerVehicleGroup");
function isRoappAssetValidationError(error) {
  return [400, 415, 422].includes(Number(error?.status));
}
__name(isRoappAssetValidationError, "isRoappAssetValidationError");
function buildRoappAssetCreateOptions(payload, format) {
  if (format === "form") {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null && value !== "") {
        form.set(key, String(value));
      }
    }
    return {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: form.toString()
    };
  }
  if (format === "multipart") {
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null && value !== "") {
        form.set(key, String(value));
      }
    }
    return { method: "POST", body: form };
  }
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
}
__name(buildRoappAssetCreateOptions, "buildRoappAssetCreateOptions");
async function findAssetAfterCreateAttempt(env, vin) {
  try {
    await delay(420);
    return await findAssetByVin(env, vin);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "asset_create_verification_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return null;
  }
}
__name(findAssetAfterCreateAttempt, "findAssetAfterCreateAttempt");
async function createRoappAssetCompatible(env, payload) {
  let lastError = null;
  for (const format of ["json", "form", "multipart"]) {
    try {
      return await roappAssetRequest(
        env,
        (baseUrl) => baseUrl,
        buildRoappAssetCreateOptions(payload, format)
      );
    } catch (error) {
      lastError = error;
      const existing = await findAssetAfterCreateAttempt(env, payload.uid);
      if (existing) {
        return { status: 200, data: { data: existing } };
      }
      if (!isRoappAssetValidationError(error)) throw error;
      console.warn(JSON.stringify({
        event: "asset_create_encoding_fallback",
        format,
        status: Number(error?.status) || 0,
        message: error instanceof Error ? error.message : String(error)
      }));
      await delay(420);
    }
  }
  throw lastError || new Error("RO App не прийняв дані автомобіля");
}
__name(createRoappAssetCompatible, "createRoappAssetCompatible");
async function createCustomerAsset(request, env, customerId, responseHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Некоректні дані запиту" }, 400, responseHeaders);
  }
  const vin = normalizeVin(body?.vin || body?.uid);
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return json({
      success: false,
      error: "VIN має містити рівно 17 символів без літер I, O та Q"
    }, 400, responseHeaders);
  }
  const numericCustomerId = Number(customerId);
  if (!Number.isInteger(numericCustomerId) || numericCustomerId <= 0) {
    return json({ success: false, error: "Клієнта не знайдено" }, 404, responseHeaders);
  }

  const existing = await findAssetByVin(env, vin);
  if (existing) {
    const ownerId = assetOwnerId(existing);
    let belongsToCustomer = ownerId === numericCustomerId;
    if (!ownerId) {
      const customerAssets = await getCustomerAssets(env, numericCustomerId);
      belongsToCustomer = customerAssets.some((asset) => {
        const sameId = Number(asset?.id) > 0 && Number(asset?.id) === Number(existing?.id);
        return sameId || assetVin(asset) === vin;
      });
    }
    if (!belongsToCustomer) {
      return json({
        success: false,
        error: "Автомобіль з таким VIN уже зареєстрований у CRM. Зверніться до сервісу."
      }, 409, responseHeaders);
    }
    return json({
      success: true,
      created: false,
      already_exists: true,
      message: "Цей автомобіль уже є у вашому профілі",
      car: publicAssetCar(existing)
    }, 200, responseHeaders);
  }

  const createPayload = { uid: vin, owner_id: numericCustomerId };
  let createResponse;
  try {
    createResponse = await createRoappAssetCompatible(env, createPayload);
  } catch (error) {
    const errorText = String(error?.message || "");
    const needsGroup = isRoappAssetValidationError(error) && /group|груп/i.test(errorText);
    if (!needsGroup) throw error;
    const group = await inferCustomerVehicleGroup(env, numericCustomerId);
    createResponse = await createRoappAssetCompatible(env, { ...createPayload, group });
  }
  let asset = extractRecord(createResponse.data, ["asset"]);

  for (let attempt = 0; attempt < 3; attempt++) {
    const hasDecodedData = valueTitle(asset?.brand) || valueTitle(asset?.model);
    if (hasDecodedData) break;
    await delay(650);
    const refreshed = await findAssetByVin(env, vin);
    if (refreshed) asset = refreshed;
  }

  return json({
    success: true,
    created: true,
    already_exists: false,
    message: "Автомобіль додано до CRM",
    car: publicAssetCar(asset || { uid: vin })
  }, 200, responseHeaders);
}
__name(createCustomerAsset, "createCustomerAsset");
async function roappAssetRequest(env, buildUrl, options = {}) {
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
function readableRoappError(value, path = "", depth = 0) {
  if (depth > 5 || value === null || value === undefined) return "";
  if (["string", "number", "boolean"].includes(typeof value)) {
    const text = String(value).trim();
    if (!text) return "";
    return path ? `${friendlyErrorField(path)}: ${text}` : text;
  }
  if (Array.isArray(value)) {
    return value.map((item) => readableRoappError(item, path, depth + 1)).filter(Boolean).join(" · ");
  }
  if (typeof value !== "object") return "";
  for (const key of ["message", "detail", "description"]) {
    const text = readableRoappError(value[key], path, depth + 1);
    if (text) return text;
  }
  return Object.entries(value)
    .filter(([key]) => !["status", "status_code", "code"].includes(key))
    .map(([key, nested]) => {
      const nextPath = ["error", "errors", "data"].includes(key) ? path : key;
      return readableRoappError(nested, nextPath, depth + 1);
    })
    .filter(Boolean)
    .join(" · ");
}
__name(readableRoappError, "readableRoappError");
function friendlyErrorField(value) {
  const labels = {
    uid: "VIN",
    owner_id: "Власник",
    group: "Група автомобіля",
    reg_number: "Державний номер",
    brand: "Марка",
    model: "Модель",
    year: "Рік"
  };
  return labels[value] || String(value).replaceAll("_", " ");
}
__name(friendlyErrorField, "friendlyErrorField");
function roappDefaultContentType(body) {
  if (body === undefined || body === null) return {};
  if (typeof FormData !== "undefined" && body instanceof FormData) return {};
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" };
  }
  return { "Content-Type": "application/json" };
}
__name(roappDefaultContentType, "roappDefaultContentType");
async function roappRequest(env, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.ROAPP_API_KEY}`,
      ...roappDefaultContentType(options.body),
      ...options.headers || {}
    }
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 500) };
    }
  }
  if (!response.ok) {
    const message = readableRoappError(data) || `RO App returned error ${response.status}`;
    const error = new Error(message.slice(0, 900));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return { status: response.status, data };
}
__name(roappRequest, "roappRequest");
function buildCarsFromOrders(orders) {
  const cars = /* @__PURE__ */ new Map();
  for (const order of orders) {
    const asset = order?.asset || order?.vehicle || order?.customer_asset;
    if (!asset) continue;
    const assetId = Number(asset.id || order.asset_id);
    const vin = String(
      asset.vin || asset.uid || asset.serial || asset.serial_number || order.asset_uid || ""
    ).trim();
    const key = assetId > 0 ? `id:${assetId}` : `vin:${vin}`;
    if (key === "vin:") continue;
    if (!cars.has(key)) {
      cars.set(key, {
        id: assetId > 0 ? assetId : stableNumber(vin),
        title: asset.title || asset.name || "\u0410\u0432\u0442\u043E\u043C\u043E\u0431\u0456\u043B\u044C",
        brand: valueTitle(asset.brand),
        model: valueTitle(asset.model),
        modification: valueTitle(asset.modification),
        year: asset.year || asset.production_year || "",
        vin,
        history: []
      });
    }
    cars.get(key).history.push({
      id: order.id,
      number: order.number || order.name || "",
      status: valueTitle(order.status) || order.status_name || "\u2014",
      total: firstNumber(order.total, order.amount, order.total_amount),
      paid: firstNumber(order.paid, order.paid_amount),
      scheduled_for: order.scheduled_for || order.created_at || null,
      created_at: order.created_at || null,
      closed_at: order.closed_at || null,
      due_date: order.due_date || null,
      mileage: firstNumber(
        order.mileage,
        order.odometer,
        order.asset_mileage,
        order.asset?.mileage,
        order.vehicle?.mileage
      ),
      manager: personTitle(order.manager),
      assignee: personTitle(
        order.assignee || order.specialist || order.technician
      )
    });
  }
  return [...cars.values()];
}
__name(buildCarsFromOrders, "buildCarsFromOrders");
function publicOrderDetails(order, items) {
  const normalizedItems = items.map(publicOrderItem).filter((item) => item.name);
  return {
    id: Number(order.id),
    number: order.number || order.name || "",
    status: valueTitle(order.status) || order.status_name || "\u2014",
    total: firstNumber(order.total, order.amount, order.total_amount),
    paid: firstNumber(order.paid, order.paid_amount),
    scheduled_for: order.scheduled_for || order.created_at || null,
    created_at: order.created_at || null,
    closed_at: order.closed_at || null,
    due_date: order.due_date || null,
    mileage: firstNumber(
      order.mileage,
      order.odometer,
      order.asset_mileage,
      order.asset?.mileage,
      order.vehicle?.mileage
    ),
    manager: personTitle(order.manager),
    assignee: personTitle(
      order.assignee || order.specialist || order.technician
    ),
    problem: firstText(
      order.malfunction,
      order.problem,
      order.issue,
      order.description
    ),
    diagnostics: firstText(
      order.diagnostics,
      order.diagnostic,
      order.diagnosis
    ),
    recommendations: firstText(
      order.recommendations,
      order.recommendation
    ),
    comment: firstText(order.public_comment, order.client_comment),
    items: normalizedItems,
    custom_fields: publicCustomFields(order),
    payments: publicPayments(order)
  };
}
__name(publicOrderDetails, "publicOrderDetails");
function publicOrderItem(item) {
  const product = item?.product || item?.service || item?.catalog_item || item?.entity || {};
  const quantity = firstNumber(item?.quantity, item?.qty, item?.count, 1);
  const price = firstNumber(item?.price, item?.unit_price, item?.sale_price);
  const total = firstNumber(
    item?.total,
    item?.sum,
    item?.total_amount,
    item?.amount,
    Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : void 0
  );
  const kind = inferOrderItemKind(item);
  return {
    id: Number(item?.id) || null,
    kind,
    code: firstText(
      item?.code,
      item?.sku,
      item?.article,
      product?.code,
      product?.sku,
      product?.article
    ),
    name: firstText(
      item?.title,
      item?.name,
      product?.title,
      product?.name,
      item?.description
    ),
    quantity,
    price,
    total,
    uom: valueTitle(item?.uom || item?.unit || product?.uom || product?.unit),
    assignee: personTitle(
      item?.assignee || item?.employee || item?.specialist
    ),
    warranty: warrantyTitle(item?.warranty),
    comment: firstText(item?.comment, item?.public_comment)
  };
}
__name(publicOrderItem, "publicOrderItem");
function publicCustomFields(order) {
  const source = order?.custom_fields || order?.form_fields || order?.fields;
  if (!source || typeof source !== "object") return [];
  const rawFields = Array.isArray(source) ? source : Object.entries(source).map(([name, value]) => ({ name, value }));
  return rawFields.map((field) => {
    const definition = field?.custom_field || field?.field || {};
    const name = firstText(
      field?.title,
      field?.name,
      field?.label,
      definition?.title,
      definition?.name
    );
    const value = publicFieldValue(
      field?.value ?? field?.values ?? field?.answer ?? field?.text
    );
    return { name, value };
  }).filter((field) => {
    if (!field.name || !field.value) return false;
    return !/(internal|private|cost|profit|внутріш|приват|собіварт|прибут)/i.test(field.name);
  });
}
__name(publicCustomFields, "publicCustomFields");
function publicFieldValue(value) {
  if (value === null || value === void 0) return "";
  if (Array.isArray(value)) {
    return value.map(publicFieldValue).filter(Boolean).join(", ");
  }
  if (typeof value === "boolean") return value ? "\u0422\u0430\u043A" : "\u041D\u0456";
  if (typeof value !== "object") return String(value).trim();
  return firstText(
    value.title,
    value.name,
    value.value,
    value.text,
    value.label
  );
}
__name(publicFieldValue, "publicFieldValue");
function publicPayments(order) {
  const payments = order?.payments || order?.cash_transactions || [];
  if (!Array.isArray(payments)) return [];
  return payments.map((payment) => ({
    id: Number(payment?.id) || null,
    amount: firstNumber(payment?.amount, payment?.sum, payment?.total),
    date: payment?.paid_at || payment?.created_at || payment?.date || null,
    method: valueTitle(
      payment?.payment_method || payment?.method || payment?.type
    )
  })).filter((payment) => Number.isFinite(payment.amount));
}
__name(publicPayments, "publicPayments");
function extractOrderItems(value, seen = /* @__PURE__ */ new Set(), sourceKind = "") {
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  const found = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") {
        const isOrderItem = looksLikeOrderItem(item, sourceKind);
        if (isOrderItem) {
          found.push(sourceKind ? { ...item, __order_kind: sourceKind } : item);
        }
        found.push(...extractOrderItems(item, seen, isOrderItem ? "" : sourceKind));
      }
    }
  } else {
    for (const [key, nested] of Object.entries(value)) {
      if (!nested || typeof nested !== "object") continue;
      const kind = collectionItemKind(key, sourceKind);
      found.push(...extractOrderItems(nested, seen, kind));
    }
  }
  return uniqueOrderItems(found);
}
__name(extractOrderItems, "extractOrderItems");
function collectionItemKind(key, fallback = "") {
  const isService = /(service|work|labor|labour|job|operation|робот|послуг)/i.test(key);
  const isProduct = /(product|part|good|material|товар|запчаст|матеріал)/i.test(key);
  if (isService && !isProduct) {
    return "service";
  }
  if (isProduct && !isService) {
    return "product";
  }
  return fallback;
}
__name(collectionItemKind, "collectionItemKind");
function looksLikeOrderItem(item, sourceKind = "") {
  if (hasNestedOrderCollections(item)) return false;
  const product = item?.product || item?.service || item?.catalog_item || item?.entity;
  const name = firstText(
    item?.title,
    item?.name,
    product?.title,
    product?.name,
    item?.description
  );
  const hasReference = Boolean(
    item?.product_id || item?.service_id || item?.part_id || item?.work_id || item?.catalog_item_id || product
  );
  const hasQuantity = firstNumber(item?.quantity, item?.qty, item?.count) !== void 0;
  const hasPrice = firstNumber(
    item?.price,
    item?.unit_price,
    item?.sale_price,
    item?.total,
    item?.sum,
    item?.total_amount,
    item?.amount
  ) !== void 0;
  const rawType = firstText(
    item?.type,
    item?.item_type,
    item?.entity_type,
    item?.entity?.type,
    item?.kind,
    item?.category
  );
  return Boolean(
    name && (hasReference || hasQuantity || hasPrice || rawType || sourceKind && item?.id)
  );
}
__name(looksLikeOrderItem, "looksLikeOrderItem");
function hasNestedOrderCollections(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  return Object.entries(item).some(([key, nested]) => {
    if (!/(items?|positions?|rows?|service|work|labor|labour|job|operation|product|part|good|material|товар|запчаст|матеріал|робот|послуг)/i.test(key)) {
      return false;
    }
    if (Array.isArray(nested)) return true;
    if (!nested || typeof nested !== "object") return false;
    return ["data", "items", "list", "results"].some(
      (nestedKey) => Array.isArray(nested[nestedKey])
    );
  });
}
__name(hasNestedOrderCollections, "hasNestedOrderCollections");
function uniqueOrderItems(items) {
  const unique = /* @__PURE__ */ new Map();
  for (const item of items) {
    const id = Number(item?.id);
    const name = firstText(
      item?.title,
      item?.name,
      item?.product?.title,
      item?.service?.title,
      item?.entity?.title,
      item?.entity?.name
    );
    const key = id > 0 ? `id:${inferOrderItemKind(item)}:${id}` : `${name}:${unique.size}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}
__name(uniqueOrderItems, "uniqueOrderItems");
function inferOrderItemKind(item) {
  const rawType = String(
    item?.__order_kind || item?.type || item?.item_type || item?.entity_type || item?.entity?.type || item?.kind || item?.category || ""
  ).toLowerCase();
  if (item?.service || item?.service_id || item?.work_id) return "service";
  if (item?.product || item?.product_id || item?.part_id || item?.catalog_item) {
    return "product";
  }
  if (/(service|work|labor|labour|job|робот|послуг)/i.test(rawType)) {
    return "service";
  }
  if (/(product|part|good|material|товар|запчаст|матеріал)/i.test(rawType)) {
    return "product";
  }
  return "item";
}
__name(inferOrderItemKind, "inferOrderItemKind");
function extractOrderClientId(order) {
  if (!order || typeof order !== "object") return 0;
  return firstNumber(
    order.client_id,
    order.customer_id,
    order.contact_id,
    order.client?.id,
    order.customer?.id,
    order.contact?.id,
    order.person?.id
  ) || 0;
}
__name(extractOrderClientId, "extractOrderClientId");
function extractRecord(value, preferredKeys = []) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) return value[0] || null;
  if (value.id) return value;
  for (const key of [...preferredKeys, "data", "result", "item"]) {
    const nested = extractRecord(value[key], preferredKeys);
    if (nested) return nested;
  }
  return null;
}
__name(extractRecord, "extractRecord");
function extractCount(value, seen = /* @__PURE__ */ new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return NaN;
  seen.add(value);
  for (const key of ["count", "total", "total_count", "totalCount"]) {
    const number = Number(value[key]);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  for (const key of ["meta", "pagination", "data", "result"]) {
    const nested = extractCount(value[key], seen);
    if (Number.isFinite(nested)) return nested;
  }
  return NaN;
}
__name(extractCount, "extractCount");
function extractList(value, preferredKeys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of preferredKeys) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const key of ["data", "results", "items", "list"]) {
    if (Array.isArray(value[key])) return value[key];
    if (value[key] && typeof value[key] === "object") {
      const nested = extractList(value[key], preferredKeys);
      if (nested.length) return nested;
    }
  }
  return [];
}
__name(extractList, "extractList");
function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}
__name(normalizePhone, "normalizePhone");
function phoneVariants(phone) {
  const variants = /* @__PURE__ */ new Set([phone, `+${phone}`]);
  if (phone.startsWith("380") && phone.length === 12) {
    variants.add(`0${phone.slice(3)}`);
  }
  return [...variants];
}
__name(phoneVariants, "phoneVariants");
function personHasPhone(person, searchedPhone) {
  const phones = Array.isArray(person?.phones) ? person.phones : [];
  const values = [person?.phone, ...phones.map(
    (item) => typeof item === "string" ? item : item?.phone || item?.value || item?.number
  )];
  return values.some((value) => {
    const digits = normalizePhone(value);
    if (digits.length < 10) return false;
    return digits === searchedPhone || digits.endsWith(searchedPhone.slice(-10)) || searchedPhone.endsWith(digits.slice(-10));
  });
}
__name(personHasPhone, "personHasPhone");
function valueTitle(value) {
  if (value === null || value === void 0) return "";
  if (typeof value === "object") {
    return String(value.title || value.name || value.value || "");
  }
  return String(value);
}
__name(valueTitle, "valueTitle");
function personTitle(value) {
  if (!value) return "";
  if (typeof value !== "object") return String(value);
  const fullName = [value.first_name, value.last_name].filter(Boolean).join(" ");
  return String(
    value.full_name || value.name || fullName || value.title || ""
  );
}
__name(personTitle, "personTitle");
function warrantyTitle(value) {
  if (!value) return "";
  if (typeof value !== "object") return String(value);
  const amount = firstNumber(value.value, value.amount, value.duration);
  const unit = valueTitle(value.unit || value.period || value.type);
  return [amount, unit].filter((part) => part !== void 0 && part !== "").join(" ");
}
__name(warrantyTitle, "warrantyTitle");
function firstText(...values) {
  for (const value of values) {
    if (value === null || value === void 0) continue;
    const text = typeof value === "object" ? valueTitle(value) : String(value);
    if (text.trim()) return text.trim();
  }
  return "";
}
__name(firstText, "firstText");
function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return void 0;
}
__name(firstNumber, "firstNumber");
function stableNumber(text) {
  let hash = 0;
  for (const char of String(text)) {
    hash = hash * 31 + char.charCodeAt(0) >>> 0;
  }
  return hash || 1;
}
__name(stableNumber, "stableNumber");
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(delay, "delay");
function json(data, status = 200, headers = CORS_HEADERS) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers
  });
}
__name(json, "json");

// src/index.js
var MIN_BOOKING_LEAD_MS = 30 * 60 * 1e3;
var index_default = {
  async fetch(request, env, ctx) {
    const corsHeaders = corsHeadersFor(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    try {
      const url = new URL(request.url);
      const authResponse = await handleAuthRoute({
        request,
        env,
        ctx,
        headers: corsHeaders,
        findCustomerByPhone
      });
      if (authResponse) return authResponse;

      if (url.pathname === "/health" && request.method === "GET") {
        const configured = Boolean(env.ROAPP_API_KEY);
        return json2({
          success: configured && authConfigured(env),
          service: "Karpservice API",
          configured,
          telegram_configured: isTelegramConfigured(env),
          telegram_auth_configured: authConfigured(env)
        }, configured && authConfigured(env) ? 200 : 503, corsHeaders);
      }
      if (!env.ROAPP_API_KEY) {
        return json2({
          success: false,
          stage: "config",
          error: "\u0423 Worker \u043D\u0435 \u043D\u0430\u043B\u0430\u0448\u0442\u043E\u0432\u0430\u043D\u043E Secret ROAPP_API_KEY"
        }, 500, corsHeaders);
      }

      let authSession = null;
      if (["/", "/order", "/availability", "/booking", "/cars"].includes(url.pathname)) {
        const authResult = await requireAuthSession(request, env, corsHeaders);
        if (authResult.response) return authResult.response;
        authSession = authResult.session;
      }

      if (url.pathname === "/order" && request.method === "GET") {
        const protectedUrl = new URL(request.url);
        protectedUrl.searchParams.set("phone", authSession.phone);
        return await getOrderDetails(protectedUrl, env, corsHeaders);
      }
      if (url.pathname === "/cars" && request.method === "POST") {
        return await createCustomerAsset(
          request,
          env,
          Number(authSession.customer_id),
          corsHeaders
        );
      }

      const branchId = getBranchId(env);
      if (url.pathname === "/availability" && request.method === "GET") {
        const date = url.searchParams.get("date");
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return json2({
            success: false,
            error: "\u041D\u0435\u043A\u043E\u0440\u0435\u043A\u0442\u043D\u0430 \u0434\u0430\u0442\u0430"
          }, 400, corsHeaders);
        }
        const start = kyivIso(date, "00:00");
        const endDate = addDays(date, 1);
        const end = kyivIso(endDate, "00:00");
        const bookingsUrl = new URL("https://api.roapp.io/v2/bookings");
        bookingsUrl.searchParams.append("branches", String(branchId));
        bookingsUrl.searchParams.append("scheduled_for", start);
        bookingsUrl.searchParams.append("scheduled_for", end);
        bookingsUrl.searchParams.set("sort", "scheduled_for");
        const response = await fetch(bookingsUrl, {
          headers: {
            Authorization: `Bearer ${env.ROAPP_API_KEY}`,
            Accept: "application/json"
          }
        });
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
        if (!response.ok) {
          return json2({
            success: false,
            error: "RO App \u043D\u0435 \u043F\u043E\u0432\u0435\u0440\u043D\u0443\u0432 \u0441\u043F\u0438\u0441\u043E\u043A \u0437\u0430\u043F\u0438\u0441\u0456\u0432",
            roappStatus: response.status
          }, 502, corsHeaders);
        }
        const rawBookings = Array.isArray(data?.data) ? data.data : [];
        const bookings = rawBookings.filter((b) => {
          const statusId = b?.status_id ?? b?.status?.id ?? null;
          return statusId !== 6 && statusId !== 7;
        }).map((b) => ({
          id: b.id,
          scheduled_for: b.scheduled_for,
          scheduled_to: b.scheduled_to,
          resource_id: b.resource_id ?? b.resource?.id ?? null,
          assignee_id: b.assignee_id ?? b.assignee?.id ?? null,
          status_id: b.status_id ?? b.status?.id ?? null
        })).filter((b) => b.scheduled_for && b.scheduled_to);
        return json2({
          success: true,
          date,
          bookings
        }, 200, corsHeaders);
      }
      if (url.pathname === "/booking" && request.method === "POST") {
        const body = await request.json();
        const {
          client_id,
          scheduled_for,
          scheduled_to,
          service,
          car,
          comment
        } = body;
        const effectiveClientId = Number(authSession.customer_id);
        const normalizedService = bookingValue(service, 120);
        const normalizedCar = bookingValue(car, 200);
        const normalizedComment = bookingValue(comment, 500);
        if (!effectiveClientId || !scheduled_for || !scheduled_to) {
          return json2({
            success: false,
            stage: "validation",
            error: "\u041D\u0435 \u0432\u0438\u0441\u0442\u0430\u0447\u0430\u0454 \u0434\u0430\u043D\u0438\u0445 \u0434\u043B\u044F \u0437\u0430\u043F\u0438\u0441\u0443"
          }, 400, corsHeaders);
        }
        if (client_id && Number(client_id) !== effectiveClientId) {
          return json2({
            success: false,
            stage: "authorization",
            error: "\u041D\u0435\u043C\u0430\u0454 \u0434\u043E\u0441\u0442\u0443\u043F\u0443 \u0434\u043E \u0446\u044C\u043E\u0433\u043E \u043A\u043B\u0456\u0454\u043D\u0442\u0430"
          }, 403, corsHeaders);
        }
        if (normalizedService.toLowerCase() === "\u0456\u043D\u0448\u0435" && normalizedComment.length < 3) {
          return json2({
            success: false,
            stage: "validation",
            error: "\u041E\u043F\u0438\u0448\u0456\u0442\u044C \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0443 \u0434\u043B\u044F \u043F\u043E\u0441\u043B\u0443\u0433\u0438 \xAB\u0406\u043D\u0448\u0435\xBB"
          }, 400, corsHeaders);
        }
        const scheduledStartMs = Date.parse(scheduled_for);
        if (!Number.isFinite(scheduledStartMs)) {
          return json2({
            success: false,
            stage: "validation",
            error: "\u041D\u0435\u043A\u043E\u0440\u0435\u043A\u0442\u043D\u0438\u0439 \u0447\u0430\u0441 \u0437\u0430\u043F\u0438\u0441\u0443"
          }, 400, corsHeaders);
        }
        if (isKyivSunday(scheduledStartMs)) {
          return json2({
            success: false,
            stage: "validation",
            error: "\u0423 \u043D\u0435\u0434\u0456\u043B\u044E \u0441\u0435\u0440\u0432\u0456\u0441 \u043D\u0435 \u043F\u0440\u0430\u0446\u044E\u0454. \u041E\u0431\u0435\u0440\u0456\u0442\u044C \u0456\u043D\u0448\u0438\u0439 \u0434\u0435\u043D\u044C."
          }, 400, corsHeaders);
        }
        if (scheduledStartMs - Date.now() < MIN_BOOKING_LEAD_MS) {
          return json2({
            success: false,
            stage: "validation",
            error: "\u0417\u0430\u043F\u0438\u0441 \u043C\u043E\u0436\u043B\u0438\u0432\u0438\u0439 \u0449\u043E\u043D\u0430\u0439\u043C\u0435\u043D\u0448\u0435 \u0437\u0430 30 \u0445\u0432\u0438\u043B\u0438\u043D \u0434\u043E \u043F\u043E\u0447\u0430\u0442\u043A\u0443"
          }, 400, corsHeaders);
        }
        const bookingPayload = {
          branch_id: branchId,
          client_id: effectiveClientId,
          scheduled_for,
          scheduled_to,
          comment: [
            "\u041E\u043D\u043B\u0430\u0439\u043D-\u0437\u0430\u043F\u0438\u0441 Karpservice",
            `\u041F\u043E\u0441\u043B\u0443\u0433\u0430: ${normalizedService || "\u041D\u0435 \u0432\u043A\u0430\u0437\u0430\u043D\u043E"}`,
            normalizedComment ? `\u041F\u0440\u043E\u0431\u043B\u0435\u043C\u0430: ${normalizedComment}` : "",
            `\u0410\u0432\u0442\u043E: ${normalizedCar || "\u041D\u0435 \u0432\u043A\u0430\u0437\u0430\u043D\u043E"}`
          ].filter(Boolean).join("\n")
        };
        const createResponse = await fetch(
          "https://api.roapp.io/v2/bookings",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.ROAPP_API_KEY}`,
              Accept: "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify(bookingPayload)
          }
        );
        const createText = await createResponse.text();
        let createData;
        try {
          createData = JSON.parse(createText);
        } catch {
          createData = { raw: createText };
        }
        console.log(JSON.stringify({
          event: "roapp_booking_create",
          status: createResponse.status,
          success: createResponse.ok
        }));
        if (!createResponse.ok) {
          return json2({
            success: false,
            stage: "create",
            roappStatus: createResponse.status,
            error: "RO App \u043D\u0435 \u0441\u0442\u0432\u043E\u0440\u0438\u0432 \u0437\u0430\u043F\u0438\u0441"
          }, 400, corsHeaders);
        }
        const createdBooking = createData?.data || createData?.booking || createData;
        const bookingId = createdBooking?.id || createData?.id || null;
        if (!bookingId) {
          return json2({
            success: false,
            stage: "create_no_id",
            error: "RO App \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0432 \u0431\u0435\u0437 ID \u0441\u0442\u0432\u043E\u0440\u0435\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0443"
          }, 500, corsHeaders);
        }
        await sleep(400);
        const verifyResponse = await fetch(
          `https://api.roapp.io/v2/bookings/${bookingId}`,
          {
            headers: {
              Authorization: `Bearer ${env.ROAPP_API_KEY}`,
              Accept: "application/json"
            }
          }
        );
        const verifyText = await verifyResponse.text();
        let verifyData;
        try {
          verifyData = JSON.parse(verifyText);
        } catch {
          verifyData = { raw: verifyText };
        }
        if (!verifyResponse.ok) {
          return json2({
            success: false,
            stage: "verify",
            created: true,
            booking_id: bookingId,
            error: "\u0417\u0430\u043F\u0438\u0441 \u0441\u0442\u0432\u043E\u0440\u0435\u043D\u043E, \u0430\u043B\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0430 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 \u043D\u0435 \u0432\u0434\u0430\u043B\u0430\u0441\u044F"
          }, 500, corsHeaders);
        }
        const verifiedBooking = verifyData?.data || verifyData?.booking || verifyData;
        const telegramConfigured = isTelegramConfigured(env);
        if (telegramConfigured) {
          ctx.waitUntil(
            sendTelegramBookingNotification(env, {
              bookingId,
              clientId: verifiedBooking?.client_id ?? verifiedBooking?.client?.id ?? effectiveClientId,
              customerName: authSession.customer_name || getClientName(verifiedBooking),
              phone: authSession.phone,
              car: normalizedCar,
              service: normalizedService,
              comment: normalizedComment,
              scheduledFor: verifiedBooking?.scheduled_for || scheduled_for,
              scheduledTo: verifiedBooking?.scheduled_to || scheduled_to
            }).catch((error) => {
              console.error(JSON.stringify({
                event: "telegram_booking_notification",
                success: false,
                booking_id: bookingId,
                message: error instanceof Error ? error.message : String(error)
              }));
            })
          );
        } else {
          console.warn(JSON.stringify({
            event: "telegram_booking_notification",
            success: false,
            booking_id: bookingId,
            reason: "not_configured"
          }));
        }
        return json2({
          success: true,
          verified: true,
          message: "\u0417\u0430\u043F\u0438\u0441 \u0441\u0442\u0432\u043E\u0440\u0435\u043D\u043E \u0456 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0435\u043D\u043E \u0432 RO App",
          booking_id: bookingId,
          notification_queued: telegramConfigured,
          booking: {
            id: verifiedBooking?.id || bookingId,
            branch_id: verifiedBooking?.branch_id ?? verifiedBooking?.branch?.id ?? null,
            client_id: verifiedBooking?.client_id ?? verifiedBooking?.client?.id ?? null,
            assignee_id: verifiedBooking?.assignee_id ?? verifiedBooking?.assignee?.id ?? null,
            resource_id: verifiedBooking?.resource_id ?? verifiedBooking?.resource?.id ?? null,
            scheduled_for: verifiedBooking?.scheduled_for ?? null,
            scheduled_to: verifiedBooking?.scheduled_to ?? null
          }
        }, 200, corsHeaders);
      }
      if (url.pathname === "/" && request.method === "GET") {
        const protectedUrl = new URL(request.url);
        protectedUrl.searchParams.set("phone", authSession.phone);
        return await getCustomerData(protectedUrl, env, corsHeaders);
      }
      return json2({
        success: false,
        error: "\u041C\u0430\u0440\u0448\u0440\u0443\u0442 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E"
      }, 404, corsHeaders);
    } catch (error) {
      console.error(JSON.stringify({
        event: "worker_error",
        message: error instanceof Error ? error.message : String(error)
      }));
      const errorStatus = Number(error?.status);
      const status = [400, 401, 403, 404, 409, 429, 502, 503].includes(errorStatus)
        ? errorStatus
        : 500;
      return json2({
        success: false,
        stage: status === 500 ? "worker" : "request",
        error: status === 500
          ? "\u0412\u043D\u0443\u0442\u0440\u0456\u0448\u043D\u044F \u043F\u043E\u043C\u0438\u043B\u043A\u0430 Worker"
          : String(error?.message || "\u041F\u043E\u043C\u0438\u043B\u043A\u0430 \u0437\u0430\u043F\u0438\u0442\u0443")
      }, status, corsHeaders);
    }
  }
};
function json2(data, status, headers) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers
  });
}
__name(json2, "json");
function getBranchId(env) {
  const branchId = Number(env.ROAPP_BRANCH_ID || 136446);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    throw new Error("ROAPP_BRANCH_ID \u043C\u0430\u0454 \u0431\u0443\u0442\u0438 \u0434\u043E\u0434\u0430\u0442\u043D\u0438\u043C \u0446\u0456\u043B\u0438\u043C \u0447\u0438\u0441\u043B\u043E\u043C");
  }
  return branchId;
}
__name(getBranchId, "getBranchId");
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");
function isTelegramConfigured(env) {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}
__name(isTelegramConfigured, "isTelegramConfigured");
async function sendTelegramBookingNotification(env, booking) {
  const phone = telegramValue(booking.phone, "").slice(0, 256);
  const phoneDisplay = phone || "\u041D\u0435 \u0432\u043A\u0430\u0437\u0430\u043D\u043E";
  const comment = telegramValue(booking.comment, "");
  const keyboard = [];
  if (phone) {
    keyboard.push([{
      text: "\u{1F4DE} \u0421\u043A\u043E\u043F\u0456\u044E\u0432\u0430\u0442\u0438 \u043D\u043E\u043C\u0435\u0440",
      copy_text: { text: phone }
    }]);
  }
  keyboard.push([{
    text: "\u{1F464} \u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u043A\u0430\u0440\u0442\u043A\u0443 \u043A\u043B\u0456\u0454\u043D\u0442\u0430",
    url: buildRoAppClientUrl(booking.clientId)
  }]);
  const message = [
    "\u{1F527} \u041D\u041E\u0412\u0418\u0419 \u041E\u041D\u041B\u0410\u0419\u041D-\u0417\u0410\u041F\u0418\u0421",
    "",
    `\u{1F464} \u041A\u043B\u0456\u0454\u043D\u0442: ${telegramValue(booking.customerName)}`,
    `\u{1F4DE} \u0422\u0435\u043B\u0435\u0444\u043E\u043D: ${phoneDisplay}`,
    `\u{1F697} \u0410\u0432\u0442\u043E: ${telegramValue(booking.car)}`,
    `\u{1F6E0} \u041F\u043E\u0441\u043B\u0443\u0433\u0430: ${telegramValue(booking.service)}`,
    `\u{1F4C5} \u0414\u0430\u0442\u0430: ${formatKyivDate(booking.scheduledFor)}`,
    `\u{1F552} \u0427\u0430\u0441: ${formatKyivTime(booking.scheduledFor)}\u2013${formatKyivTime(booking.scheduledTo)}`,
    ...comment ? [`\u{1F4AC} \u041A\u043E\u043C\u0435\u043D\u0442\u0430\u0440: ${comment}`] : [],
    "",
    `\u{1F194} \u0417\u0430\u043F\u0438\u0441 RO App: ${telegramValue(booking.bookingId)}`
  ].join("\n");
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        reply_markup: {
          inline_keyboard: keyboard
        }
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Telegram API \u043F\u043E\u0432\u0435\u0440\u043D\u0443\u0432 HTTP ${response.status}`);
  }
  console.log(JSON.stringify({
    event: "telegram_booking_notification",
    success: true,
    booking_id: booking.bookingId
  }));
}
__name(sendTelegramBookingNotification, "sendTelegramBookingNotification");
function telegramValue(value, fallback = "\u041D\u0435 \u0432\u043A\u0430\u0437\u0430\u043D\u043E") {
  if (value === null || value === void 0 || value === "") {
    return fallback;
  }
  return String(value).replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) || fallback;
}
__name(telegramValue, "telegramValue");
function bookingValue(value, maxLength = 500) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
__name(bookingValue, "bookingValue");
function buildRoAppClientUrl(clientId) {
  const id = Number(clientId);
  if (!Number.isInteger(id) || id <= 0) {
    return "https://web.roapp.io/contacts/people";
  }
  return `https://web.roapp.io/contacts/people/${id}`;
}
__name(buildRoAppClientUrl, "buildRoAppClientUrl");
function getClientName(booking) {
  const client = booking?.client;
  if (!client) return "";
  return [client.first_name, client.last_name].filter(Boolean).join(" ");
}
__name(getClientName, "getClientName");
function getClientPhone(booking) {
  const client = booking?.client;
  if (!client) return "";
  const firstPhone = Array.isArray(client.phones) ? client.phones[0] : null;
  return client.phone || (typeof firstPhone === "string" ? firstPhone : firstPhone?.phone) || firstPhone?.value || "";
}
__name(getClientPhone, "getClientPhone");
function formatKyivDate(value) {
  if (!value) return "\u041D\u0435 \u0432\u043A\u0430\u0437\u0430\u043D\u043E";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return telegramValue(value);
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}
__name(formatKyivDate, "formatKyivDate");
function formatKyivTime(value) {
  if (!value) return "\u041D\u0435 \u0432\u043A\u0430\u0437\u0430\u043D\u043E";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return telegramValue(value);
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
__name(formatKyivTime, "formatKyivTime");
function isKyivSunday(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    weekday: "short"
  }).format(date) === "Sun";
}
__name(isKyivSunday, "isKyivSunday");
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const pad = /* @__PURE__ */ __name((n) => String(n).padStart(2, "0"), "pad");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
__name(addDays, "addDays");
function kyivIso(dateStr, timeStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  function partsFor(ms) {
    const parts = formatter.formatToParts(new Date(ms));
    const obj = {};
    for (const p of parts) {
      if (p.type !== "literal") obj[p.type] = p.value;
    }
    return {
      year: Number(obj.year),
      month: Number(obj.month),
      day: Number(obj.day),
      hour: Number(obj.hour),
      minute: Number(obj.minute),
      second: Number(obj.second)
    };
  }
  __name(partsFor, "partsFor");
  for (let i = 0; i < 2; i++) {
    const p = partsFor(utcMs);
    const shownAsUtc = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second
    );
    const wantedAsUtc = Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      0
    );
    utcMs += wantedAsUtc - shownAsUtc;
  }
  const finalParts = partsFor(utcMs);
  const localAsUtc = Date.UTC(
    finalParts.year,
    finalParts.month - 1,
    finalParts.day,
    finalParts.hour,
    finalParts.minute,
    finalParts.second
  );
  const offsetMinutes = Math.round((localAsUtc - utcMs) / 6e4);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offH = String(Math.floor(abs / 60)).padStart(2, "0");
  const offM = String(abs % 60).padStart(2, "0");
  return `${dateStr}T${timeStr}:00${sign}${offH}:${offM}`;
}
__name(kyivIso, "kyivIso");
export {
  index_default as default
};
