// Explicit fulfillment snapshot; never treat supplier stock location as shipping address.
export function fulfillmentView(value) {
  if(value===undefined)return {method:'pickup'}; // Older app builds collect at the service.
  if(!value||!['pickup','nova_poshta'].includes(value.method))throw Error('Оберіть спосіб отримання.');
  if(value.method==='pickup')return {method:'pickup'};
  const clean=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)?v.trim().replace(/\s+/g,' '):'';
  const city=clean(value.city,120),branch=clean(value.branch,160),name=clean(value.name,160);
  let phone=clean(value.phone,30).replace(/[\s()+-]/g,'');if(/^0\d{9}$/.test(phone))phone='38'+phone;
  if(city.length<2||!branch||name.split(' ').length<2||!/^380\d{9}$/.test(phone))throw Error('Для Нової пошти вкажіть місто, відділення, ПІБ та український номер телефону.');
  return {method:'nova_poshta',city,branch,name,phone};
}
export function fulfillmentNotes(value){return value.method==='pickup'?'Отримання: самовивіз — Бориспіль, Київський Шлях, 10.':`Отримання: Нова пошта\nМісто: ${value.city}\nВідділення: ${value.branch}\nОдержувач: ${value.name}\nТелефон: +${value.phone}`;}
