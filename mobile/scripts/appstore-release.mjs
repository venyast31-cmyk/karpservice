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
  const versions = await api('/v1/apps/6816711108/appStoreVersions?filter[platform]=IOS&include=build,appStoreReviewDetail,appStoreVersionLocalizations&limit=20');
  for(const item of versions.included || []) if(item.type === 'appStoreReviewDetails') {
    item.attributes.demoAccountPassword = item.attributes.demoAccountPassword ? '[configured]' : '';
    item.attributes.demoAccountName = item.attributes.demoAccountName ? '[configured]' : '';
  }
  console.log(JSON.stringify({versions}));
  console.log(JSON.stringify({submissions:await api('/v1/apps/6816711108/reviewSubmissions?include=items&limit=20')}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
