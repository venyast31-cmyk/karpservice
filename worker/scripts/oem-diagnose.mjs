
const env=process.env;
const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/e7568dec-237a-4f1d-b8eb-fd1170af09e9/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql:"SELECT payload FROM oem_cache WHERE cache_key LIKE 'vin:%' AND payload LIKE ? AND expires_at > ?",params:['%Range Rover%',Date.now()]})});
const db=await r.json();if(!db.success)throw Error('Cache query failed: '+r.status);
const rows=db.result.flatMap(x=>x.results||[]);
console.log('Matching cache rows',rows.length);
async function probe(path){
 const res=await fetch('https://api.vinalfa.com/oem/v2'+path,{headers:{Authorization:'Bearer '+env.VINALFA_API_TOKEN,Accept:'application/json'},redirect:'manual'});
 const data=await res.json().catch(()=>({}));
 if(!res.ok){let msg=JSON.stringify({error:data.error,message:data.message,code:data.code});msg=msg.replace(/[A-HJ-NPR-Z0-9]{17}/g,'[VIN]').replaceAll(env.VINALFA_API_TOKEN,'[TOKEN]');console.log(JSON.stringify({path,status:res.status,error:msg.slice(0,500)}));}
 else console.log(JSON.stringify({path,status:res.status,keys:Object.keys(data.data||{})}));
 return res.ok?data.data:null;
}
for(const row of rows.slice(0,2)){
 const payload=JSON.parse(row.payload);
 for(const car of (payload.vehicles||[]).slice(0,2)){
 console.log(JSON.stringify({vehicle:car.id,model:car.model}));
 const g=await probe('/vehicles/'+car.id+'/groups');if(!g)continue;
 function leaves(ns){return (ns||[]).flatMap(n=>n.children?.length?leaves(n.children):n.hash?[n]:[]);}
 const ns=leaves(g.data?.sections);
 console.log('Groups',JSON.stringify(ns.slice(0,15).map(n=>({name:n.name,hash:n.hash}))));
 const n=ns.find(n=>/ATTACHMENT/i.test(n.name))||ns[0];if(n)await probe('/sections/'+n.hash+'/children');
 }
}
