// Quick categories are taxonomy entries, not a guarantee that the provider has
// indexed that category for every vehicle. Retry with the supplier's own labels.
import {VinalfaError} from './vinalfa.js';
const policies={
 'service-transmission-filter':{queries:['filter'],unit:/TRANSMISSION|GEARBOX|OIL PAN,?\s*OIL FILTER|КОРОБК|АКПП/i,part:/FILTER|ФИЛЬТР/i},
 'cooling-radiator':{queries:['radiator'],unit:/^RADIATOR[, ]|EXPANSION TANK|РАДИАТОР|РАСШИРИТЕЛЬН/i,part:/RADIATOR|РАДИАТОР|CLOSING CAP/i},
 'cooling-water-pump':{queries:['pump'],unit:/WATER PUMP|COOLANT PUMP|ВОДЯН|ОХЛАЖДАЮЩ/i,part:/WATER PUMP|COOLANT PUMP|ВОДЯН|НАСОС/i},
 'service-water-pump':{queries:['pump'],unit:/WATER PUMP|COOLANT PUMP|ВОДЯН|ОХЛАЖДАЮЩ/i,part:/WATER PUMP|COOLANT PUMP|ВОДЯН|НАСОС/i},
 'engine-mounts':{queries:['engine mount'],unit:/ENGINE (SUSPENSION|SUPPORT|MOUNT)|ОПОР.*ДВИГАТ/i,part:/ENGINE MOUNT|ОПОР.*ДВИГАТ/i},
 'brake-disc':{queries:['brake disc','brake disk'],part:/BRAKE DIS[CK]|ТОРМОЗНОЙ ДИСК/i},
 'cooling-thermostat':{queries:['thermostat'],part:/THERMOSTAT|ТЕРМОСТАТ/i}
};
function find(nodes,id){for(const n of nodes||[]){if(n.quick_category===id)return n;const child=find(n.children,id);if(child)return child;}return null;}
function items(data){if(!Array.isArray(data?.items))throw new VinalfaError('oem_invalid_response');return data.items;}
export async function quickSearchWithFallback(api,vehicle,id,getTaxonomy){
 const direct=await api.quickSearch(vehicle,id);if(items(direct).length)return direct;
 const node=find(await getTaxonomy(),id);if(!node)throw new VinalfaError('invalid_query',400);
 const policy=policies[id];
 const primary=String(node.label||'').split(',')[0].trim();
 const singular=primary.replace(/\b([a-z]{3,})s\b/gi,(word,stem)=>/ss$/i.test(word)?word:stem);
 const queries=[...new Set([...(policy?.queries||[]),singular,primary,...String(node.query||'').split(','),...singular.split(/\s+/).slice(1).map((_,i)=>singular.split(/\s+/).slice(i+1).join(' '))].map(x=>x.trim()).filter(x=>x.length>=2))].slice(0,5);
 for(const q of queries){
   const data=await api.search(vehicle,q);let found=items(data);
   if(policy?.unit)found=found.filter(n=>policy.unit.test(n.name||''));
   if(policy?.part)found=found.map(n=>({...n,foundParts:(n.foundParts||[]).filter(p=>policy.part.test([p.label_en,p.label_ru,p.label].filter(Boolean).join(' ')))})).filter(n=>n.foundParts.length);
   if(found.length)return {...data,items:found};
 }
 return {items:[]};
}
