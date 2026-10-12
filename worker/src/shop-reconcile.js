// Temporary, expiring repair access restricted to the single reported shop request.
const TARGET='77fbbca2-9ba4-41e1-945d-5a02498bb1f0';
const HASH='28a26406f7b7b320100599fe95c322d46a9295fe126a231c629f10d689fb086c';
const EXPIRES=1791844330156;
function list(d){if(Array.isArray(d))return d;for(const k of ['data','orders','results','items'])if(d?.[k]){const x=list(d[k]);if(x.length)return x;}return [];}
function record(d){for(const k of ['data','order','result'])if(d?.[k]&&!Array.isArray(d[k]))return record(d[k]);return d;}
export async function reconcileShop(request,env,headers){
 if(new URL(request.url).pathname!=='/shop/reconcile')return null;
 const reply=(d,status=200)=>Response.json(d,{status,headers:{...headers,'Cache-Control':'no-store'}});
 const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(Date.now()>EXPIRES||hash!==HASH)return reply({error:'Unauthorized'},401);
 if(!['GET','POST'].includes(request.method))return reply({error:'Method'},405);
 const row=await env.AUTH_DB.prepare('SELECT public_id,customer_id,status,total_cents,created_at,crm_id,snapshot FROM shop_orders WHERE public_id=?').bind(TARGET).first();
 if(!row)return reply({error:'Request not found'},404);
 const call=async path=>{const r=await fetch('https://api.roapp.io/v2'+path,{headers:{Authorization:'Bearer '+env.ROAPP_API_KEY,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)});const text=await r.text();let d;try{d=JSON.parse(text);}catch{throw new Error('CRM non-JSON '+r.status);};if(!r.ok)throw new Error('CRM read '+r.status+' '+JSON.stringify(d).slice(0,1200));return d;};
 try {
 const params=new URLSearchParams({client_ids:String(row.customer_id),branch_ids:String(env.ROAPP_BRANCH_ID),created_at:new Date(Date.parse(row.created_at)-60000).toISOString().replace(/\.\d{3}Z$/,'Z'),sort:'-id',page:'1'});
 const raw=await call('/orders?'+params),orders=list(raw),matches=[],schemas=[];
 for(const o of orders.slice(0,20)){
  await new Promise(r=>setTimeout(r,400));
  const detail=await call('/orders/'+Number(o.id)),d=record(detail);
  schemas.push({id:o.id,keys:Object.keys(d||{}),match:JSON.stringify(d).includes(TARGET)});
  if(JSON.stringify(d).includes(TARGET))matches.push({id:Number(o.id),number:d.number||d.name||null});
 }
 if(request.method==='POST' && new URL(request.url).searchParams.get('action')==='recover'){
  if(matches.length||orders.length||row.status!=='verification')return reply({error:'Recovery precondition failed',status:row.status,matches},409);
  const claimed=await env.AUTH_DB.prepare("UPDATE shop_orders SET status='recovering' WHERE public_id=? AND status='verification' RETURNING public_id").bind(TARGET).first();
  if(!claimed)return reply({error:'Already recovering'},409);
  const snap=JSON.parse(row.snapshot),managerIds=String(env.SHOP_MANAGER_IDS).split(',').map(Number);
  const notes=[`Магазин Karpservice • ${TARGET}`,'Менеджери: Артем та Євгеній. Ручне підтвердження. Оплата після узгодження.',...(snap.car?[`Авто: ${snap.car.name}; VIN: ${snap.car.vin||'—'}`]:[]),...snap.lines.map(p=>`${p.brand} ${p.article} — ${p.name}; ${p.quantity} × ${(p.price/100).toFixed(2)} грн; ${p.warehouse.name}; ${p.warehouse.delivery}`),`Разом: ${(row.total_cents/100).toFixed(2)} грн`,`Коментар: ${snap.comment}`].join('\n');
  await new Promise(r=>setTimeout(r,400));
  const r=await fetch('https://api.roapp.io/v2/orders',{method:'POST',headers:{Authorization:'Bearer '+env.ROAPP_API_KEY,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({branch_id:Number(env.ROAPP_BRANCH_ID),order_type_id:Number(env.SHOP_ORDER_TYPE_ID),client_id:Number(row.customer_id),manager_id:managerIds[parseInt(TARGET.slice(0,8),16)%managerIds.length],malfunction:'Замовлення товарів із магазину Karpservice',manager_notes:notes,estimated_price:(row.total_cents/100).toFixed(2)}),redirect:'manual',signal:AbortSignal.timeout(20000)});
  const raw=await r.text();let d;try{d=JSON.parse(raw);}catch{d={non_json:true};}
  const id=Number(record(d)?.id||d.order_id);
  const state=r.ok&&Number.isSafeInteger(id)&&id>0?'sent':r.status===400||r.status===422?'rejected':'recovering';
  snap.recovery_diagnostic={http:r.status,keys:Object.keys(d),error:r.ok?null:d};
  await env.AUTH_DB.prepare('UPDATE shop_orders SET status=?,crm_id=?,snapshot=? WHERE public_id=?').bind(state,state==='sent'?id:null,JSON.stringify(snap),TARGET).run();
  return reply({http:r.status,status:state,keys:Object.keys(d),id:state==='sent'?id:null,error:r.ok?null:d});
 }
 if(request.method==='POST'){
  if(matches.length!==1)return reply({error:'Need exactly one matching existing CRM order',matches},409);
  await env.AUTH_DB.prepare("UPDATE shop_orders SET status='sent',crm_id=? WHERE public_id=? AND status IN ('sending','verification')").bind(matches[0].id,TARGET).run();
  return reply({success:true,reconciled:true,order:matches[0]});
 }
 return reply({request:{public_id:row.public_id,status:row.status,total_cents:row.total_cents,created_at:row.created_at,crm_id:row.crm_id},list_keys:Object.keys(raw),pagination:raw.paging||raw.pagination||raw.meta||null,candidates:orders.length,matches,schemas});
 }catch(e){return reply({diagnostic_error:e.message},502);}
}
