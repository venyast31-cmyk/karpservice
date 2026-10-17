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
  if(depth>10)return [];
  return list(rows).slice(0,500).map(n=>({id:validId(n.hash)?n.hash:'',name:text(n.name),image:oemImage(n.image),parts:n.can_fetch_parts===true||n.kind==='diagram',children:nodesView(n.children,depth+1)})).filter(n=>n.id||n.children.length);
}
export function partsView(d) {
  if(!Array.isArray(d?.data?.parts))throw new VinalfaError('oem_invalid_response');
  return {name:text(d.sectionName),image:oemImage(d.data.image),parts:d.data.parts.slice(0,1000).map(p=>({reference:text(p.reference,60),points:list(p.points).filter(p=>[p.x,p.y,p.width,p.height].every(Number.isFinite)&&p.x>=0&&p.y>=0&&p.width>0&&p.height>0).slice(0,30).map(({x,y,width,height})=>({x,y,width,height})),numbers:list(p.numbers).slice(0,100).map(n=>({number:text(n.number,100),replacement:text(n.replace,100),name:text(n.label),quantity:text(n.count,30),description:list(n.description).slice(0,40).map(x=>({name:text(x.name),value:text(x.desc,1500)}))}))}))};
}
const messages={invalid_vin:'Введіть 17 символів VIN без I, O та Q.',invalid_catalog_id:'Відкрийте вузол із каталогу.',invalid_query:'Перевірте пошуковий запит.',oem_not_found:'Автомобіль або вузол не знайдено в каталозі.',oem_limit:'Ліміт VIN-пошуку тимчасово вичерпано. Скористайтеся підбором за маркою або зверніться до менеджера.',oem_unconfigured:'Каталог схем ще налаштовується.',oem_access_unavailable:'Каталог схем тимчасово недоступний. Спробуйте підбір за маркою.',oem_invalid_response:'Не вдалося прочитати відповідь каталогу. Спробуйте ще раз.',oem_unavailable:'Каталог схем тимчасово недоступний. Спробуйте ще раз.'};
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
    if(!validId(vehicle)||!['groups','children','parts','search'].includes(op)||(['children','parts'].includes(op)&&!validId(section)))return fail('invalid_catalog_id',400);
    if(!await getCache('vehicle:'+vehicle))return reply({success:false,error:'Повторіть пошук автомобіля за VIN.',code:'oem_vehicle_expired'},410);
    const q=text(u.searchParams.get('q'),121),quick=text(u.searchParams.get('quick'),101);
    if(op==='search'&&!(quick?/^[a-z0-9-]{2,100}$/.test(quick):q.length>=2&&q.length<=120))return fail('invalid_query',400);
    const key='nav:'+await sha256Hex(JSON.stringify([op,vehicle,section,q,quick]));const cached=await getCache(key);
    if(cached)return reply({success:true,...cached});
    if(!await rate(env,'oem-provider-global',100,60))return fail('oem_limit',429);
    let result;
    if(op==='groups'){const d=await api.groups(vehicle);if(!Array.isArray(d?.data?.sections))throw new VinalfaError('oem_invalid_response');result={nodes:nodesView(d.data.sections)};}
    if(op==='children'){const d=await api.children(section);if(!Array.isArray(d?.data?.units)&&!Array.isArray(d?.data?.sections))throw new VinalfaError('oem_invalid_response');result={nodes:nodesView(d.data.units||d.data.sections)};}
    if(op==='parts')result=partsView(await api.parts(section,vehicle));
    if(op==='search'){const d=quick?await api.quickSearch(vehicle,quick):await api.search(vehicle,q);if(!Array.isArray(d.items))throw new VinalfaError('oem_invalid_response');result={nodes:nodesView(d.items.map(n=>({...n,kind:'diagram'})))};}
    await putCache(key,result);return reply({success:true,...result});
  }catch(e){return fail(e instanceof VinalfaError?e.message:'oem_unavailable',e instanceof VinalfaError?e.status:503);}
}
