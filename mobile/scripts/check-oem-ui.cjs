const {chromium}=require('playwright');
const fs=require('fs');const http=require('http');const path=require('path');
const root=path.resolve(__dirname,'../..');
(async()=>{
const {vehiclesView,nodesView,partsView,quickView}=await import(root+'/worker/src/shop-oem.js');
const f=n=>JSON.parse(fs.readFileSync(root+'/worker/test/fixtures/oem-'+n+'.json')).data;
const server=http.createServer((req,res)=>{const p=path.join(root,'mobile/dist',new URL(req.url,'http://localhost').pathname);try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':'image/jpeg');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**',route=>route.abort());
await page.route('https://vinalfa.com/images/oem?**',route=>route.continue());
await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
await page.evaluate(({resolve,groups,children,parts,quick})=>{
 window.apiFetch=async(path,options)=>{
  const u=new URL(path,'https://mock/');let d={};
  if(u.pathname==='/shop/oem/resolve')d=resolve;
  else if(u.pathname==='/shop/oem')d=u.searchParams.get('op')==='quick'?quick:u.searchParams.get('op')==='search'?{nodes:[{...children.nodes[0],matches:['Q0000000001']}]}:u.searchParams.get('op')==='parts'?parts:u.searchParams.get('op')==='children'?children:groups;
  else if(u.pathname==='/shop/vehicles')d={options:[]};
  else if(u.pathname==='/shop/categories')d={categories:[],configured:true};
  else if(u.pathname==='/shop/products')d={products:[],has_more:false};
  else if(u.pathname==='/shop/filters')d={brands:[],filters:[]};
  return new Response(JSON.stringify({success:true,...d}),{status:200});
 };show('shop');
},{resolve:vehiclesView(f('resolve')),groups:{nodes:nodesView(f('groups').data.sections)},children:{nodes:nodesView(f('children').data.units)},parts:{...partsView(f('parts')),parts:[...partsView(f('parts')).parts,{reference:'999',points:[],numbers:[{number:'OTHER123',name:'Unrelated part',quantity:'1',replacement:'',description:[]}]}]},quick:{nodes:quickView(f('quick').quick_taxonomy.tree)}});
await page.locator('#shopVin').fill('WDC1660231A178846');await page.locator('#shopVinSubmit').click();
await page.locator('#shopOem.active').waitFor();
await page.getByRole('button',{name:'Автоматична коробка передач',exact:true}).waitFor();
await page.locator('#oemQuickTab').click();
await page.getByRole('button',{name:'Деталі для ТО',exact:true}).waitFor();
if(await page.locator('.oem-node').first().evaluate(e=>e.getBoundingClientRect().height)>60)throw new Error('Category row too tall');
await page.locator('#appLoader').waitFor({state:'hidden'});
await page.screenshot({path:path.join(process.env.RUNNER_TEMP||'/tmp','karp-oem-groups.png'),fullPage:true});
await page.getByRole('button',{name:'Двигун',exact:true}).click();
await page.getByRole('button',{name:'Прокладки та ущільнення',exact:true}).click();
await page.getByRole('button',{name:'Прокладка головки циліндра',exact:true}).click();
await page.locator('.oem-result').first().waitFor();
await page.getByRole('button',{name:'Ціна та наявність Q0000000001',exact:true}).waitFor();
if(await page.getByRole('button',{name:'Ціна та наявність OTHER123',exact:true}).count())throw new Error('Unrelated part leaked into quick result');
await page.locator('.oem-result-image').first().click();
await page.locator('#oemFullscreen[open]').waitFor();
await page.locator('#oemFullList').click();
await page.getByRole('button',{name:'Ціна та наявність OTHER123',exact:true}).waitFor();
await page.locator('#oemBack').click();await page.locator('#oemBack').click();await page.locator('#oemCategoriesTab').click();

await page.getByRole('button',{name:'Двигун',exact:true}).click();await page.getByRole('button',{name:'642.826 OM642',exact:true}).click();await page.getByRole('button',{name:'Корпус двигуна',exact:true}).click();await page.getByRole('button',{name:'Двигун',exact:true}).click();
await page.getByRole('button',{name:'Ціна та наявність Q0000000001',exact:true}).waitFor();
await page.locator('#oemImage').evaluate(img=>img.complete&&img.naturalWidth?Promise.resolve():new Promise((resolve,reject)=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',()=>reject(new Error('Scheme image failed')),{once:true});}));
const hotspot=page.getByRole('button',{name:'Позиція 5',exact:true});
if((await hotspot.boundingBox()).width>44)throw new Error('Oversized diagram hotspot');
await page.locator('#oemExpand').click();
await page.locator('#oemFullscreen[open]').waitFor();
await page.locator('#oemFullPlus').click();
await hotspot.click();
if(await page.locator('#oemFullscreen').evaluate(e=>e.open))throw new Error('Diagram did not close after selecting a part');
await page.screenshot({path:path.join(process.env.RUNNER_TEMP||'/tmp','karp-oem-parts.png'),fullPage:true});
await page.getByRole('button',{name:'Ціна та наявність Q0000000001',exact:true}).click();
if(await page.locator('#shopSearch').inputValue()!=='Q0000000001')throw new Error('OE missing');
await page.locator('#shopProducts').getByRole('button',{name:'← Назад',exact:true}).click();
if(!await page.locator('#shopOem').evaluate(e=>e.classList.contains('active')))throw new Error('Back lost diagram');
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw new Error('Horizontal viewport overflow');
// Reproduce the user's radiator → expansion tank → full positions → BM products flow.
const {quickSearchWithFallback}=await import(root+'/worker/src/oem-search.js');
const {searchView}=await import(root+'/worker/src/shop-oem.js');
const results=searchView((await quickSearchWithFallback({quickSearch:async()=>({items:[]}),search:async()=>f('search-radiator')},'a'.repeat(32),'cooling-radiator',async()=>f('quick').quick_taxonomy.tree)).items);
await page.evaluate(({resolve,quick,results,radiator,expansion})=>{
 window.apiFetch=async(path)=>{const u=new URL(path,'https://mock/');let d={};
 if(u.pathname==='/shop/oem/resolve')d=resolve;
 else if(u.pathname==='/shop/oem')d=u.searchParams.get('op')==='quick'?quick:u.searchParams.get('op')==='search'?{nodes:results}:u.searchParams.get('section')===results[0].id?radiator:expansion;
 else if(u.pathname==='/shop/categories')d={categories:[],configured:true};
 else if(u.pathname==='/shop/products')d={products:[],has_more:false};
 else if(u.pathname==='/shop/filters')d={brands:[],filters:[]};
 return new Response(JSON.stringify({success:true,...d}));};show('shop');
},{resolve:vehiclesView(f('resolve')),quick:{nodes:quickView(f('quick').quick_taxonomy.tree)},results,radiator:JSON.parse(fs.readFileSync(root+'/worker/test/fixtures/oem-radiator-view.json')),expansion:JSON.parse(fs.readFileSync(root+'/worker/test/fixtures/oem-expansion-view.json'))});
await page.locator('#shopVin').fill('WDC1660231A178846');await page.locator('#shopVinSubmit').click();
await page.locator('#oemQuickTab').click();
await page.getByRole('button',{name:'Система охолодження',exact:true}).click();await page.getByRole('button',{name:'Радіатор',exact:true}).click();
await page.getByRole('button',{name:'Ціна та наявність A2205000903',exact:true}).waitFor();
if(await page.locator('.oem-result').count()!==2)throw new Error('Radiator schemes missing');
const expansionCard=page.locator('.oem-result').filter({has:page.getByRole('heading',{name:'Розширювальний бачок, кріплення та шланги',exact:true})});
await expansionCard.scrollIntoViewIfNeeded();
await expansionCard.getByRole('button',{name:'Ціна та наявність A2105010515',exact:true}).waitFor();
for(const img of await page.locator('.oem-result-image img').all()){
 await img.scrollIntoViewIfNeeded();
 await img.evaluate(e=>e.complete&&e.naturalWidth?Promise.resolve():new Promise((resolve,reject)=>{e.addEventListener('load',resolve,{once:true});e.addEventListener('error',()=>reject(new Error('Search scheme image failed')),{once:true});}));
}
await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
await page.screenshot({path:path.join(process.env.RUNNER_TEMP||'/tmp','karp-oem-radiator.png'),fullPage:true});
await expansionCard.locator('.oem-result-image').click();await page.locator('#oemFullscreen[open]').waitFor();
await page.locator('#oemFullList').click();
await page.getByRole('button',{name:'Ціна та наявність A2205000049',exact:true}).click();
if(await page.locator('#shopSearch').inputValue()!=='A2205000049')throw new Error('Expansion tank OE was lost');
await page.locator('#shopProducts').getByRole('button',{name:'← Назад',exact:true}).click();
// A new vehicle must not retain the previous scheme title on subscription denial.
await page.evaluate(()=>{
 window.apiFetch=async(path)=>new Response(JSON.stringify(path==='shop/oem/resolve'?{success:true,vehicles:[{id:'b'.repeat(32),brand:'Landrover',model:'Range Rover Sport',equipment:[]}]}:{success:false,code:'oem_catalog_unavailable',error:'Каталог не входить у підписку'}),{status:path==='shop/oem/resolve'?200:403});
 show('shop');
});
await page.locator('#shopVin').fill('WDC1660231A178846');await page.locator('#shopVinSubmit').click();
await page.locator('#oemStatus').filter({hasText:'Каталог не входить у підписку'}).waitFor();
if(await page.locator('#oemTitle').textContent()!=='Range Rover Sport')throw new Error('Stale vehicle heading');
if(await page.locator('#oemRetry').isVisible()||await page.locator('#oemSearch').isVisible()||await page.locator('#oemQuick').isVisible())throw new Error('Unavailable catalog offers futile requests');
// Recipient details survive quantity changes and uncertain checkout retries.
await page.evaluate(()=>localStorage.setItem('karpservice.shop.cart.v1',JSON.stringify({cart:[{id:'A'.repeat(32),name:'Тестовий товар',brand:'TEST',article:'1',price:13000,quantity:1,step:1,warehouse:'test',stocks:[{id:'test',quantity:5,delivery:'Доставка завтра'}]}]})));
await page.reload();await page.locator('#appLoader').waitFor({state:'hidden'});
await page.evaluate(()=>{
 customerData={phone_linked:true,customer:{id:123},cars:[]};window.checkoutRequests=[];
 window.apiFetch=async(path,options)=>{
  if(path==='shop/checkout'){window.checkoutRequests.push(JSON.parse(options.body));return new Response(JSON.stringify({success:false,order:{public_id:'test-order',status:'verification'},error:'Перевіряється'}),{status:202});}
  return new Response(JSON.stringify({success:true,categories:[],products:[],options:[]}));
 };Shop.openCart();
});
if(await page.locator('#shopShippingFields').isVisible())throw new Error('Pickup asks for delivery address');
await page.locator('#shopFulfillment').selectOption('nova_poshta');
for(const [field,value] of Object.entries({City:'Бориспіль',Branch:'Відділення № 1',Name:'Тестовий Одержувач',Phone:'0671234567'}))await page.locator('#shopShipping'+field).fill(value);
await page.locator('[data-delta="1"]').click();
if(await page.locator('#shopShippingCity').inputValue()!=='Бориспіль')throw new Error('Quantity change lost recipient');
await page.screenshot({path:path.join(process.env.RUNNER_TEMP||'/tmp','karp-oem-checkout.png'),fullPage:true});
await page.locator('#shopSubmit').click();
await page.getByRole('button',{name:'Перевірити замовлення',exact:true}).waitFor();
if(!await page.locator('#shopShippingCity').isDisabled())throw new Error('Pending order recipient is editable');
await page.locator('#shopSubmit').click();
await page.waitForFunction(()=>window.checkoutRequests.length===2);
const sent=await page.evaluate(()=>window.checkoutRequests);
if(sent[0].key!==sent[1].key||sent[0].fulfillment.city!=='Бориспіль'||sent[0].fulfillment.name!=='Тестовий Одержувач')throw new Error('Checkout lost recipient or changed retry key');
// New customer prompt appears only after verified-phone response.
await page.evaluate(()=>{
 customerData={phone_linked:false,customer:{id:0},cars:[]};show('phoneLink');showCodeStep('registration-test','+380 *** ** 67');
 window.apiFetch=async(path,options)=>{window.registrationRequest=JSON.parse(options.body);return new Response(JSON.stringify({success:false,stage:'registration',error:'Вкажіть ПІБ'}),{status:404});};
});
await page.locator('#otpCode').fill('123456');await page.locator('#verifyCodeBtn').click();
await page.locator('#registrationName').waitFor({state:'visible'});
await page.locator('#registrationName').fill('Новий Клієнт');await page.locator('#verifyCodeBtn').click();
const registered=await page.evaluate(()=>window.registrationRequest);
if(!registered.register||registered.registration_name!=='Новий Клієнт')throw new Error('Registration consent/name missing');
await page.screenshot({path:path.join(process.env.RUNNER_TEMP||'/tmp','karp-oem-registration.png'),fullPage:true});
if(errors.length)throw new Error(errors.join('; '));
console.log(JSON.stringify({flow:'VIN → exact vehicle → groups → diagram → OE search → back',overflow,errors}));
await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1);});
