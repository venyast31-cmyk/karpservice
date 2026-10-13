// Public catalogue selectors. Supplier credentials and VIN catalogue tokens never leave the worker.
export function vehicleSelection(params) {
  const car=params.get('car')||'',node=params.get('node')||'';
  if(car.length>250||node.length>500||/[\x00-\x1f]/.test(car+node)||car.split('>').length>2||node&&!car)throw new Error('invalid_vehicle');
  return car?{cars:[car],...(node?{nodes:node}:{})}:{};
}
export function names(raw) {
  const rows=Array.isArray(raw)?raw:Object.entries(raw||{}).map(([name,v])=>({name,...(typeof v==='object'?v:{})}));
  return rows.flatMap(x=>{const name=String(x.name??'').trim();return name&&name.length<=200&&!/[\x00-\x1f]/.test(name)?[{name,count:Number(x.products_count)||0}]:[];});
}
export async function vehicleCatalogue(params,fetchSupplier) {
  const vin=(params.get('vin')||'').trim().toUpperCase();
  if(vin){
    if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))return {error:'VIN має містити 17 символів без I, O та Q.',status:400};
    // Documented public suggestions endpoint only. No private VIN/scheme endpoints.
    let d;try{d=await fetchSupplier('/search/suggests',{q:vin,search_mode:'strict'});}catch{return {vehicle:null,message:'Автоматичний підбір за VIN недоступний. Оберіть марку та модель нижче.'};}
    if(d.type!=='vehicle'||!d.vehicle)return {vehicle:null,message:'Автомобіль за VIN не знайдено. Оберіть марку та модель нижче.'};
    return {vehicle:{brand:String(d.vehicle.brand||'').slice(0,100),model:String(d.vehicle.name||'').slice(0,150),year:String(d.vehicle.model_year||'').slice(0,10)},message:'Перевірте марку та оберіть точну модель у каталозі.'};
  }
  const brand=params.get('brand')||'',model=params.get('model')||'';
  if([brand,model].some(x=>x.length>200||/[\x00-\x1f>]/.test(x)||x==='.'||x==='..')||model&&!brand)return {error:'Некоректний автомобіль.',status:400};
  const path=model?`/search/products/aggregations/car/${encodeURIComponent(brand)}/model/${encodeURIComponent(model)}`:brand?`/search/products/aggregations/car/${encodeURIComponent(brand)}/models`:'/search/products/aggregations/cars';
  const d=await fetchSupplier(path,{available:'1',cars_as:'arr'}),key=model?'engines':brand?'models':'cars';
  return {options:names(d[key]),kind:key};
}
export async function vehicleGroups(params,fetchSupplier){
  const selection=vehicleSelection(params);if(!selection.cars)return {error:'Оберіть автомобіль.',status:400};
  const d=await fetchSupplier('/search/products/aggregations/nodes',{...selection,available:'1',nodes_as:'arr'});
  const rows=Array.isArray(d.nodes)?d.nodes:Object.entries(d.nodes||{}).map(([path,v])=>({path,...v}));
  return {groups:rows.flatMap(x=>{const path=String(x.path||''),name=String(x.name||path.split('/').at(-1));return path&&path.length<=500?[{id:'vehicle:'+path,name,path,children:[]}]:[];})};
}
