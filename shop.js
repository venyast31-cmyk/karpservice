(() => {
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=c=>new Intl.NumberFormat('uk-UA',{style:'currency',currency:'UAH',maximumFractionDigits:2}).format(c/100);
  let fulfillment={method:'pickup'};
  let oeNode=null;
  let categories=[],products=[],category='',path=[],page=1,q='',version=0,cart=[],key='',locked=false,carId='',comment='';
  let filters={brands:[],gf:[],promo:false,new_product:false},filterOptions={brands:[],filters:[]},filterVersion=0;
  let detailProduct=null,detailVersion=0,detailOrigin='shopProducts',detailScroll=0;
  let vehicleNodes=[],vehicleCar='',vehicleVersion=0,vinVersion=0,vehicleBrandsLoaded=false;
  function vehicleParams(){const node=vehicleNodes.find(n=>n.id===category);return node&&vehicleCar?{car:vehicleCar,node:node.path}:{};}
  const vehicleStatus=text=>{$('shopVehicleStatus').textContent=text;};
  function options(select,rows,placeholder){select.innerHTML=`<option value="">${esc(placeholder)}</option>`+rows.map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('');select.disabled=!rows.length;}
  function clearVehicleResults(){vehicleNodes=[];vehicleCar='';$('shopVehicleResults').hidden=true;$('shopVehicleGroups').innerHTML='';}
  async function loadVehicleBrands(){
    if(vehicleBrandsLoaded)return;
    $('shopVehicleRetry').hidden=true;vehicleStatus('Завантажуємо марки…');
    try{const d=await request('shop/vehicles');options($('shopVehicleBrand'),d.options,'Оберіть марку');vehicleBrandsLoaded=d.options.length>0;vehicleStatus(d.options.length?'':'Марки тимчасово недоступні.');$('shopVehicleRetry').hidden=vehicleBrandsLoaded;}
    catch(e){vehicleStatus(e.message);$('shopVehicleRetry').hidden=false;}
  }
  // Match catalogue identities only; never guess a generation from a model badge.
  async function matchVehicleModel(identity,models,loadEngines){
    const normalize=s=>String(s||'').toUpperCase().replace(/[^A-ZА-ЯІЇЄ0-9]/g,'');
    const wanted=normalize(identity.model);
    if(!wanted)return [];
    const exact=models.filter(x=>normalize(x.name)===wanted);
    if(exact.length===1)return [exact[0].name];
    if(normalize(identity.brand)!=='MERCEDESBENZ')return [];
    const badge=String(identity.model).toUpperCase().match(/^([A-Z]{1,3})\s*\d{2,3}(?:\s|$)/);
    if(!badge)return [];
    const family=badge[1];
    const candidates=models.filter(x=>new RegExp('^'+family+'(?:-CLASS|\\s|\\()').test(x.name.toUpperCase()));
    if(!candidates.length||candidates.length>20)return [];
    const results=await Promise.allSettled(candidates.map(async x=>{
      const engines=await loadEngines(x.name);
      return engines.some(e=>normalize(e.name.split('(')[0].replace(/\d+\s*(?:л\.с\.|кВт|HP|KW).*$/i,''))===wanted)?x.name:'';
    }));
    // An unavailable generation must not turn an ambiguous match into a unique one.
    if(results.some(x=>x.status==='rejected'))return [];
    const matches=results.map(x=>x.value).filter(Boolean);
    return matches;
  }
  async function loadVehicleModels(identity=null){
    const current=++vehicleVersion,brand=$('shopVehicleBrand').value;
    clearVehicleResults();document.getElementById('shopModelMatches')?.remove();$('shopVehicleSubmit').disabled=true;options($('shopVehicleModel'),[],brand?'Завантажуємо моделі…':'Спочатку оберіть марку');$('shopVehicleRetry').hidden=true;
    if(!brand){vehicleStatus('');return;}
    vehicleStatus('Завантажуємо моделі…');
    try{const d=await request('shop/vehicles?'+new URLSearchParams({brand}));if(current!==vehicleVersion)return;options($('shopVehicleModel'),d.options,'Оберіть модель і покоління');vehicleStatus(d.options.length?'':'Для цієї марки немає моделей із доступними товарами.');
      if(identity?.model){
        vehicleStatus('Зіставляємо модель із каталогом…');
        const match=await matchVehicleModel(identity,d.options,async model=>{const result=await request('shop/vehicles?'+new URLSearchParams({brand,model}));return result.options;});
        if(current!==vehicleVersion||identity.searchVersion!==vinVersion)return;
        if(match.length===1){$('shopVehicleModel').value=match[0];$('shopVehicleSubmit').disabled=false;vehicleStatus('Модель знайдено: '+match[0]+'. Перевірте вибір і відкрийте групи запчастин.');}
        else if(match.length>1){
          vehicleStatus('Для '+identity.model+' BM повернув кілька поколінь. Оберіть своє:');
          const choices=document.createElement('div');choices.id='shopModelMatches';choices.className='shop-model-matches';
          for(const name of match){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=name;button.addEventListener('click',()=>{$('shopVehicleModel').value=name;$('shopVehicleModel').dispatchEvent(new Event('change'));choices.remove();});choices.append(button);}
          $('shopVehicleStatus').after(choices);
        }
        else vehicleStatus('BM визначив '+identity.model+', але точне покоління не підтверджено. Оберіть його зі списку.');
      }}
    catch(e){if(current===vehicleVersion){vehicleStatus(e.message);$('shopVehicleRetry').hidden=false;}}
  }
  async function findVin(e){return window.Oem.find(e);}
  async function loadVehicleGroups(e){
    e.preventDefault();const brand=$('shopVehicleBrand').value,model=$('shopVehicleModel').value;if(!brand||!model)return;
    const current=++vehicleVersion,car=brand+'>'+model;clearVehicleResults();$('shopVehicleSubmit').disabled=true;vehicleStatus('Завантажуємо групи запчастин…');
    try{const d=await request('shop/vehicle-groups?'+new URLSearchParams({car}));if(current!==vehicleVersion)return;vehicleCar=car;vehicleNodes=d.groups;
      $('shopVehicleTitle').textContent=brand+' '+model;$('shopVehicleResults').hidden=false;
      $('shopVehicleGroups').innerHTML=vehicleNodes.map(c=>`<button type="button" class="shop-vehicle-group" data-category="${esc(c.id)}">${esc(c.name)}</button>`).join('');
      vehicleStatus(d.groups.length?'':'Запчастин для цієї моделі зараз не знайдено.');
      if(d.groups.length)$('shopVehicleResults').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){if(current===vehicleVersion)vehicleStatus(e.message);}
    finally{if(current===vehicleVersion)$('shopVehicleSubmit').disabled=false;}
  }
  function filterParams(){const params=new URLSearchParams({category,page:String(page),q,...vehicleParams()});for(const k of ['brands','gf'])for(const v of filters[k])params.append(k,v);for(const k of ['promo','new_product'])if(filters[k])params.set(k,'1');return params;}
  function filterBadge(){const n=filters.brands.length+filters.gf.length+Number(filters.promo)+Number(filters.new_product);$('shopFilterSummary').textContent=n?`Фільтри · ${n}`:'Фільтри';}
  async function loadFilters(){
    const current=++filterVersion;filterOptions={brands:[],filters:[]};$('shopFilterFields').textContent='Завантажуємо фільтри…';
    try{const d=await request('shop/filters?'+new URLSearchParams({category,q,...vehicleParams()}));if(current!==filterVersion)return;filterOptions=d;renderFilters();$('shopFilterStatus').textContent=d.partial?'Частина фільтрів тимчасово недоступна.':'';}
    catch(e){if(current===filterVersion){$('shopFilterFields').textContent='';$('shopFilterStatus').textContent=e.message;}}
  }
  function renderFilters(){
    const options=(name,values,selected)=>values.map(v=>`<label class="shop-filter-option"><input type="checkbox" name="${name}" value="${esc(v.value)}" ${selected.includes(v.value)?'checked':''}><span>${esc(v.label)}</span></label>`).join('');
    $('shopFilterFields').innerHTML=(filterOptions.brands.length?`<fieldset><legend>Бренд</legend><div class="shop-filter-values">${options('brands',filterOptions.brands.map(b=>({value:b.name,label:b.name})),filters.brands)}</div></fieldset>`:'')+filterOptions.filters.map(f=>`<fieldset><legend>${esc(f.name)}</legend><div class="shop-filter-values">${options('gf',f.values.map(v=>({value:f.name+':'+v.value,label:v.value})),filters.gf)}</div></fieldset>`).join('');
  }
  function plainDescription(value){const doc=new DOMParser().parseFromString(String(value||''),'text/html');doc.querySelectorAll('script,style,iframe,object').forEach(n=>n.remove());doc.querySelectorAll('br,p,div,li').forEach(n=>n.append('\n'));return esc(doc.body.textContent.trim());}
  function infoValue(value){
    if(value==null)return '';
    if(typeof value==='boolean')return value?'Так':'Ні';
    if(Array.isArray(value))return value.map(infoValue).filter(Boolean).map(v=>`<li>${v}</li>`).join('')?`<ul>${value.map(infoValue).filter(Boolean).map(v=>`<li>${v}</li>`).join('')}</ul>`:'';
    if(typeof value==='object')return `<dl>${Object.entries(value).filter(([,v])=>v!==null&&v!=='').map(([k,v])=>`<div><dt>${esc(({name:'Назва',value:'Значення',brand:'Бренд',article:'Артикул',model:'Модель',year:'Рік',engine:'Двигун',number:'Номер',quantity:'Кількість',description:'Опис',url:'Посилання',uuid:'Код',type:'Тип',is_oem:'Оригінальний номер'})[k]||k)}</dt><dd>${infoValue(v)}</dd></div>`).join('')}</dl>`;
    if(typeof value==='string'&&/^https:\/\//i.test(value)){try{const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password)return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">Відкрити матеріал ↗</a>`;}catch{}}
    return esc(value);
  }
  function detailSection(title,value){return value&&(!(Array.isArray(value))||value.length)&&(!(typeof value==='object')||Object.keys(value).length)?`<details class="shop-info"><summary>${esc(title)}</summary>${infoValue(value)}</details>`:'';}
  function renderDetail(p){
    const images=p.images?.length?p.images:p.image?[p.image]:[],stock=preferredStock(p);
    $('shopDetailContent').innerHTML=`<div class="shop-gallery">${images.length?`<img id="shopDetailImage" src="${esc(images[0])}" alt="${esc(p.name)}" referrerpolicy="no-referrer">`:'<span class="shop-image-placeholder">Фото відсутнє</span>'}</div>${images.length>1?`<div class="shop-thumbnails">${images.map((src,i)=>`<button type="button" data-photo="${i}" aria-label="Фото ${i+1}" aria-pressed="${i===0}">${image(src,`Фото ${i+1}`)}</button>`).join('')}</div>`:''}<div class="shop-brand">${esc(p.brand)} · ${esc(p.article)}</div><h1 class="shop-detail-title">${esc(p.name)}</h1><strong class="shop-price">${p.price?money(p.price):'Ціну уточнить менеджер'}</strong><p class="shop-delivery">${stock?esc(stock.delivery):'Тимчасово немає в наявності'}</p><button id="shopDetailAdd" type="button" class="primary" ${stock?'':'disabled'}>У кошик${p.step>1?' · '+p.step+' шт.':''}</button><h2>Опис</h2><div class="shop-description">${p.description?plainDescription(p.description):'Опис для цього товару поки не надано.'}</div>${detailSection('Характеристики',p.details)}${detailSection('Застосування до авто',p.cars)}${detailSection('Оригінальні номери (OE)',p.oe)}${detailSection('Штрихкоди',p.barcodes)}${detailSection('Вага, кг',p.weight)}${detailSection('Склад комплекту',p.components_of_kit)}${detailSection('Документи та матеріали',p.files)}${detailSection('Аналоги',p.analogs)}${detailSection('Парні товари',p.paired_products)}${detailSection('З цим товаром купують',p.buy_with)}`;
  }
  async function product(index,source=products,origin='shopProducts'){
    const p=source[index];if(!p)return;detailOrigin=origin;detailScroll=window.scrollY;detailProduct=p;show('shopProduct');renderDetail(p);await refreshDetail();
  }
  async function refreshDetail(){
    const current=++detailVersion,id=detailProduct.id;$('shopDetailStatus').textContent='Завантажуємо повну інформацію…';$('shopDetailRetry').hidden=true;$('shopDetailAdd').disabled=true;
    try{const d=await request('shop/product?'+new URLSearchParams({id}));if(current!==detailVersion)return;detailProduct=d.product;renderDetail(detailProduct);$('shopDetailStatus').textContent=d.images_incomplete?'Не всі фото вдалося завантажити.':'';$('shopDetailRetry').hidden=!d.images_incomplete;}
    catch(e){if(current===detailVersion){$('shopDetailStatus').textContent=e.message;$('shopDetailRetry').hidden=false;}}
  }
  function detailBack(){detailVersion++;show(detailOrigin);window.scrollTo({top:detailScroll,behavior:'instant'});}
  const storageKey='karpservice.shop.cart.v1';
  try {const d=JSON.parse(localStorage.getItem(storageKey)||'{}');if(Array.isArray(d.cart)&&d.cart.length<=20){cart=d.cart.filter(p=>p&&typeof p.id==='string'&&Array.isArray(p.stocks)&&Number.isInteger(p.quantity)&&p.quantity>0&&p.quantity<=99&&Number.isInteger(p.price)&&p.price>0&&Number.isInteger(p.step)&&p.step>0);key=typeof d.key==='string'?d.key:'';locked=d.locked===true;fulfillment=d.fulfillment||{method:'pickup'};carId=d.carId||'';comment=d.comment||'';}}catch{}
  const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify({cart,key,locked,fulfillment,carId,comment}));}catch{}badge();};
  function badge(){
    const count=cart.reduce((n,p)=>n+p.quantity,0);
    const badge=$('headerCartCount');
    if(badge){badge.textContent=String(count);badge.hidden=count===0;}
    if($('headerCart'))$('headerCart').setAttribute('aria-label',count?`Відкрити кошик, товарів: ${count}`:'Відкрити порожній кошик');
  }
  async function request(path,options){const r=await apiFetch(path,options);const d=await r.json();if(!r.ok)throw new Error(d.error||'Не вдалося завантажити магазин.');return d;}
  function status(text){$('shopStatus').textContent=text;}
  function image(src,alt=''){return src?`<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">`:'<span class="shop-image-placeholder" aria-hidden="true">KARP</span>';}
  function shippingForm(){const np=$('shopFulfillment').value==='nova_poshta';$('shopShippingFields').hidden=!np;$('shopShippingFields').disabled=!np||locked;$('shopPickupAddress').hidden=np;$('shopFulfillment').disabled=locked;}
  function preserveForm(){if(!locked){fulfillment={method:$('shopFulfillment').value,...Object.fromEntries(['City','Branch','Name','Phone'].map(k=>[k.toLowerCase(),$('shopShipping'+k).value]))};}if($('shopCar'))carId=$('shopCar').value;if($('shopComment'))comment=$('shopComment').value;}
  const findCategory=(id,nodes=[...categories,...vehicleNodes,...(oeNode?[oeNode]:[])])=>{for(const node of nodes){if(node.id===id)return node;const found=findCategory(id,node.children||[]);if(found)return found;}return null;};
  function categoryCards(nodes){return nodes.map(c=>`<button class="shop-category" type="button" data-category="${esc(c.id)}"><span class="shop-category-image">${image(c.image,c.name)}</span><strong>${esc(c.name)}</strong></button>`).join('');}
  async function open(){version++;path=[];show('shop');badge();loadVehicleBrands();if(!categories.length){status('Завантажуємо каталог…');try{const d=await request('shop/categories');categories=d.categories;renderCategories();status(d.configured===false?'Каталог тимчасово недоступний. Спробуйте пізніше.':'');}catch(e){status(e.message);}}}
  function renderCategories(){$('shopCategories').innerHTML=categoryCards(categories);}
  function choose(id){
    const node=findCategory(id);if(!node)return;
    version++;filterVersion++;category=id;q='';filters={brands:[],gf:[],promo:false,new_product:false};filterBadge();$('shopFilters').open=false;$('shopPromo').checked=false;$('shopNew').checked=false;$('shopSearch').value='';
    if(path.at(-1)!==id)path.push(id);
    show('shopProducts');$('shopCategoryTitle').textContent=node.name;$('shopVehicleScope').hidden=!vehicleParams().car;$('shopVehicleScope').textContent=vehicleParams().car?vehicleCar.replace('>',' · ')+' — підбір за моделлю. Комплектацію перевірить менеджер.':'';
    const children=node.children||[];
    $('shopSubcategories').innerHTML=categoryCards(children);
    $('shopSubcategories').hidden=!children.length;
    $('shopSearchForm').hidden=Boolean(children.length);$('shopFilters').hidden=Boolean(children.length);
    $('shopProductList').innerHTML='';$('shopProductStatus').textContent='';$('shopMore').hidden=true;
    if(!children.length&&id!=='oe'){loadFilters();return browse(id);}
  }
  function openOe(article){
    oeNode={id:'oe',name:'Деталі за OE '+article,children:[]};
    choose('oe');q=article;$('shopSearch').value=article;loadFilters();browse('oe');
  }
  function back(){if(category==='oe'){version++;window.Oem.resume();return;}version++;path.pop();const id=path.at(-1);if(id)choose(id);else open();}
  function preferredStock(p,quantity=p.step){
    const rank=s=>s.delivery==='Доставка сьогодні'?0:s.delivery==='Доставка завтра'?1:2;
    return [...p.stocks].filter(s=>s.quantity>=quantity).sort((a,b)=>rank(a)-rank(b)||b.quantity-a.quantity)[0];
  }
  async function browse(id,more=false){
    const node=findCategory(id);if(!node)return;
    category=id;show('shopProducts');$('shopCategoryTitle').textContent=node.name;$('shopVehicleScope').hidden=!vehicleParams().car;$('shopVehicleScope').textContent=vehicleParams().car?vehicleCar.replace('>',' · ')+' — підбір за моделлю. Комплектацію перевірить менеджер.':'';
    if(!more){page=1;products=[];$('shopProductList').innerHTML='';}
    const current=++version;$('shopProductStatus').textContent='Перевіряємо ціни й наявність…';$('shopMore').hidden=true;
    try{
      const d=await request('shop/products?'+filterParams());if(current!==version)return;
      products=more?[...products,...d.products]:d.products;
      $('shopProductList').innerHTML=products.map((p,i)=>{const stock=preferredStock(p);return `<article class="shop-product" data-product="${i}"><button type="button" class="shop-product-photo shop-product-open" data-product="${i}" aria-label="${esc(p.name)}">${image(p.image,p.name)}</button><div class="shop-product-body"><div class="shop-brand">${esc(p.brand)} · ${esc(p.article)}</div><h2>${esc(p.name)}</h2><strong class="shop-price">${money(p.price)}</strong><p class="small">${stock?'В наявності':'Немає потрібної кількості'}</p><p class="shop-delivery">${esc(stock?.delivery||'')}</p><button class="primary" type="button" data-add="${i}" ${stock?'':'disabled'}>У кошик${p.step>1?' · '+p.step+' шт.':''}</button></div></article>`;}).join('');
      $('shopProductStatus').textContent=products.length?'Наявність уточнюємо під час оформлення.':'Товарів у наявності не знайдено.';
      $('shopMore').hidden=!d.has_more;
    }catch(e){if(current===version){$('shopProductStatus').textContent=e.message;if(more){page--;$('shopMore').hidden=false;}}}
  }
  function add(index,source=products,button=null){
    if(locked){alert('Спочатку перевірте статус попереднього замовлення в кошику.');return;}
    const p=source[index];if(!p)return;const old=cart.find(x=>x.id===p.id),quantity=(old?.quantity||0)+p.step,stock=preferredStock(p,quantity);
    if(!stock||quantity>99){alert('Недостатньо товару для цієї кількості.');return;}
    if(old){old.quantity=quantity;old.price=p.price;old.stocks=p.stocks;old.warehouse=stock.id;}else{if(cart.length>=20){alert('У кошику може бути до 20 позицій.');return;}cart.push({...p,warehouse:stock.id,quantity:p.step});}
    $('shopReceipt').hidden=true;
    key='';save();const b=button||document.querySelector(`[data-add="${index}"]`);if(b){b.textContent='Додано ✓';setTimeout(()=>{if(b.isConnected)b.textContent='У кошик';},1200);}
  }
  function openCart(){show('shopCart');renderCart();}
  function renderCart(){
    $('shopCartList').innerHTML=cart.length?cart.map((p,i)=>`<article class="card shop-cart-item"><div class="shop-brand">${esc(p.brand)} · ${esc(p.article)}</div><h2>${esc(p.name)}</h2><p class="small">${esc(p.stocks.find(s=>s.id===p.warehouse)?.delivery||'')}<br>${money(p.price)} / шт.</p><div class="shop-quantity"><button type="button" class="secondary" data-qty="${i}" data-delta="-1" aria-label="Зменшити кількість" ${locked?'disabled':''}>−</button><strong>${p.quantity}</strong><button type="button" class="secondary" data-qty="${i}" data-delta="1" aria-label="Збільшити кількість" ${locked?'disabled':''}>+</button><b>${money(p.price*p.quantity)}</b><button type="button" class="shop-remove" data-remove="${i}" aria-label="Видалити товар" ${locked?'disabled':''}>×</button></div></article>`).join(''):'<div class="card empty">Кошик порожній. Оберіть товари в каталозі.</div>';
    $('shopCheckoutForm').hidden=!cart.length;
    $('shopTotal').textContent=money(cart.reduce((n,p)=>n+p.price*p.quantity,0));
    $('shopCar').innerHTML='<option value="">Без прив’язки до авто</option>'+((typeof customerData!=='undefined'&&customerData?.cars)||[]).map(c=>`<option value="${Number(c.id)}">${esc([c.brand,c.model].filter(Boolean).join(' '))} · ${esc(c.vin||'')}</option>`).join('');
    $('shopCar').value=carId;$('shopComment').value=comment;$('shopCar').disabled=locked;$('shopComment').disabled=locked;
    $('shopFulfillment').value=fulfillment.method;for(const k of ['City','Branch','Name','Phone'])$('shopShipping'+k).value=fulfillment[k.toLowerCase()]||'';shippingForm();
    $('shopSubmit').textContent=locked?'Перевірити замовлення':'Замовити';
    $('shopCheckoutStatus').textContent=locked?'Замовлення передається або потребує перевірки. Повторне натискання перевірить ту саму заявку.':'';
    badge();
  }
  function change(index,delta){if(locked)return;preserveForm();const p=cart[index],quantity=p.quantity+delta*p.step;if(quantity<=0)cart.splice(index,1);else{const stock=preferredStock(p,quantity);if(!stock||quantity>99){alert('Недостатньо товару для цієї кількості.');return;}p.quantity=quantity;p.warehouse=stock.id;}key='';save();renderCart();}
  async function submit(event){
    event.preventDefault();
    if(!customerData){show('login');return;}
    if(customerData.phone_linked===false){show('profile');return;}
    if(!cart.length)return;
    preserveForm();key=key||crypto.randomUUID();locked=true;save();shippingForm();
    const current=version,button=$('shopSubmit');button.disabled=true;$('shopCheckoutStatus').textContent='Перевіряємо товари та передаємо замовлення…';
    try {
      const r=await apiFetch('shop/checkout',{method:'POST',body:JSON.stringify({key,items:cart.map(p=>({id:p.id,warehouse:p.warehouse,price:p.price,quantity:p.quantity})),car_id:Number(carId)||null,comment,fulfillment})});
      const d=await r.json();if(current!==version)return;
      if(d.success){const demo=d.demo||d.review_account;cart=[];key='';locked=false;save();renderCart();$('shopCheckoutStatus').textContent='';$('shopReceipt').hidden=false;$('shopReceiptText').textContent=demo ? 'Це демонстраційне замовлення. До CRM воно не передавалося.' : `Замовлення прийнято. Менеджер уточнить наявність і зв’яжеться з вами. Номер заявки: ${d.order.public_id}`;return;}
      if([400,403,409,429,503].includes(r.status)&&!d.order){locked=false;key='';save();renderCart();}
      $('shopCheckoutStatus').textContent=(d.error||'Не вдалося підтвердити замовлення.')+(d.order?.public_id?` Номер заявки: ${d.order.public_id}`:'');
    }catch(e){$('shopCheckoutStatus').textContent='Не вдалося перевірити відповідь сервера. Натисніть «Перевірити замовлення» — нову заявку створено не буде.';}
    finally{button.disabled=false;button.textContent=locked?'Перевірити замовлення':'Замовити';}
  }
  async function orders(){show('shopOrders');$('shopOrdersList').textContent='Завантаження…';try{const d=await request('shop/orders');$('shopOrdersList').innerHTML=d.orders.length?d.orders.map(o=>`<article class="card"><strong>${o.status==='sent'?'Передано менеджеру':'Потребує перевірки менеджером'}</strong><p class="small">${esc(new Date(o.created_at).toLocaleString('uk-UA'))}<br>№ ${esc(o.public_id)}</p><b>${money(o.total_cents)}</b></article>`).join(''):'<div class="card empty">Замовлень поки немає.</div>';}catch(e){$('shopOrdersList').textContent=e.message;}}
  function reset(){version++;cart=[];key='';locked=false;carId='';comment='';fulfillment={method:'pickup'};save();if($('shopOrdersList'))$('shopOrdersList').innerHTML='';if($('shopReceipt'))$('shopReceipt').hidden=true;}
  let featured=[],featuredLoading=false,featuredLoaded=false;
  async function loadFeatured(){
    if(featuredLoading||featuredLoaded)return;
    featuredLoading=true;$('homeProductsRetry').hidden=true;$('homeProductsStatus').textContent='Завантажуємо товари…';
    try{
      if(!categories.length){const d=await request('shop/categories');categories=d.categories;renderCategories();}
      const nodes=[];const walk=list=>{for(const c of list){nodes.push(c);walk(c.children||[]);}};walk(categories);
      const groups=['Оливи моторні для легкового транспорту','Антифризи','Засоби по догляду за авто'].map(name=>nodes.find(c=>c.name===name)).filter(Boolean);
      const results=await Promise.allSettled(groups.map(c=>request('shop/products?'+new URLSearchParams({category:c.id,page:'1'}))));
      const pools=results.map(r=>r.status==='fulfilled'?(r.value.products||[]).filter(p=>preferredStock(p)):[]);
      featured=[];const seen=new Set();
      for(let i=0;featured.length<20&&pools.some(p=>i<p.length);i++)for(const pool of pools){const p=pool[i];if(p&&!seen.has(p.id)&&featured.length<20){seen.add(p.id);featured.push(p);}}
      $('homeProducts').innerHTML=featured.map((p,i)=>`<article class="shop-product" data-featured-product="${i}"><button type="button" class="shop-product-photo shop-product-open" data-featured-product="${i}" aria-label="${esc(p.name)}">${image(p.image,p.name)}</button><div class="shop-product-body"><div class="shop-brand">${esc(p.brand)}</div><h2>${esc(p.name)}</h2><strong class="shop-price">${money(p.price)}</strong><button class="primary" type="button" data-featured-add="${i}">У кошик</button></div></article>`).join('');
      const partial=results.some(r=>r.status==='rejected');
      featuredLoaded=featured.length>0&&!partial;
      $('homeProductsStatus').textContent=partial?'Частину товарів не вдалося завантажити.':featured.length?'':'Товари тимчасово недоступні.';
      $('homeProductsRetry').hidden=featuredLoaded;
    }catch(e){$('homeProductsStatus').textContent='Не вдалося завантажити товари.';$('homeProductsRetry').hidden=false;}
    finally{featuredLoading=false;}
  }
  window.Shop={oe:openOe,detailBack,open,browse:choose,back,openCart,orders,reset,loadFeatured};
  document.addEventListener('DOMContentLoaded',()=>{
    badge();
    $('shopVinForm').addEventListener('submit',findVin);
    $('shopVin').addEventListener('input',()=>{window.Oem?.invalidate();vinVersion++;$('shopVinSubmit').disabled=false;$('shopVinStatus').textContent='';});
    $('shopVehicleForm').addEventListener('submit',loadVehicleGroups);
    $('shopVehicleBrand').addEventListener('change',loadVehicleModels);
    $('shopVehicleModel').addEventListener('change',()=>{vehicleVersion++;clearVehicleResults();vehicleStatus('');$('shopVehicleSubmit').disabled=!$('shopVehicleModel').value;});
    $('shopVehicleRetry').addEventListener('click',()=>vehicleBrandsLoaded?loadVehicleModels():loadVehicleBrands());
    $('shopVehicleClear').addEventListener('click',()=>{vehicleVersion++;vinVersion++;$('shopVinSubmit').disabled=false;$('shopVin').value='';$('shopVinStatus').textContent='';$('shopVehicleBrand').value='';loadVehicleModels();});
    loadFeatured();
    $('homeProducts').addEventListener('click',e=>{const b=e.target.closest('[data-featured-add]');if(b){add(Number(b.dataset.featuredAdd),featured,b);return;}const card=e.target.closest('[data-featured-product]');if(card)product(Number(card.dataset.featuredProduct),featured,'home');});
    for(const id of ['shopCategories','shopSubcategories','shopVehicleGroups'])$(id).addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b)choose(b.dataset.category);});
    $('shopSearchForm').addEventListener('submit',e=>{e.preventDefault();q=$('shopSearch').value.trim();loadFilters();browse(category);});
    $('shopMore').addEventListener('click',()=>{page++;browse(category,true);});
    $('shopProductList').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(b){add(Number(b.dataset.add));return;}const card=e.target.closest('[data-product]');if(card)product(Number(card.dataset.product));});
    $('shopFulfillment').addEventListener('change',()=>{preserveForm();shippingForm();save();});
    $('shopCheckoutForm').addEventListener('input',()=>{if(!locked){preserveForm();key='';save();}});
    $('shopCartList').addEventListener('click',e=>{const b=e.target.closest('[data-qty]'),r=e.target.closest('[data-remove]');if(b)change(Number(b.dataset.qty),Number(b.dataset.delta));if(r&&!locked){preserveForm();cart.splice(Number(r.dataset.remove),1);key='';save();renderCart();}});
    $('shopDetailContent').addEventListener('click',e=>{if(e.target.closest('#shopDetailAdd'))add(0,[detailProduct],$('shopDetailAdd'));const b=e.target.closest('[data-photo]');if(b){$('shopDetailImage').src=detailProduct.images[Number(b.dataset.photo)];document.querySelectorAll('[data-photo]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}});
    $('shopDetailBack').addEventListener('click',detailBack);$('shopDetailRetry').addEventListener('click',refreshDetail);
    $('shopFilterForm').addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.target);filters={brands:data.getAll('brands'),gf:data.getAll('gf'),promo:$('shopPromo').checked,new_product:$('shopNew').checked};filterBadge();$('shopFilters').open=false;browse(category);});
    $('shopFilterReset').addEventListener('click',()=>{filters={brands:[],gf:[],promo:false,new_product:false};$('shopPromo').checked=false;$('shopNew').checked=false;renderFilters();filterBadge();browse(category);});
    $('shopFilterRetry').addEventListener('click',loadFilters);
    $('shopCheckoutForm').addEventListener('submit',submit);
  });
})();
