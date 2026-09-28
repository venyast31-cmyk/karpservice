const routes = new Map([
  ['', 'GET'], ['order', 'GET'], ['availability', 'GET'],
  ['cars', 'POST'], ['cars/remove', 'POST'], ['booking', 'POST'],
  ['account/deletion-policy', 'GET'], ['account/deletion', 'POST'],
  ['auth/password', 'POST'], ['auth/request', 'POST'], ['auth/link-status', 'POST'],
  ['auth/verify', 'POST'], ['auth/logout', 'POST'], ['auth/me', 'GET']
]);

export function nativeRequest(path = '', options = {}) {
  if (typeof path !== 'string' || /[\\#\r\n]/.test(path)) throw new Error('Некоректний запит.');
  const [route] = path.split('?');
  const method = String(options.method || 'GET').toUpperCase();
  if (routes.get(route) !== method) throw new Error('Цей запит не підтримується.');
  if (options.body !== undefined && typeof options.body !== 'string') throw new Error('Некоректний формат даних.');
  if (options.body && !isJsonObject(options.body)) throw new Error('Некоректний формат даних.');
  return { path, method, ...(options.body ? { body: options.body } : {}) };
}

function isJsonObject(body) {
  try { const value = JSON.parse(body); return value !== null && typeof value === 'object' && !Array.isArray(value); }
  catch { return false; }
}

export function createTransport(bridge) {
  return async (path = '', options = {}) => {
    const result = await bridge.request(nativeRequest(path, options));
    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  };
}
