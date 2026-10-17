const base='https://api.vinalfa.com/oem/v2';
async function get(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.VINALFA_API_TOKEN,'Content-Type':'application/json',Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('Provider HTTP '+r.status);return r.json();}
const examples=await get('/catalogs/examples');
console.log('EXAMPLES',JSON.stringify(examples).slice(0,14000));
