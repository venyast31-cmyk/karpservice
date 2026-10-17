// Server-only adapter. Keep VINALFA_API_TOKEN in Worker secrets.
const BASE = 'https://api.vinalfa.com/oem/v2';
export class VinalfaError extends Error {
  constructor(code, status = 502) { super(code); this.name = 'VinalfaError'; this.status = status; }
}
function hash(value) {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{32}$/.test(value)) throw new VinalfaError('invalid_catalog_id', 400);
  return value;
}
export function createVinalfa(env, fetcher = fetch) {
  async function request(path, body) {
    if (!env.VINALFA_API_TOKEN) throw new VinalfaError('oem_unconfigured', 503);
    let response;
    try {
      response = await fetcher(BASE + path, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${env.VINALFA_API_TOKEN}`, Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {}) },
        ...(body ? {body: JSON.stringify(body)} : {}),
        redirect: 'error', signal: AbortSignal.timeout(20000)
      });
    } catch(e) { throw new VinalfaError(e?.name==='TimeoutError'?'oem_timeout':'oem_network_error'); }
    // Never propagate supplier messages, credentials or raw network errors.
    if (!response.ok) {
      if (response.status === 429) throw new VinalfaError('oem_limit', 429);
      if (response.status === 404) throw new VinalfaError('oem_not_found', 404);
      if ([401, 403].includes(response.status)) throw new VinalfaError('oem_access_unavailable', 503);
      const failure=new VinalfaError('oem_unavailable');failure.upstreamStatus=response.status;throw failure;
    }
    let payload;
    try { payload = await response.json(); } catch { throw new VinalfaError('oem_invalid_response'); }
    if (!payload?.data || typeof payload.data !== 'object' || Array.isArray(payload.data) || payload.error) throw new VinalfaError('oem_invalid_response');
    return payload.data;
  }
  return {
    catalogs: () => request('/catalogs'),
    resolve(vin) {
      const identifier = String(vin || '').trim().toUpperCase();
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(identifier)) throw new VinalfaError('invalid_vin', 400);
      return request('/vehicles/resolve', {identifier, identifier_type: 'vin'});
    },
    groups: vehicle => request(`/vehicles/${hash(vehicle)}/groups`),
    quickSelection: vehicle => request(`/vehicles/${hash(vehicle)}/quick-selection`),
    children: section => request(`/sections/${hash(section)}/children`),
    parts: (section, vehicle) => request(`/sections/${hash(section)}/parts?${new URLSearchParams({vehicle_hash: hash(vehicle)})}`),
    quickSearch(vehicle, category) {
      if (!/^[a-z0-9-]{2,100}$/.test(category || '')) throw new VinalfaError('invalid_query', 400);
      return request(`/vehicles/${hash(vehicle)}/search?${new URLSearchParams({quick_category:category})}`);
    },
    search(vehicle, query) {
      const q = String(query || '').trim();
      if (q.length < 2 || q.length > 120) throw new VinalfaError('invalid_query', 400);
      return request(`/vehicles/${hash(vehicle)}/search?${new URLSearchParams({q})}`);
    }
  };
}
