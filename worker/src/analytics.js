import { analyticsPage } from './analytics-page.js';
const events = new Set(['apple_login','registration','phone_linked','active','booking']);
const enc = new TextEncoder();
export function kyivDay(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const hex = bytes => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function recordAnalytics(env,event,actor,{once=false,date=new Date()}={}) {
  if (!events.has(event) || !actor || !env.AUTH_DB || !env.SESSION_SECRET) return;
  try {
    const day=kyivDay(date);
    const key=await crypto.subtle.importKey('raw',enc.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const actorKey=hex(await crypto.subtle.sign('HMAC',key,enc.encode(`analytics-v1:${day}:${event}:${actor}`)));
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(`INSERT INTO analytics_daily(day,event,actor_key,count) VALUES(?,?,?,1)
        ON CONFLICT(day,event,actor_key) DO UPDATE SET count=${once?'analytics_daily.count':'analytics_daily.count+1'}`).bind(day,event,actorKey),
      env.AUTH_DB.prepare('DELETE FROM analytics_daily WHERE day < ?').bind(kyivDay(new Date(date.getTime()-93*86400000)))
    ]);
  } catch { console.warn('analytics_write_failed'); } // Analytics must not break sign-in or bookings.
}
export async function analyticsAuthorized(request,env) {
  const expected=env.ANALYTICS_ADMIN_TOKEN_SHA256;
  const token=/^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.get('Authorization')||'')?.[1];
  if (!token || !/^[a-f0-9]{64}$/.test(expected||'')) return false;
  const digest=hex(await crypto.subtle.digest('SHA-256',enc.encode(token)));
  let diff=0;for(let i=0;i<64;i++)diff|=digest.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
export async function handleAnalytics(request,env) {
  const url=new URL(request.url);
  if (!['/admin/analytics','/admin/analytics/data'].includes(url.pathname)) return null;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow'};
  const reply=(data,status=200)=>Response.json(data,{status,headers});
  if(request.method!=='GET')return reply({error:'Method not allowed'},405);
  if(url.pathname==='/admin/analytics')return new Response(analyticsPage,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
  if(!await analyticsAuthorized(request,env))return reply({error:'Потрібен ключ власника.'},401);
  const days=Number(url.searchParams.get('days')||30);
  if(![7,30,90].includes(days))return reply({error:'Оберіть 7, 30 або 90 днів.'},400);
  const today=kyivDay();const from=new Date(`${today}T12:00:00Z`);from.setUTCDate(from.getUTCDate()-days+1);const start=from.toISOString().slice(0,10);
  try {
    const results=await env.AUTH_DB.batch([
      env.AUTH_DB.prepare("SELECT COUNT(*) AS accounts, COALESCE(SUM(CASE WHEN phone <> '' AND customer_id IS NOT NULL THEN 1 ELSE 0 END),0) AS linked FROM apple_accounts WHERE disabled_at IS NULL"),
      env.AUTH_DB.prepare('SELECT day,event,SUM(count) AS total,COUNT(*) AS unique_accounts FROM analytics_daily WHERE day >= ? AND day <= ? GROUP BY day,event ORDER BY day DESC,event').bind(start,today),
      env.AUTH_DB.prepare("SELECT value FROM analytics_meta WHERE key='started_at'")
    ]);
    return reply({snapshot:results[0].results[0],daily:results[1].results,started_at:results[2].results[0]?.value||null,from:start,to:today,days,timezone:'Europe/Kyiv',downloads:null,generated_at:new Date().toISOString()});
  } catch {return reply({error:'Аналітика тимчасово недоступна.'},503);}
}
