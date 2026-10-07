import {createPrivateKey,sign} from 'node:crypto';
async function main() {
  const env = process.env;
  if (!/^[A-Z0-9]{10}$/.test(env.ASC_KEY_ID || '') || !/^[a-f0-9-]{36}$/i.test(env.ASC_ISSUER_ID || '') || !env.ASC_PRIVATE_KEY) throw new Error('App Store API credentials are missing');
  let key;
  try { key = createPrivateKey(env.ASC_PRIVATE_KEY); } catch { throw new Error('Invalid App Store API private key; contents withheld'); }
  const api = async (resource, body, method = body ? 'POST' : 'GET') => {
    const now = Math.floor(Date.now() / 1000);
    const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const data = `${b64({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' })}.${b64({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
    const token = `${data}.${sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    let response;
    try {
      response = await fetch(`https://api.appstoreconnect.apple.com${resource}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch { throw new Error('App Store Connect request failed; credentials withheld'); }
    if (!response.ok) { const problem = await response.json().catch(()=>({})); throw new Error(JSON.stringify({resource,status:response.status,errors:problem.errors?.map(e=>({code:e.code,title:e.title,detail:e.detail}))})); }
    return response.status === 204 ? {} : response.json().catch(() => { throw new Error('App Store Connect returned invalid JSON; response withheld'); });
  };
  const APP = '6816711108';
  const VERSION = '8bc8aa03-35a3-4961-9684-b43fb8965656';
  const BUILD = 'b2c2b807-b146-4b9c-9579-7ada0ebd5f54';
  const app = (await api(`/v1/apps/${APP}`)).data;
  if (app.attributes.bundleId !== 'ua.karpservice.client') throw new Error('Unexpected app');
  const version = (await api(`/v1/appStoreVersions/${VERSION}?include=appStoreReviewDetail,appStoreVersionLocalizations,build`));
  if (version.data.attributes.versionString !== '1.0') throw new Error('Unexpected version');
  const build = (await api(`/v1/builds/${BUILD}?include=app,preReleaseVersion`));
  if (build.data.attributes.version !== '14.1.0' || build.data.attributes.processingState !== 'VALID' || build.data.attributes.expired || build.data.attributes.buildAudienceType !== 'APP_STORE_ELIGIBLE' || build.included.find(x=>x.type==='apps')?.id !== APP) throw new Error('Build eligibility check failed');
  if (['WAITING_FOR_REVIEW','IN_REVIEW','PENDING_APPLE_RELEASE','PENDING_DEVELOPER_RELEASE','READY_FOR_SALE'].includes(version.data.attributes.appStoreState)) {
    if (version.data.relationships.build.data.id !== BUILD) throw new Error('Another build is already under review; no submission changed');
    console.log(JSON.stringify({alreadySubmitted:true,version:'1.0',build:'14.1.0',state:version.data.attributes.appStoreState})); return;
  }
  await api(`/v1/appStoreVersions/${VERSION}/relationships/build`,{data:{type:'builds',id:BUILD}},'PATCH');
  await api(`/v1/appStoreVersions/${VERSION}`,{data:{type:'appStoreVersions',id:VERSION,attributes:{releaseType:'AFTER_APPROVAL'}}},'PATCH');
  const localization = version.included.find(x=>x.type==='appStoreVersionLocalizations'&&x.attributes.locale==='uk');
  if(!localization) throw new Error('Ukrainian localization missing');
  const description = localization.attributes.description.replace(/Новини, послуги та контакти доступні без входу\.[\s\S]*?(?=\n\nДля запису)/, 'Новини та каталог послуг доступні без входу. Для особистого профілю увійдіть через Apple. Потім підключіть номер телефону та підтвердьте його через Telegram, щоб завантажити свої автомобілі й історію обслуговування з бази Karpservice та записатися на сервіс. Номер має відповідати вашій картці клієнта в автосервісі.');
  if(description===localization.attributes.description && !description.includes('Номер має відповідати')) throw new Error('Unexpected description; update required');
  await api(`/v1/appStoreVersionLocalizations/${localization.id}`,{data:{type:'appStoreVersionLocalizations',id:localization.id,attributes:{description}}},'PATCH');
  const detail = version.included.find(x=>x.type==='appStoreReviewDetails');
  if(!detail) throw new Error('Review contact details missing');
  const notes = `BUILD 14.1.0 — APPLE-FIRST SIGN IN
This replaces build 10.1.0. The owner has verified the current build on an iPhone through TestFlight. The server-side Apple sign-in error has been fixed.

HOW TO SIGN IN
Open Profile (Профіль) and tap Sign in with Apple (Вхід з Apple). Use your own Apple Account. Hide My Email is supported. This is the only sign-in method; the former phone/password review account and local demo entry are no longer available. No shared Apple credentials are provided.

PHONE LINK AND CUSTOMER RECORDS
After Apple sign-in, Profile provides phone linking. Telegram verifies ownership of the phone number; it is not a separate account login. The verified phone must match an existing Karpservice customer card before vehicles, repair history and booking become available. An unlinked Apple profile intentionally has no customer records. For review of existing-customer records, contact the App Review contact listed above to arrange a customer card for your verified number. A phone number alone never exposes CRM records.

PUBLIC ACCESS AND BOOKING
News and the service catalogue are available without sign-in. The bottom tabs are News, Vehicles, Book, History and Profile. Book now opens the booking form, with the vehicle selected inside that form. Booking requires a linked customer phone. The workshop is closed Sundays and appointments must be at least 30 minutes ahead.

ACCOUNT DELETION
Profile > Видалити профіль і дані starts account deletion. The app supports Apple authorization revocation. Customer data deletion requests are processed within seven calendar days.

PURPOSE
Free app for customers of Karpservice, a physical auto workshop in Boryspil, Ukraine. No digital purchases or subscriptions. No advertising tracking. Apple provides sign-in; Cloudflare Workers/D1 provide authentication; RemOnline/RoApp supplies customer records; Telegram confirms phone ownership; VIN decoding is used for vehicle entry. Native reminders, sharing, phone and Maps actions are supported.
Existing populated garage/history marketing screenshots use fictional sample data, not real customer records. Previous review videos and phone/password instructions describe older builds and must not be used for this build.`;
  await api(`/v1/appStoreReviewDetails/${detail.id}`,{data:{type:'appStoreReviewDetails',id:detail.id,attributes:{demoAccountRequired:false,demoAccountName:'',demoAccountPassword:'',notes}}},'PATCH');
  console.log(JSON.stringify({prepared:true,version:'1.0',build:'14.1.0',automaticRelease:true,reviewNotesUpdated:true}));
  const submissions = (await api(`/v1/apps/${APP}/reviewSubmissions?include=items&limit=20`));
  const submission = submissions.data.find(x=>x.attributes.platform==='IOS'&&['UNRESOLVED_ISSUES','READY_FOR_REVIEW'].includes(x.attributes.state));
  if(!submission) throw new Error('Existing review submission not editable; inspect before creating another');
  const items=(await api(`/v1/reviewSubmissions/${submission.id}/items?include=appStoreVersion`)).data;
  const item=items.find(x=>x.relationships?.appStoreVersion?.data?.id===VERSION);
  if(!item) throw new Error('The existing submission is not linked to the intended version');
  if(item.attributes.state==='REJECTED') await api(`/v1/reviewSubmissionItems/${item.id}`,{data:{type:'reviewSubmissionItems',id:item.id,attributes:{resolved:true}}},'PATCH');
  const selected=(await api(`/v1/appStoreVersions/${VERSION}?include=build`)).data;
  if(selected.relationships.build.data.id!==BUILD) throw new Error('Selected build changed before submission');
  await api(`/v1/reviewSubmissions/${submission.id}`,{data:{type:'reviewSubmissions',id:submission.id,attributes:{submitted:true}}},'PATCH');
  const finalSubmission=(await api(`/v1/reviewSubmissions/${submission.id}`)).data;
  const finalVersion=(await api(`/v1/appStoreVersions/${VERSION}?include=build`)).data;
  console.log(JSON.stringify({submitted:true,submissionId:submission.id,submissionState:finalSubmission.attributes.state,version:'1.0',build:'14.1.0',versionState:finalVersion.attributes.appStoreState,selectedBuild:finalVersion.relationships.build.data.id,releaseType:finalVersion.attributes.releaseType}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
