import {createPrivateKey,sign} from 'node:crypto';
const key=createPrivateKey(process.env.ASC_PRIVATE_KEY);
const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function api(path,method='GET',body){
 const now=Math.floor(Date.now()/1000),s=b({alg:'ES256',kid:process.env.ASC_KEY_ID,typ:'JWT'})+'.'+b({iss:process.env.ASC_ISSUER_ID,iat:now,exp:now+600,aud:'appstoreconnect-v1'});
 const token=s+'.'+sign('sha256',Buffer.from(s),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
 const r=await fetch('https://api.appstoreconnect.apple.com'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const j=r.status===204?{}:await r.json(); if(!r.ok)throw Error(JSON.stringify(j.errors));return j;
}


const app='6816711108';
if((await api('/v1/apps/'+app)).data.attributes.bundleId!=='ua.karpservice.client')throw Error('Wrong app');
const versions=(await api('/v1/apps/'+app+'/appStoreVersions?filter[platform]=IOS')).data;
console.log('VERSIONS', JSON.stringify(versions.map(v=>({id:v.id,...v.attributes}))));
const builds=(await api('/v1/builds?filter[app]='+app+'&sort=-uploadedDate&limit=5&include=preReleaseVersion')).data;
console.log('BUILDS',JSON.stringify(builds.map(v=>({id:v.id,...v.attributes,preReleaseVersion:v.relationships.preReleaseVersion.data}))));
