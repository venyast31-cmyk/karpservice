import { requireAuthSession, consumeRateLimit, sha256Hex, safeEqual } from './auth.js';
export const CATEGORIES = [
  {id:'oil',name:'Оливи та технічні рідини',group:'ОЛИВА, ЗМАЗКА  І ТЕХНІЧНІ РІДИНИ',image:'m/z/g/x/f/fb805475.png'},
  {id:'electric',name:'Електрика',group:'ЕЛЕКТРИКА',image:'b/i/g/m/d/b239842f.png'},
  {id:'wipers',name:'Очищення вікон і фар',group:'СИСТЕМА ОЧИЩЕННЯ ВІКОН І ФАР',image:'k/p/h/x/k/c1ae9420.png'},
  {id:'care',name:'Аксесуари та догляд',group:'АКСЕСУАРИ і ЗАСОБИ ПО ДОГЛЯДУ',image:'e/n/p/q/o/dd19d405.jpeg'}
];
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
  if(!env.BUSMARKET_API_TOKEN) throw new Error('supplier_unconfigured');
  const u=new URL('https://api.bm.parts'+path);
  for(const [k,v] of Object.entries(params)) u.searchParams.set(k,String(v));
  if(path!='/search/products/groups') for(const w of WAREHOUSES) u.searchParams.append('warehouses',w.id);
  const r=await fetch(u,{headers:{Authorization:env.BUSMARKET_API_TOKEN,'User-Agent':'Karpservice/1.0',Accept:'application/json'},signal:AbortSignal.timeout(18000),redirect:'error'});
  if(!r.ok) throw new Error('supplier_'+r.status);
  return r.json();
}
export async function handleShop(request,env,headers,dependencies={}) {
  const u=new URL(request.url);
  if(!u.pathname.startsWith('/shop/'))return null;
  const reply=(d,status=200)=>Response.json(d,{status,headers});
  const error=(m,status=400)=>reply({success:false,error:m},status);
  try {
    // Temporary, expiring read-only setup access. Never returns API credentials or customer data.
    if(u.pathname==='/shop/setup') {
      const token=request.headers.get('X-Shop-Setup')||'';
      if(request.method!=='GET'||Date.now()>Number(env.SHOP_SETUP_UNTIL)||!env.SHOP_SETUP_TOKEN_SHA256||!safeEqual(await sha256Hex(token),env.SHOP_SETUP_TOKEN_SHA256))return error('Недоступно.',404);
      const result={supplier_configured:Boolean(env.BUSMARKET_API_TOKEN)};
      for(const path of ['/v2/orders/types','/v2/employees','/employees','/v2/users']) {
        const r=await fetch('https://api.roapp.io'+path,{headers:{Authorization:`Bearer ${env.ROAPP_API_KEY}`,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
        const d=await r.json().catch(()=>({}));
        const rows=Array.isArray(d)?d:(Array.isArray(d.data)?d.data:[]);
        result[path]={status:r.status,keys:Object.keys(d),items:rows.map(x=>({id:x.id,name:x.name,first_name:x.first_name,last_name:x.last_name,active:x.active,branch_ids:x.branch_ids}))};
        await new Promise(resolve=>setTimeout(resolve,400));
      }
      return reply(result);
    }
    if(u.pathname==='/shop/categories' && request.method==='GET') return reply({success:true,categories:CATEGORIES.map(({group,...c})=>({...c,image:photo(c.image)})),configured:Boolean(env.BUSMARKET_API_TOKEN)});
    if(u.pathname==='/shop/products' && request.method==='GET') {
      if(!await consumeRateLimit(env,`shop:${request.headers.get('CF-Connecting-IP')||'unknown'}`,90,60))return error('Забагато запитів. Спробуйте за хвилину.',429);
      const category=CATEGORIES.find(c=>c.id===u.searchParams.get('category'));
      if(!category)return error('Оберіть категорію.');
      const page=Number(u.searchParams.get('page')||1),q=(u.searchParams.get('q')||'').trim();
      if(!Number.isInteger(page)||page<1||page>1000||q.length>100)return error('Некоректний пошук.');
      const d=await supplier(env,'/search/products',{group:category.group,q,page,per_page:24,available:'1',save:false,with_extra:false});
      const products=Object.entries(d.products||{}).map(([id,p])=>productView(p,p.uuid||id)).filter(Boolean);
      // Cache only membership, never purchase prices; checkout always reloads stock and price.
      if(products.length)await env.AUTH_DB.batch(products.map(p=>env.AUTH_DB.prepare('INSERT INTO shop_catalog(product_id,category_id,seen_at) VALUES(?,?,?) ON CONFLICT(product_id) DO UPDATE SET category_id=excluded.category_id,seen_at=excluded.seen_at').bind(p.id,category.id,Date.now())));
      return reply({success:true,products,page,has_more:page<Number(d.search?.total_pages||1),checked_at:new Date().toISOString()});
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
    return error('Магазин тимчасово недоступний. Спробуйте ще раз.',503);
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
    const d=await supplier(env,`/product/${i.id}`,{save:false,with_extra:false});
    const p=productView(d.product||{},i.id),stock=p?.stocks.find(s=>s.id===i.warehouse);
    if(!stock||stock.quantity<i.quantity||i.quantity%p.step!==0)return error('Наявність або допустима кількість змінилась. Оновіть кошик.',409);
    if(p.price!==i.price)return error('Ціна змінилась. Видаліть товар з кошика та додайте його повторно за оновленою ціною.',409);
    lines.push({...p,quantity:i.quantity,warehouse:stock});
  }
  const total=lines.reduce((n,p)=>n+p.price*p.quantity,0),id=crypto.randomUUID();
  const snapshot={lines,comment:b.comment,car:car?{id:car.id,vin:car.vin,name:[car.brand,car.model].filter(Boolean).join(' ')}:null};
  const inserted=await env.AUTH_DB.prepare("INSERT OR IGNORE INTO shop_orders(public_id,customer_id,request_key,status,total_cents,snapshot,created_at) VALUES(?,?,?,'sending',?,?,?) RETURNING public_id").bind(id,customer,b.key,total,JSON.stringify(snapshot),new Date().toISOString()).first();
  if(!inserted)return error('Це замовлення вже обробляється.',409);
  const managerIds=String(env.SHOP_MANAGER_IDS).split(',').map(Number).filter(Number.isSafeInteger);
  const notes=[`Магазин Karpservice • ${id}`,'Менеджери: Артем та Євгеній. Ручне підтвердження. Оплата після узгодження.',...(car?[`Авто: ${snapshot.car.name}; VIN: ${car.vin||'—'}`]:[]),...lines.map(p=>`${p.brand} ${p.article} — ${p.name}; ${p.quantity} × ${(p.price/100).toFixed(2)} грн; ${p.warehouse.name}; ${p.warehouse.delivery}`),`Разом: ${(total/100).toFixed(2)} грн`, `Коментар: ${b.comment}`].join('\n');
  let r,d;
  try {
    r=await fetch('https://api.roapp.io/v2/orders',{method:'POST',headers:{Authorization:`Bearer ${env.ROAPP_API_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({branch_id:Number(env.ROAPP_BRANCH_ID),order_type_id:Number(env.SHOP_ORDER_TYPE_ID),client_id:customer,manager_id:managerIds[parseInt(id.slice(0,8),16)%managerIds.length],malfunction:'Замовлення товарів із магазину Karpservice',manager_notes:notes,estimated_price:(total/100).toFixed(2)}),signal:AbortSignal.timeout(20000),redirect:'error'});
    d=await r.json();
  } catch {
    await env.AUTH_DB.prepare("UPDATE shop_orders SET status='verification' WHERE public_id=?").bind(id).run();
    return reply({success:false,order:{public_id:id,status:'verification'},error:'Перевіряємо передачу замовлення. Не повторюйте оформлення; зателефонуйте менеджеру та назвіть номер заявки.'},202);
  }
  const crmId=Number(d.data?.id||d.id);
  if(!r.ok||!Number.isSafeInteger(crmId)||crmId<=0){
    await env.AUTH_DB.prepare("UPDATE shop_orders SET status='verification' WHERE public_id=?").bind(id).run();
    console.error(JSON.stringify({event:'shop_crm_failure',http:r.status,request:id}));
    return reply({success:false,order:{public_id:id,status:'verification'},error:'Не вдалося підтвердити передачу в CRM. Зверніться до менеджера з номером заявки.'},202);
  }
  await env.AUTH_DB.prepare("UPDATE shop_orders SET status='sent',crm_id=? WHERE public_id=?").bind(crmId,id).run();
  return reply({success:true,order:{public_id:id,status:'sent',total_cents:total,crm_id:crmId}});
}
