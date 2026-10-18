import {quickSearchWithFallback} from './oem-search.js';
import {createVinalfa, VinalfaError} from './vinalfa.js';
import {consumeRateLimit, sha256Hex} from './auth.js';
const text = (v,max=300) => typeof v==='string'||typeof v==='number'?String(v).slice(0,max):'';
const list = v => Array.isArray(v)?v:[];
const validId = v => typeof v==='string'&&/^[a-f0-9]{32}$/i.test(v);
export function oemImage(value) {
  try {const u=new URL(value);return u.origin==='https://vinalfa.com'&&u.pathname==='/images/oem'&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export function vehiclesView(d) {
  if(!Array.isArray(d?.data?.modifications))throw new VinalfaError('oem_invalid_response');
  return {brand:text(d.catalog),vehicles:d.data.modifications.filter(v=>validId(v.hash)).map(v=>({id:v.hash,brand:text(d.catalog),model:text(v.model),date:text(v.date),engine:text(v.engine),transmission:text(v.transmission),catalog:text(v.catalog),equipment:list(v.equipments).slice(0,120).map(x=>({name:text(x.key),value:text(x.value)}))}))};
}
export function nodesView(rows,depth=0) {
  
  return list(rows).map(n=>({id:validId(n.hash)?n.hash:'',name:text(n.name),image:oemImage(n.image),parts:n.can_fetch_parts===true||n.kind==='diagram',children:nodesView(n.children,depth+1)})).filter(n=>n.id||n.children.length);
}
export function quickView(rows,depth=0) {
  
  return list(rows).map(n=>({id:'',name:text(n.label),quick:/^[a-z0-9-]{2,100}$/.test(n.quick_category||'')?n.quick_category:'',children:quickView(n.children,depth+1)})).filter(n=>n.quick||n.children.length);
}
export function searchView(items) {
  return nodesView(items.map(n=>({...n,kind:'diagram'}))).map(n=>{
    const source=items.find(x=>x.hash===n.id),byRef=new Map();
    for(const p of list(source?.foundParts)){
      const reference=text(p.ref,60);const part=byRef.get(reference)||{reference,numbers:[]};
      const numbers=[...new Set([p.number,p.part_no,p.part_number,...list(p.numbers)].filter(v=>typeof v==='string'&&/^[A-Za-z0-9 .\/-]{2,100}$/.test(v)))];
      for(const number of numbers)if(!part.numbers.some(n=>n.number===number))part.numbers.push({number,name:text(p.label_en||p.label),quantity:text(p.qty,30),replacement:text(p.replace,100),description:[]});
      if(part.numbers.length)byRef.set(reference,part);
    }
    const preview=[...byRef.values()];return {...n,preview,matches:preview.flatMap(p=>p.numbers.map(n=>n.number))};
  });
}
export function partsView(d) {
  if(!Array.isArray(d?.data?.parts))throw new VinalfaError('oem_invalid_response');
  return {name:text(d.sectionName),image:oemImage(d.data.image),parts:d.data.parts.map(p=>({reference:text(p.reference,60),points:list(p.points).filter(p=>[p.x,p.y,p.width,p.height].every(Number.isFinite)&&p.x>=0&&p.y>=0&&p.width>0&&p.height>0).map(({x,y,width,height})=>({x,y,width,height})),numbers:list(p.numbers).map(n=>({number:text(n.number,100),replacement:text(n.replace,100),name:text(n.label),quantity:text(n.count,30),description:list(n.description).slice(0,40).map(x=>({name:text(x.name),value:text(x.desc,1500)}))}))}))};
}
const messages={oem_catalog_unavailable:'Автомобіль визначено, але постачальник не надав доступ до схем цієї марки за поточною підпискою. Поверніться до магазину та скористайтеся підбором за маркою і моделлю.',oem_timeout:'Каталог відповідає довше звичайного. Спробуйте ще раз.',oem_network_error:'Немає зв’язку з каталогом схем. Спробуйте пізніше.',invalid_vin:'Введіть 17 символів VIN без I, O та Q.',invalid_catalog_id:'Відкрийте вузол із каталогу.',invalid_query:'Перевірте пошуковий запит.',oem_not_found:'Автомобіль або вузол не знайдено в каталозі.',oem_limit:'Ліміт VIN-пошуку тимчасово вичерпано. Скористайтеся підбором за маркою або зверніться до менеджера.',oem_unconfigured:'Каталог схем ще налаштовується.',oem_access_unavailable:'Каталог схем тимчасово недоступний. Спробуйте підбір за маркою.',oem_invalid_response:'Не вдалося прочитати відповідь каталогу. Спробуйте ще раз.',oem_unavailable:'Каталог схем тимчасово недоступний. Спробуйте ще раз.'};
export async function handleOem(request,env,headers,deps={}) {
  const u=new URL(request.url);
  if(!['/shop/oem','/shop/oem/resolve'].includes(u.pathname))return null;
  const reply=(data,status=200)=>Response.json(data,{status,headers:{...headers,'Cache-Control':'no-store'}});
  const fail=(code,status)=>reply({success:false,error:messages[code]||messages.oem_unavailable,code},status);
  const rate=deps.rate||consumeRateLimit,api=deps.api||createVinalfa(env),now=Date.now();
  const getCache=async key=>{const r=await env.AUTH_DB.prepare('SELECT payload FROM oem_cache WHERE cache_key=? AND expires_at>?').bind(key,now).first();return r?JSON.parse(r.payload):null;};
  const putCache=async(key,value)=>{await env.AUTH_DB.prepare('INSERT INTO oem_cache(cache_key,payload,expires_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at').bind(key,JSON.stringify(value),now+86400000).run();};
  try {
    if(!env.VINALFA_API_TOKEN)return fail('oem_unconfigured',503);
    if(!await rate(env,'oem-ip:'+ (request.headers.get('CF-Connecting-IP')||'unknown'),60,60))return fail('oem_limit',429);
    if(u.pathname==='/shop/oem/resolve'){
      if(request.method!=='POST')return fail('invalid_query',405);
      const raw=await request.text();if(raw.length>512)return fail('invalid_vin',400);
      let body;try{body=JSON.parse(raw);}catch{return fail('invalid_vin',400);}
      const vin=text(body?.vin).trim().toUpperCase();if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))return fail('invalid_vin',400);
      const key='vin:'+await sha256Hex(vin);const cached=await getCache(key);
      if(cached)return reply({success:true,...cached});
      // Keep the trial quota bounded. A paid plan can raise this explicit server setting.
      const daily=Math.max(1,Math.min(10000,Number(env.OEM_VIN_DAILY_LIMIT)||8));
      if(!await rate(env,'oem-vin-ip:'+(request.headers.get('CF-Connecting-IP')||'unknown'),5,86400)||!await rate(env,'oem-vin-global',daily,86400))return fail('oem_limit',429);
      const result=vehiclesView(await api.resolve(vin));
      if(!result.vehicles.length)return fail('oem_not_found',404);
      await env.AUTH_DB.prepare('DELETE FROM oem_cache WHERE expires_at<=?').bind(now).run();
      for(const v of result.vehicles)await putCache('vehicle:'+v.id,{valid:true});
      await putCache(key,result);return reply({success:true,...result});
    }
    if(request.method!=='GET')return fail('invalid_query',405);
    const op=u.searchParams.get('op'),vehicle=u.searchParams.get('vehicle'),section=u.searchParams.get('section');
    if(!validId(vehicle)||!['groups','children','parts','search','quick'].includes(op)||(['children','parts'].includes(op)&&!validId(section)))return fail('invalid_catalog_id',400);
    if(!await getCache('vehicle:'+vehicle))return reply({success:false,error:'Повторіть пошук автомобіля за VIN.',code:'oem_vehicle_expired'},410);
    const q=text(u.searchParams.get('q'),121),quick=text(u.searchParams.get('quick'),101);
    if(op==='search'&&!(quick?/^[a-z0-9-]{2,100}$/.test(quick):q.length>=2&&q.length<=120))return fail('invalid_query',400);
    const key='nav4:'+await sha256Hex(JSON.stringify([op,vehicle,section,q,quick]));const cached=await getCache(key);
    if(cached)return reply({success:true,...cached});
    if(!await rate(env,'oem-provider-global',100,60))return fail('oem_limit',429);
    let result;
    if(op==='quick'){const d=await api.quickSelection(vehicle);if(!Array.isArray(d?.quick_taxonomy?.tree))throw new VinalfaError('oem_invalid_response');result={nodes:quickView(d.quick_taxonomy.tree)};}
    if(op==='groups'){const d=await api.groups(vehicle);if(!Array.isArray(d?.data?.sections))throw new VinalfaError('oem_invalid_response');result={nodes:nodesView(d.data.sections)};}
    if(op==='children'){const d=await api.children(section);if(!Array.isArray(d?.data?.units)&&!Array.isArray(d?.data?.sections))throw new VinalfaError('oem_invalid_response');result={nodes:nodesView([...list(d.data.sections),...list(d.data.units)])};}
    if(op==='parts')result=partsView(await api.parts(section,vehicle));
    if(op==='search'){
      const limitedSearch={quickSearch:(...args)=>api.quickSearch(...args),search:async(...args)=>{if(!await rate(env,'oem-provider-global',100,60))throw new VinalfaError('oem_limit',429);return api.search(...args);}};
      const taxonomy=async()=>{const k='quick-terms:'+vehicle,c=await getCache(k);if(c)return c;
        if(!await rate(env,'oem-provider-global',100,60))throw new VinalfaError('oem_limit',429);
        const d=await api.quickSelection(vehicle);const tree=d?.quick_taxonomy?.tree;if(!Array.isArray(tree))throw new VinalfaError('oem_invalid_response');await putCache(k,tree);return tree;};
      const d=quick?await quickSearchWithFallback(limitedSearch,vehicle,quick,taxonomy):await api.search(vehicle,q);if(!Array.isArray(d.items))throw new VinalfaError('oem_invalid_response');result={nodes:searchView(d.items)};}
    await putCache(key,result);return reply({success:true,...result});
  }catch(e){if(e instanceof VinalfaError)return reply({success:false,error:messages[e.message]||messages.oem_unavailable,code:e.message,...(e.upstreamStatus?{upstream_status:e.upstreamStatus}:{})},e.status);return fail('oem_unavailable',503);}
}
