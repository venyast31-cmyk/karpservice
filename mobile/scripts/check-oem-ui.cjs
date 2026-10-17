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
await page.getByRole('button',{name:'Деталі для ТО',exact:true}).waitFor();
if(await page.locator('.oem-node').first().evaluate(e=>e.getBoundingClientRect().height)>60)throw new Error('Category row too tall');
await page.screenshot({path:path.join(process.env.RUNNER_TEMP||'/tmp','karp-oem-groups.png'),fullPage:true});
await page.getByRole('button',{name:'Двигун',exact:true}).click();
await page.getByRole('button',{name:'Прокладки та ущільнення',exact:true}).click();
await page.getByRole('button',{name:'Прокладка головки циліндра',exact:true}).click();
await page.locator('.oem-node').first().click();
await page.getByRole('button',{name:'Ціна та наявність Q0000000001',exact:true}).waitFor();
if(await page.getByRole('button',{name:'Ціна та наявність OTHER123',exact:true}).count())throw new Error('Unrelated part leaked into quick result');
await page.getByRole('button',{name:'Усі деталі вузла',exact:true}).click();
await page.getByRole('button',{name:'Ціна та наявність OTHER123',exact:true}).waitFor();
await page.locator('#oemBack').click();await page.locator('#oemCategoriesTab').click();

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
// A new vehicle must not retain the previous scheme title on subscription denial.
await page.evaluate(()=>{
 window.apiFetch=async(path)=>new Response(JSON.stringify(path==='shop/oem/resolve'?{success:true,vehicles:[{id:'b'.repeat(32),brand:'Landrover',model:'Range Rover Sport',equipment:[]}]}:{success:false,code:'oem_catalog_unavailable',error:'Каталог не входить у підписку'}),{status:path==='shop/oem/resolve'?200:403});
 show('shop');
});
await page.locator('#shopVin').fill('WDC1660231A178846');await page.locator('#shopVinSubmit').click();
await page.locator('#oemStatus').filter({hasText:'Каталог не входить у підписку'}).waitFor();
if(await page.locator('#oemTitle').textContent()!=='Range Rover Sport')throw new Error('Stale vehicle heading');
if(await page.locator('#oemRetry').isVisible()||await page.locator('#oemSearch').isVisible()||await page.locator('#oemQuick').isVisible())throw new Error('Unavailable catalog offers futile requests');
console.log(JSON.stringify({flow:'VIN → exact vehicle → groups → diagram → OE search → back',overflow,errors}));
await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1);});
