const valid = value => (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) &&
  Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 9999999;
export function firstMileage(...values) { const value = values.find(valid); return value === undefined ? null : Number(value); }
export function mileageKey(car) {
  const vin = String(car.vin || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  return vin ? `vin:${vin}` : `id:${Number(car.id)}`;
}
export function recordedMileage(car) {
  const history = [...(car.history || [])].sort((a,b) =>
    (Date.parse(b.created_at || b.scheduled_for) || 0) - (Date.parse(a.created_at || a.scheduled_for) || 0));
  const recent = history.find(order => valid(order.mileage));
  if (recent) return Number(recent.mileage);
  return valid(car.mileage) ? Number(car.mileage) : null;
}
export async function addCustomerMileage(env, customerId, cars) {
  const result = await env.AUTH_DB.prepare('SELECT car_key, mileage FROM customer_car_mileage WHERE customer_id = ?').bind(customerId).all();
  const saved = new Map((result.results || []).map(row => [row.car_key, row.mileage]));
  for (const car of cars) car.mileage = saved.has(mileageKey(car)) ? saved.get(mileageKey(car)) : recordedMileage(car);
}
export async function saveCustomerMileage(request, env, customerId, headers, loadCars) {
  const reply = (data, status = 200) => new Response(JSON.stringify(data), {status, headers});
  const body = await request.json().catch(() => null);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) return reply({success:false,error:'Підтвердьте номер телефону.'},403);
  if (!Number.isSafeInteger(body?.car_id) || body.car_id <= 0 || typeof body?.mileage !== 'number' || !valid(body.mileage)) {
    return reply({success:false,error:'Вкажіть цілий пробіг від 0 до 9 999 999 км.'},400);
  }
  const cars = await loadCars();
  const car = cars.find(item => Number(item.id) === body.car_id);
  if (!car) return reply({success:false,error:'Автомобіль не знайдено у вашому профілі.'},404);
  await env.AUTH_DB.prepare(`INSERT INTO customer_car_mileage(customer_id,car_key,mileage,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(customer_id,car_key) DO UPDATE SET mileage=excluded.mileage,updated_at=excluded.updated_at`)
    .bind(customerId, mileageKey(car), body.mileage, Math.floor(Date.now()/1000)).run();
  return reply({success:true,car_id:Number(car.id),mileage:body.mileage});
}
