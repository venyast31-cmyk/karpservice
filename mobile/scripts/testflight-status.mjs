import {createPrivateKey,sign} from 'node:crypto';
async function main() {
  const env = process.env;
  if (!/^[A-Z0-9]{10}$/.test(env.ASC_KEY_ID || '') || !/^[a-f0-9-]{36}$/i.test(env.ASC_ISSUER_ID || '') || !env.ASC_PRIVATE_KEY) throw new Error('App Store API credentials are missing');
  let key;
  try { key = createPrivateKey(env.ASC_PRIVATE_KEY); } catch { throw new Error('Invalid App Store API private key; contents withheld'); }
  const api = async (resource, body) => {
    const now = Math.floor(Date.now() / 1000);
    const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const data = `${b64({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' })}.${b64({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
    const token = `${data}.${sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    let response;
    try {
      response = await fetch(`https://api.appstoreconnect.apple.com${resource}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch { throw new Error('App Store Connect request failed; credentials withheld'); }
    if (!response.ok) { const problem = await response.json().catch(()=>({})); throw new Error(JSON.stringify({resource,status:response.status,errors:problem.errors?.map(e=>({code:e.code,title:e.title,detail:e.detail}))})); }
    return response.status === 204 ? {} : response.json().catch(() => { throw new Error('App Store Connect returned invalid JSON; response withheld'); });
  };
  const app = (await api('/v1/apps/6816711108')).data;
  if (app.attributes.bundleId !== 'ua.karpservice.client') throw new Error('Unexpected app');
  const builds = await api(`/v1/builds?filter[app]=6816711108&filter[version]=${env.IOS_BUILD_NUMBER}&include=betaGroups,buildBetaDetail&limit=10`);
  console.log(JSON.stringify({ builds: builds.data.map(b => ({id:b.id, version:b.attributes.version, processingState:b.attributes.processingState, expired:b.attributes.expired, relationships:b.relationships})), included: builds.included?.map(x=>({type:x.type,id:x.id,attributes:x.attributes})) }));
  try { await api(`/v1/builds/${builds.data[0].id}/relationships/betaGroups`); } catch(error) { console.log(error.message); }
  const groups = await api('/v1/apps/6816711108/betaGroups');
  console.log(JSON.stringify({groups:groups.data.map(g=>({id:g.id,name:g.attributes.name,internal:g.attributes.isInternalGroup,allBuilds:g.attributes.hasAccessToAllBuilds}))}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
