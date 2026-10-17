const base='https://api.vinalfa.com/oem/v2';
async function get(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.VINALFA_API_TOKEN,'Content-Type':'application/json',Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('Provider HTTP '+r.status);return r.json();}

const resolved=await get('/vehicles/resolve',{identifier:'WDC1660231A178846',identifier_type:'vin'});
console.log('RESOLVE',JSON.stringify(resolved));
function hashes(x){if(!x||typeof x!=='object')return []; return Object.entries(x).flatMap(([k,v])=>typeof v==='string'&&/hash/i.test(k)&&/^[a-f0-9]{32}$/i.test(v)?[v]:hashes(v));}
const vehicle=hashes(resolved)[0];
if(vehicle){const groups=await get('/vehicles/'+vehicle+'/groups');console.log('GROUPS',JSON.stringify(groups).slice(0,22000));
const quick=await get('/vehicles/'+vehicle+'/quick-selection');console.log('QUICK',JSON.stringify(quick).slice(0,18000));
let section=hashes(groups).filter(h=>h!==vehicle)[0];
if(section){console.log('CHILDREN',JSON.stringify(await get('/sections/'+section+'/children')).slice(0,22000));}}
