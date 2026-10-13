// Consumer-facing data only: never return supplier prices or warehouse metadata.
const denied=/price|cost|discount|margin|stock|warehouse|contract|reserve|token|secret|supplier/i;
export function consumerData(value,depth=0){
  if(depth>8||value==null)return null;
  if(typeof value==='string')return value.slice(0,30000);
  if(typeof value==='number'||typeof value==='boolean')return value;
  if(Array.isArray(value))return value.map(v=>consumerData(v,depth+1)).filter(v=>v!==null);
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!denied.test(k)).map(([k,v])=>[k,consumerData(v,depth+1)]));
  return null;
}
export function searchFilters(params){
  const result={};
  for(const key of ['brands','gf']){
    const values=params.getAll(key);
    if(values.length>30||values.some(v=>!v.trim()||v.length>250||/[\r\n\x00]/.test(v)))throw new Error('invalid_filters');
    if(values.length)result[key]=[...new Set(values)];
  }
  for(const key of ['promo','new_product']){const v=params.get(key);if(v!==null){if(!['0','1'].includes(v))throw new Error('invalid_filters');result[key]=v;}}
  return result;
}
export function filterView(data,brands){
  return {
    filters:(Array.isArray(data.filters)?data.filters:[]).filter(f=>typeof f.name==='string'&&Array.isArray(f.values)).map(f=>({name:f.name,values:f.values.filter(v=>typeof v.value==='string').map(v=>({value:v.value,count:Number(v.products_count)||0}))})),
    brands:(Array.isArray(brands.brands)?brands.brands:[]).filter(b=>typeof b.name==='string').map(b=>({name:b.name,count:Number(b.products_count)||0}))
  };
}
export function detailView(raw,base,images,photo){
  const gallery=[...new Set([...(Array.isArray(images)?images:[]),...(Array.isArray(raw.images)?raw.images:[]),raw.default_image].map(photo).filter(Boolean))];
  const related=key=>Object.entries(raw[key]||{}).map(([id,p])=>({id:p.uuid||id,name:String(p.name||''),brand:String(p.brand||''),article:String(p.article||'')})).filter(p=>p.name);
  return {...base,images:gallery,description:String(raw.description||''),details:consumerData(raw.details),cars:consumerData(raw.cars),oe:consumerData(raw.oe),barcodes:consumerData(raw.barcodes),weight:raw.weight??null,components_of_kit:consumerData(raw.components_of_kit),files:consumerData(raw.files),analogs:related('analogs'),paired_products:related('paired_products'),buy_with:related('buy_with')};
}
