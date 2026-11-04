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
let versions=(await api('/v1/apps/'+app+'/appStoreVersions?filter[platform]=IOS')).data;
let v=versions.find(v=>v.attributes.versionString==='1.0.2');
if(!v) v=(await api('/v1/appStoreVersions','POST',{data:{type:'appStoreVersions',attributes:{platform:'IOS',versionString:'1.0.2',releaseType:'AFTER_APPROVAL',copyright:'2026 Karpservice'},relationships:{app:{data:{type:'apps',id:app}}}}})).data;
console.log('VERSION',JSON.stringify({id:v.id,...v.attributes}));
const locs=(await api('/v1/appStoreVersions/'+v.id+'/appStoreVersionLocalizations')).data;
for(const l of locs){
 await api('/v1/appStoreVersionLocalizations/'+l.id,'PATCH',{data:{type:'appStoreVersionLocalizations',id:l.id,attributes:{whatsNew:l.attributes.locale.startsWith('uk')?'Нова акція: безкоштовна діагностика автомобіля з 1 до 30 листопада 2026 року. Банер та умови доступні в розділі новин.':'New promotion: free vehicle diagnostics from November 1–30, 2026. Find the banner and details in News.'}}});
 console.log('LOCALE',JSON.stringify({id:l.id,locale:l.attributes.locale,hasDescription:!!l.attributes.description}));
 const sets=(await api('/v1/appStoreVersionLocalizations/'+l.id+'/appScreenshotSets')).data;
 for(const set of sets){const shots=(await api('/v1/appScreenshotSets/'+set.id+'/appScreenshots')).data;console.log('SCREENSHOTS',set.attributes.screenshotDisplayType,shots.length,shots.map(x=>x.attributes.assetDeliveryState.state).join(','));}
}
const d=(await api('/v1/appStoreVersions/'+v.id+'/appStoreReviewDetail')).data;
console.log('REVIEW',JSON.stringify({id:d?.id,required:d?.attributes?.demoAccountRequired,hasUser:!!d?.attributes?.demoAccountName,hasPassword:!!d?.attributes?.demoAccountPassword,hasNotes:!!d?.attributes?.notes,hasContact:!!d?.attributes?.contactEmail}));
