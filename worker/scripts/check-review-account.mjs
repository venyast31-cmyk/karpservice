// A disposable isolated account. Never reads CRM, sends Telegram, or uses the owner's password.
import { randomBytes } from 'node:crypto';
import { passwordHash } from '../src/review-account.js';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const database = 'e7568dec-237a-4f1d-b8eb-fd1170af09e9';
const origin = 'https://karpservice-api.venyast31.workers.dev';
const phone = '38000' + String(Number.parseInt(randomBytes(4).toString('hex'),16) % 10000000).padStart(7,'0');
const password = randomBytes(32).toString('base64url');
const salt = randomBytes(24).toString('hex');
const digest = await passwordHash(password, salt);
async function sql(query, params) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method:'POST',headers:{Authorization:`Bearer ${apiToken}`,'Content-Type':'application/json'},body:JSON.stringify({sql:query,params})
  });
  const result = await response.json();
  if(!response.ok || !result.success) throw new Error(`D1 smoke setup failed: HTTP ${response.status}`);
  return result.result[0].results;
}
async function call(path, method='GET', body, token) {
  const response = await fetch(`${origin}/${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
}
function assert(value,message){if(!value)throw new Error(message);}
let created=false;
try {
  await sql('INSERT INTO review_accounts(phone,password_salt,password_hash) VALUES(?,?,?)',[phone,salt,digest]);created=true;
  const wrong=await call('auth/password','POST',{phone,password:'invalid-password-value'});
  assert(wrong.status===401,'Wrong password was accepted');
  const login=await call('auth/password','POST',{phone,password});
  assert(login.status===200&&login.data.token?.startsWith('review_'),'Password login failed');
  const token=login.data.token;
  const cars=await call('','GET',null,token);
  assert(cars.status===200&&cars.data.review_account&&cars.data.customer.first_name==='Демонстраційний','Isolation check failed');
  const add=await call('cars','POST',{vin:'TEST0000000000003'},token);
  assert(add.data.success,'Test car write failed');
  const second=await call('auth/password','POST',{phone,password});
  const persisted=await call('','GET',null,second.data.token);
  assert(persisted.data.cars.some(c=>c.vin==='TEST0000000000003'),'Server persistence failed');
  const escape=await call('order?order_id=999999999','GET',null,token);
  assert(escape.status===404,'Account accessed non-fixture order');
  const removed=await call('account/deletion','POST',{confirmed:true},token);
  assert(removed.data.status==='deleted','Test-account deletion failed');
  const revoked=await call('','GET',null,second.data.token);
  assert(revoked.status===401,'Deletion did not revoke all sessions');
  const owner=await sql('SELECT disabled, length(password_hash) AS hash_length FROM review_accounts WHERE phone = ?',['380734447344']);
  assert(owner.length===1&&owner[0].disabled===0&&owner[0].hash_length===64,'Review account is not provisioned');
  console.log('Live isolated password login, persistent cars, order isolation, deletion and session revocation passed. Reviewer account provisioned.');
} finally {
  if(created){
    await sql('DELETE FROM review_sessions WHERE phone = ?',[phone]);
    await sql('DELETE FROM review_accounts WHERE phone = ? AND password_hash = ?',[phone,digest]);
  }
}
