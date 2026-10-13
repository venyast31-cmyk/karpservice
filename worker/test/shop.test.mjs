import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {handleShop,retailPrice,delivery,WAREHOUSES,productView,CATEGORIES,findCategory,shopDueDate} from '../src/shop.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.database, this.sql, values);
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.values) };
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }
}

class MemoryD1 {
  constructor() {
    this.database = new DatabaseSync(":memory:");
  }

  prepare(sql) {
    return new D1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}


test('prices, warehouse restriction and Kyiv delivery cutoffs',()=>{
 assert.equal(retailPrice('158.10'),20553);assert.equal(retailPrice('0'),null);assert.equal(retailPrice('-10'),null);
 for(const [index,before,after] of [[0,'11:59','12:00'],[1,'09:59','10:00'],[2,'14:29','14:30']]){
  assert.match(delivery(WAREHOUSES[index],new Date('2026-10-12T'+before+':00Z')),/сьогодні|завтра/);
  assert.match(delivery(WAREHOUSES[index],new Date('2026-10-12T'+after+':00Z')),/уточнить/);
 }
 assert.match(delivery(WAREHOUSES[2],new Date('2026-10-16T08:00:00Z')),/уточнить/);
 assert.match(delivery(WAREHOUSES[0],new Date('2026-10-17T08:00:00Z')),/уточнить/);
 assert.equal(productView({price:'10',currency_name:'EUR',in_stocks:[]},'x'),null);
 assert.equal(productView({price:'10',currency_name:'UAH',in_stocks:[{uuid:'foreign',quantity:'5'}]},'x'),null);
});
test('checkout verifies ownership, price, stock and creates at most one CRM order per key',async()=>{
 const db=new MemoryD1();
 for(const f of ['0001_auth.sql','0012_shop.sql','0013_shop_credentials.sql'])db.database.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const token='S'.repeat(43),now=Math.floor(Date.now()/1000);
 db.database.prepare('INSERT INTO sessions(token_hash,phone,customer_id,customer_name,telegram_user_id,created_at,expires_at,last_used_at) VALUES(?,?,?,?,?,?,?,?)').run(createHash('sha256').update('session:'+token).digest('hex'),'380671234567',123,'Test','777',now,now+3600,now);
 const env={AUTH_DB:db,SESSION_SECRET:'test-session-secret',BUSMARKET_API_TOKEN:'supplier-key',ROAPP_API_KEY:'crm-key',ROAPP_BRANCH_ID:'136446',SHOP_ORDER_TYPE_ID:'225857',SHOP_MANAGER_IDS:'257253,213733'};
 const id='A'.repeat(32),warehouse=WAREHOUSES[0].id;
 db.database.prepare('INSERT INTO shop_catalog VALUES(?,?,?)').run(id,'oil',Date.now());
 const original=globalThis.fetch;let calls=0,crmBody,fail=false;
 globalThis.fetch=async(input,init)=>{
  const u=new URL(String(input));assert.equal(init.redirect,'manual');
  if(u.hostname==='api.bm.parts')return Response.json({product:{name:'Oil',brand:'Test',article:'001',price:'100.00',currency_name:'ГРН',multiplicity:1,in_stocks:[{uuid:warehouse,quantity:'5'}]}});
  assert.equal(u.hostname,'api.roapp.io');assert.equal(init.method,'POST');calls++;crmBody=JSON.parse(init.body);if(fail)throw new Error('timeout');return Response.json({data:{id:987}});
 };
 const send=async(body,auth=true)=>handleShop(new Request('https://app.test/shop/checkout',{method:'POST',headers:auth?{Authorization:'Bearer '+token}:{},body:JSON.stringify(body)}),env,{}, {getCars:async()=>[{id:7,vin:'TESTVIN',brand:'BMW'}]});
 const body={key:crypto.randomUUID(),comment:'',items:[{id,warehouse,quantity:1,price:13000}],car_id:7,client_id:999};
 try{
  assert.equal((await send(body,false)).status,401);
  assert.equal((await send({...body,car_id:999})).status,403);
  assert.equal((await send({...body,items:[{...body.items[0],price:1}]})).status,409);
  assert.equal((await send({...body,items:[{...body.items[0],quantity:6}]})).status,409);
  const first=await(await send(body)).json();assert.equal(first.success,true);assert.equal(crmBody.client_id,123);assert.match(crmBody.due_date,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);assert.ok(Date.parse(crmBody.due_date)>Date.now());assert.match(crmBody.manager_notes,/TESTVIN/);
  const second=await(await send(body)).json();assert.equal(second.order.public_id,first.order.public_id);assert.equal(calls,1);
  // An uncertain CRM response stays durable and must not repeat the write.
  db.database.exec('DELETE FROM rate_limits');fail=true;const uncertain={...body,key:crypto.randomUUID()};
  assert.equal((await send(uncertain)).status,202);assert.equal((await send(uncertain)).status,202);assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});

test('photo subgroups restrict blades and never expose warehouse names to customers',async()=>{
 const db=new MemoryD1();
 for(const f of ['0001_auth.sql','0012_shop.sql','0013_shop_credentials.sql'])db.database.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const env={AUTH_DB:db,BUSMARKET_API_TOKEN:'supplier-key'};
 const request=path=>handleShop(new Request('https://app.test/shop/'+path),env,{});
 const catalog=await(await request('categories')).json();
 assert.equal(catalog.categories.length,4);
 assert.equal(catalog.categories[0].children.length,5);
 const walk=nodes=>{for(const n of nodes){assert.match(n.image,/^https:\/\/cdn\.bm\.parts\//);assert.equal(n.group,undefined);walk(n.children);}};
 walk(catalog.categories);
 const system=findCategory('wipers:Система склоочисника');
 assert.deepEqual(system.children.map(c=>c.name),['Щітки склоочисника']);
 assert.equal(findCategory('wipers:Система склоочисника/Важелі склоочисника'),null);
 let group;const original=globalThis.fetch;
 globalThis.fetch=async input=>{group=new URL(input).searchParams.get('group');return Response.json({products:{A:{uuid:'A'.repeat(32),name:'Щітка',price:'100',currency_name:'UAH',in_stocks:[{uuid:WAREHOUSES[0].id,quantity:'5'}]}},search:{total_pages:1}});};
 try{
  const leaf=system.children[0];
  const response=await(await request('products?category='+encodeURIComponent(leaf.id))).json();
  assert.equal(group,leaf.group);assert.equal(response.products.length,1);
  assert.equal(response.products[0].stocks[0].name,undefined);
  assert.ok(response.products[0].stocks[0].delivery);
  await request('products?category=wipers');assert.equal(group,leaf.group);
  assert.equal((await request('products?category='+encodeURIComponent('wipers:Система склоочисника/Важелі склоочисника'))).status,400);
 }finally{globalThis.fetch=original;}
});

test('CRM deadline uses whole-second ISO, Kyiv time and skips weekends across DST',()=>{
 assert.equal(shopDueDate(new Date('2026-10-12T21:45:00Z')),'2026-10-14T15:00:00Z');
 assert.equal(shopDueDate(new Date('2026-10-23T10:00:00Z')),'2026-10-26T16:00:00Z');
 assert.equal(shopDueDate(new Date('2026-03-27T10:00:00Z')),'2026-03-30T15:00:00Z');
});

test('detail isolates supplier data, merges photos and filters reach supplier on every page',async()=>{
 const db=new MemoryD1();
 for(const f of ['0001_auth.sql','0012_shop.sql','0013_shop_credentials.sql'])db.database.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const env={AUTH_DB:db,BUSMARKET_API_TOKEN:'supplier-key'},id='B'.repeat(32);
 db.database.prepare('INSERT INTO shop_catalog VALUES(?,?,?)').run(id,'oil',Date.now());
 const original=globalThis.fetch;let search;
 const raw={uuid:id,name:'Oil',brand:'MOTUL',article:'1',price:'100',currency_name:'UAH',default_image:'https://cdn.bm.parts/photos/one.jpg',images:['https://cdn.bm.parts/photos/two.jpg'],description:'<p>Опис</p>',details:{'В’язкість':'5W30',purchase_price:100},cars:[{brand:'BMW'}],oe:['123'],in_stocks:[{uuid:WAREHOUSES[0].id,quantity:'5',name:'PRIVATE'}],analogs:{C:{name:'Alternative',price:'50'}}};
 globalThis.fetch=async input=>{
  const u=new URL(input);
  if(u.pathname.endsWith('/images'))return Response.json({images:['https://cdn.bm.parts/photos/two.jpg','javascript:bad']});
  if(u.pathname.startsWith('/product/'))return Response.json({product:raw});
  if(u.pathname.endsWith('/filters'))return Response.json({filters:[{name:'В’язкість',values:[{value:'5W30',products_count:3}]}]});
  if(u.pathname.endsWith('/brands'))return Response.json({brands:[{name:'MOTUL',products_count:5}]});
  search=u;return Response.json({products:{[id]:raw},search:{total_pages:3}});
 };
 const request=path=>handleShop(new Request('https://app.test/shop/'+path),env,{});
 try{
  const p=(await(await request('product?id='+id)).json()).product;
  assert.equal(p.price,13000);assert.equal(p.images.length,2);assert.equal(p.details.purchase_price,undefined);assert.equal(p.stocks[0].name,undefined);assert.equal(p.analogs[0].price,undefined);assert.equal(p.description,raw.description);
  assert.equal((await request('product?id=bad')).status,400);
  assert.equal((await request('product?id='+'C'.repeat(32))).status,404);
  const leaf=findCategory('oil').children[0],params=new URLSearchParams({category:leaf.id,page:'2',gf:'В’язкість:5W30',promo:'1'});params.append('brands','MOTUL');params.append('brands','ROWЕ');
  await request('products?'+params);assert.deepEqual(search.searchParams.getAll('brands'),['MOTUL','ROWЕ']);assert.equal(search.searchParams.get('gf'),'В’язкість:5W30');assert.equal(search.searchParams.get('page'),'2');assert.equal(search.searchParams.get('promo'),'1');
  const f=await(await request('filters?category='+encodeURIComponent(leaf.id))).json();assert.equal(f.filters[0].values[0].value,'5W30');assert.equal(f.brands[0].name,'MOTUL');
  assert.equal((await request('products?category=oil&promo=invalid')).status,400);
  await request('products?'+new URLSearchParams({car:'BMW>3 (E90)',node:'ГАЛЬМІВНА СИСТЕМА',page:'2',brands:'ATE'}));assert.deepEqual(search.searchParams.getAll('cars'),['BMW>3 (E90)']);assert.equal(search.searchParams.get('nodes'),'ГАЛЬМІВНА СИСТЕМА');assert.equal(search.searchParams.get('group'),null);assert.equal(search.searchParams.get('page'),'2');assert.equal(search.searchParams.get('brands'),'ATE');
 }finally{globalThis.fetch=original;}
});
