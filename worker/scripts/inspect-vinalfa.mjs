const base='https://api.vinalfa.com/oem/v2';
async function get(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.VINALFA_API_TOKEN,'Content-Type':'application/json',Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('Provider HTTP '+r.status);return r.json();}


const vehicle='66805a43f90242a29500c068490669e7', section='3601a835b76cc12952d851562224b992';
console.log('PARTS',JSON.stringify(await get('/sections/'+section+'/parts?vehicle_hash='+vehicle)).slice(0,42000));
console.log('SEARCH',JSON.stringify(await get('/vehicles/'+vehicle+'/search?quick_category=service-oil-filter')).slice(0,18000));
