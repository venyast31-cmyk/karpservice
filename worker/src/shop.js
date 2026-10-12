import { requireAuthSession, consumeRateLimit } from './auth.js';
import { CATEGORIES } from './shop-catalog.js';
export { CATEGORIES };
export function findCategory(id,nodes=CATEGORIES) {
  for(const node of nodes){if(node.id===id)return node;const found=findCategory(id,node.children);if(found)return found;}
  return null;
}
export function publicCategory({group,children,...node}) {return {...node,image:photo(node.image),children:children.map(publicCategory)};}
function publicProduct(p){return {...p,stocks:p.stocks.map(({name,...stock})=>stock)};}
export const WAREHOUSES = [
  {id:'92F8005056BAA48611EFEDF62E756182',name:'Київ Лівий берег',cutoff:900,days:0},
  {id:'92F9005056BA7D7A11EFEDFB75EEFE3F',name:'Київ РЦ',cutoff:780,days:0},
  {id:'9302005056BA7D7A11F067C1FCF323DC',name:'Луцьк XXL',cutoff:1050,days:1},
  {id:'ACF9000C2947F7AE11E28A2B02C4AD32',name:'Луцьк РЦ',cutoff:1050,days:1}
];
export function delivery(warehouse, now = new Date()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  if(['Sat','Sun'].includes(p.weekday) || Number(p.hour)*60+Number(p.minute)>=warehouse.cutoff || (warehouse.days && p.weekday==='Fri')) return 'Термін доставки уточнить менеджер';
  return warehouse.days ? 'Доставка завтра' : 'Доставка сьогодні';
}
export function retailPrice(value) {
  if(!/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const cents=Math.round(Number(value)*100);
  return cents>0 && cents<100000000 ? Math.round(cents*130/100) : null;
}
export function stockQuantity(value) {
  const s=String(value??'').trim();
  if(!/^(?:>|≥)?\s*\d+(?:\.\d+)?$/.test(s)) return 0;
  const n=Number(s.replace(/^[>≥]\s*/,''));
  return Number.isFinite(n) && n>0 ? Math.floor(n) : 0;
}
export function photo(raw) {
  const path=String(raw||'').replace(/\\+/g,'/').replace(/^photo\//,'');
  if(/^https:\/\/cdn\.bm\.parts\//.test(path)) return path;
  return /^[a-zA-Z0-9/_-]+\.(?:jpe?g|png|webp)$/i.test(path) ? `https://cdn.bm.parts/photos/320x320/${path}` : '';
}
export function productView(p,id,now) {
  const price=retailPrice(p.price);
  if(!price || !['UAH','ГРН','грн'].includes(p.currency_name)) return null;
  const stocks=WAREHOUSES.flatMap(w=>{
    const row=(p.in_stocks||[]).find(s=>s.uuid===w.id); const quantity=stockQuantity(row?.quantity);
    return quantity ? [{id:w.id,name:w.name,quantity,label:String(row.quantity),delivery:delivery(w,now)}] : [];
  });
  if(!stocks.length) return null;
  const step=Number(p.multiplicity)||1;
  return {id,name:String(p.name||''),article:String(p.article||''),brand:String(p.brand||''),image:photo(p.default_image),price,step:Math.max(1,Math.ceil(step)),stocks};
}
async function supplier(env,path,params={}) {
  const token=await supplierToken(env);
  if(!token) throw new Error('supplier_unconfigured');
  const u=new URL('https://api.bm.parts'+path);
  for(const [k,v] of Object.entries(params)) u.searchParams.set(k,String(v));
  if(path!='/search/products/groups') for(const w of WAREHOUSES) u.searchParams.append('warehouses',w.id);
  const r=await fetch(u,{headers:{Authorization:token,'User-Agent':'Karpservice/1.0',Accept:'application/json'},signal:AbortSignal.timeout(18000),redirect:'manual'});
  if(!r.ok) throw new Error('supplier_'+r.status);
  return r.json();
}
export async function handleShop(request,env,headers,dependencies={}) {
  const u=new URL(request.url);
  if(!u.pathname.startsWith('/shop/'))return null;
  const reply=(d,status=200)=>Response.json(d,{status,headers});
  const error=(m,status=400)=>reply({success:false,error:m},status);
  try {
    if(u.pathname==='/shop/categories' && request.method==='GET') return reply({success:true,categories:CATEGORIES.map(publicCategory),configured:Boolean(await supplierToken(env))});
    if(u.pathname==='/shop/products' && request.method==='GET') {
      if(!await consumeRateLimit(env,`shop:${request.headers.get('CF-Connecting-IP')||'unknown'}`,90,60))return error('Забагато запитів. Спробуйте за хвилину.',429);
      const category=findCategory(u.searchParams.get('category'));
      if(!category)return error('Оберіть категорію.');
      const page=Number(u.searchParams.get('page')||1),q=(u.searchParams.get('q')||'').trim();
      if(!Number.isInteger(page)||page<1||page>1000||q.length>100)return error('Некоректний пошук.');
      // Legacy clients may still request the parent wipers category. Restrict it to blades too.
      const group=category.id==='wipers'||category.name==='Система склоочисника' ? findCategory('wipers:Система склоочисника/Щітки склоочисника').group : category.group;
      const d=await supplier(env,'/search/products',{group,q,page,per_page:24,available:'1',save:false,with_extra:false});
      const products=Object.entries(d.products||{}).map(([id,p])=>productView(p,p.uuid||id)).filter(Boolean);
      // Cache only membership, never purchase prices; checkout always reloads stock and price.
      if(products.length)await env.AUTH_DB.batch(products.map(p=>env.AUTH_DB.prepare('INSERT INTO shop_catalog(product_id,category_id,seen_at) VALUES(?,?,?) ON CONFLICT(product_id) DO UPDATE SET category_id=excluded.category_id,seen_at=excluded.seen_at').bind(p.id,category.id,Date.now())));
      return reply({success:true,products:products.map(publicProduct),page,has_more:page<Number(d.search?.total_pages||1),checked_at:new Date().toISOString()});
    }
    const auth=await requireAuthSession(request,env,headers);
    if(auth.response)return auth.response;
    if(env.APPLE_ONLY_AUTH==='true' && auth.session.auth_provider!=='apple')return error('Увійдіть через Apple.',401);
    const session=auth.session;
    if(!session.phone||!session.customer_id)return error('Підключіть номер телефону у профілі.',403);
    if(u.pathname==='/shop/orders'&&request.method==='GET') {
      const rows=await env.AUTH_DB.prepare('SELECT public_id,status,total_cents,created_at,crm_id FROM shop_orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 30').bind(Number(session.customer_id)).all();
      return reply({success:true,orders:rows.results});
    }
    if(u.pathname==='/shop/checkout'&&request.method==='POST')return await checkout(request,env,session,reply,error,dependencies);
    return error('Маршрут недоступний.',404);
  } catch(e) {
    console.error(JSON.stringify({event:'shop_failure',code:/^supplier_/.test(e.message)?e.message:'internal'}));
    return reply({success:false,error:'Магазин тимчасово недоступний. Спробуйте ще раз.',code:/^supplier_\d+$/.test(e.message)?e.message:'shop_unavailable'},503);
  }
}
async function checkout(request,env,session,reply,error,{getCars}={}) {
  // The CRM connection is enabled only after exact order type and managers are verified.
  if(!env.SHOP_ORDER_TYPE_ID||!env.SHOP_MANAGER_IDS)return error('Оформлення замовлень ще налаштовується. Зателефонуйте 073 44 47 344.',503);
  const raw=await request.text();if(raw.length>16000)return error('Завелике замовлення.');
  let b;try{b=JSON.parse(raw);}catch{return error('Некоректне замовлення.');}
  if(!/^[a-f0-9-]{36}$/i.test(b.key||'')||!Array.isArray(b.items)||!b.items.length||b.items.length>20||typeof b.comment!=='string'||b.comment.length>500)return error('Перевірте кошик.');
  const customer=Number(session.customer_id);
  const old=await env.AUTH_DB.prepare('SELECT public_id,status,total_cents,crm_id FROM shop_orders WHERE customer_id=? AND request_key=?').bind(customer,b.key).first();
  if(old)return reply({success:old.status==='sent',order:old,error:old.status==='sent'?undefined:'Замовлення перевіряється. Не оформлюйте його повторно; зв’яжіться з менеджером.'},old.status==='sent'?200:202);
  if(!await consumeRateLimit(env,`checkout:${customer}`,5,600))return error('Забагато спроб. Спробуйте пізніше.',429);
  let car=null;
  if(b.car_id){car=(await getCars(customer)).find(c=>Number(c.id)===Number(b.car_id));if(!car)return error('Оберіть своє авто.',403);}
  const seen=new Set(),lines=[];
  for(const i of b.items) {
    const key=`${i.id}:${i.warehouse}`;
    if(!/^[A-F0-9]{32}$/i.test(i.id||'')||!WAREHOUSES.some(w=>w.id===i.warehouse)||seen.has(key)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>99||!Number.isInteger(i.price))return error('Перевірте товари й кількість.');
    seen.add(key);
    if(!await env.AUTH_DB.prepare('SELECT product_id FROM shop_catalog WHERE product_id=?').bind(i.id).first())return error('Оновіть каталог і додайте товар повторно.');
  }
  for(let offset=0;offset<b.items.length;offset+=4) {
    const batch=b.items.slice(offset,offset+4);
    const checked=await Promise.all(batch.map(async i=>productView((await supplier(env,`/product/${i.id}`,{save:false,with_extra:false})).product||{},i.id)));
    for(let n=0;n<batch.length;n++) {
      const i=batch[n],p=checked[n],stock=p?.stocks.find(s=>s.id===i.warehouse);
      if(!stock||stock.quantity<i.quantity||i.quantity%p.step!==0)return error('Наявність або допустима кількість змінилась. Оновіть кошик.',409);
      if(p.price!==i.price)return error('Ціна змінилась. Видаліть товар з кошика та додайте його повторно за оновленою ціною.',409);
      lines.push({...p,quantity:i.quantity,warehouse:stock});
    }
  }
  const total=lines.reduce((n,p)=>n+p.price*p.quantity,0),id=crypto.randomUUID();
  const snapshot={lines,comment:b.comment,car:car?{id:car.id,vin:car.vin,name:[car.brand,car.model].filter(Boolean).join(' ')}:null};
  const inserted=await env.AUTH_DB.prepare("INSERT OR IGNORE INTO shop_orders(public_id,customer_id,request_key,status,total_cents,snapshot,created_at) VALUES(?,?,?,'sending',?,?,?) RETURNING public_id").bind(id,customer,b.key,total,JSON.stringify(snapshot),new Date().toISOString()).first();
  if(!inserted)return error('Це замовлення вже обробляється.',409);
  const managerIds=String(env.SHOP_MANAGER_IDS).split(',').map(Number).filter(Number.isSafeInteger);
  const notes=[`Магазин Karpservice • ${id}`,'Менеджери: Артем та Євгеній. Ручне підтвердження. Оплата після узгодження.',...(car?[`Авто: ${snapshot.car.name}; VIN: ${car.vin||'—'}`]:[]),...lines.map(p=>`${p.brand} ${p.article} — ${p.name}; ${p.quantity} × ${(p.price/100).toFixed(2)} грн; ${p.warehouse.name}; ${p.warehouse.delivery}`),`Разом: ${(total/100).toFixed(2)} грн`, `Коментар: ${b.comment}`].join('\n');
  let r,d;
  try {
    r=await fetch('https://api.roapp.io/v2/orders',{method:'POST',headers:{Authorization:`Bearer ${env.ROAPP_API_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({branch_id:Number(env.ROAPP_BRANCH_ID),order_type_id:Number(env.SHOP_ORDER_TYPE_ID),client_id:customer,manager_id:managerIds[parseInt(id.slice(0,8),16)%managerIds.length],malfunction:'Замовлення товарів із магазину Karpservice',manager_notes:notes,estimated_price:(total/100).toFixed(2)}),signal:AbortSignal.timeout(20000),redirect:'manual'});
    d=await r.json();
  } catch {
    await saveOrderState(env,id,'verification');
    return reply({success:false,order:{public_id:id,status:'verification'},error:'Перевіряємо передачу замовлення. Не повторюйте оформлення; зателефонуйте менеджеру та назвіть номер заявки.'},202);
  }
  const crmId=Number(d.data?.id||d.id);
  if(!r.ok||!Number.isSafeInteger(crmId)||crmId<=0){
    await saveOrderState(env,id,'verification');
    console.error(JSON.stringify({event:'shop_crm_failure',http:r.status,request:id}));
    return reply({success:false,order:{public_id:id,status:'verification'},error:'Не вдалося підтвердити передачу в CRM. Зверніться до менеджера з номером заявки.'},202);
  }
  if(!await saveOrderState(env,id,'sent',crmId))return reply({success:false,order:{public_id:id,status:'verification'},error:'Замовлення передано, але його статус ще перевіряється. Не оформлюйте повторно; назвіть менеджеру номер заявки.'},202);
  return reply({success:true,order:{public_id:id,status:'sent',total_cents:total,crm_id:crmId}});
}

async function saveOrderState(env,id,status,crmId=null) {
  try {await env.AUTH_DB.prepare('UPDATE shop_orders SET status=?,crm_id=? WHERE public_id=?').bind(status,crmId,id).run();return true;}
  catch {console.error(JSON.stringify({event:'shop_state_pending',request:id}));return false;}
}

async function credentialKey(env) {
  const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new TextEncoder().encode('karpservice'),info:new TextEncoder().encode('shop-supplier-token-v1')},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function sealToken(env,value) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await credentialKey(env),new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...bytes));
}
async function supplierToken(env) {
  const row=await env.AUTH_DB.prepare('SELECT ciphertext FROM integration_secrets WHERE name=?').bind('busmarket').first();
  if(!row)return String(env.BUSMARKET_API_TOKEN||'').trim();
  const [iv,value]=row.ciphertext.split('.').map(s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)));
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await credentialKey(env),value));
}
