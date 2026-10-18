import { readFile } from 'node:fs/promises';

// Only metadata is logged. Never print response bodies, credentials or customer data.
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
async function get(label, path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json();
  console.log(JSON.stringify({ check: label, http: response.status,
    success: body.success === true, error_codes: (body.errors || []).map(e => e.code) }));
  return body.success === true ? body.result : null;
}
const verified = await get('token validity', '/user/tokens/verify');
console.log(JSON.stringify({ token_status: verified?.status || 'unverified', not_before: verified?.not_before || null, expires_on: verified?.expires_on || null, checked_at: new Date().toISOString() }));
const databases = await get('D1 list', `/accounts/${account}/d1/database`);
if (Array.isArray(databases)) console.log(JSON.stringify({ databases: databases.map(d => ({ name: d.name, uuid: d.uuid })) }));
const settings = await get('Worker binding', `/accounts/${account}/workers/scripts/${config.name}/settings`);
const bindings = settings?.bindings?.filter(b => b.type === 'd1') || [];
console.log(JSON.stringify({ d1_bindings: bindings.map(b => ({ name: b.name, id: b.id })) }));
const expected = config.d1_databases.find(b => b.binding === 'AUTH_DB');
if (verified?.status !== 'active' || !Array.isArray(databases) || !settings ||
    !databases.some(d => d.uuid === expected.database_id) ||
    !bindings.some(b => b.name === 'AUTH_DB' && b.id === expected.database_id)) {
  throw new Error('Deployment access or database binding mismatch. No migration or deployment was attempted.');
}
