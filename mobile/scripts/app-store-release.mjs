import {createPrivateKey,sign} from 'node:crypto';
const key=createPrivateKey(process.env.ASC_PRIVATE_KEY);
const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function api(path){
 const now=Math.floor(Date.now()/1000),s=b({alg:'ES256',kid:process.env.ASC_KEY_ID,typ:'JWT'})+'.'+b({iss:process.env.ASC_ISSUER_ID,iat:now,exp:now+600,aud:'appstoreconnect-v1'});
 const token=s+'.'+sign('sha256',Buffer.from(s),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
 const r=await fetch('https://api.appstoreconnect.apple.com'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 const j=await r.json(); if(!r.ok)throw Error(JSON.stringify(j.errors));return j;
}
const versions=await api('/v1/apps/6816711108/appStoreVersions?filter[platform]=IOS');
console.log('VERSIONS',JSON.stringify(versions.data.map(x=>({id:x.id,...x.attributes}))));
for(const v of versions.data.filter(x=>x.attributes.versionString==='1.0.1')){
 for(const rel of ['build','appStoreVersionLocalizations','appStoreReviewDetail']){
 const j=await api('/v1/appStoreVersions/'+v.id+'/'+rel);
 if(rel==='appStoreReviewDetail'){const d=j.data;console.log('REVIEW',JSON.stringify({id:d?.id,signInRequired:d?.attributes?.demoAccountRequired,hasUsername:!!d?.attributes?.demoAccountName,hasPassword:!!d?.attributes?.demoAccountPassword,notes:d?.attributes?.notes}));}
 else console.log(rel,JSON.stringify(j.data));
 }
}
console.log('BUILD',JSON.stringify((await api('/v1/builds/704573db-2c4a-45a5-aaed-62a84402e2fd')).data));
console.log('SUBMISSIONS',JSON.stringify((await api('/v1/apps/6816711108/reviewSubmissions')).data));
