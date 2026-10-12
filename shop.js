(() => {
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=c=>new Intl.NumberFormat('uk-UA',{style:'currency',currency:'UAH',maximumFractionDigits:2}).format(c/100);
  let categories=[],products=[],category='',path=[],page=1,q='',version=0,cart=[],key='',locked=false,carId='',comment='';
  const storageKey='karpservice.shop.cart.v1';
  try {const d=JSON.parse(localStorage.getItem(storageKey)||'{}');if(Array.isArray(d.cart)&&d.cart.length<=20){cart=d.cart.filter(p=>p&&typeof p.id==='string'&&Array.isArray(p.stocks)&&Number.isInteger(p.quantity)&&p.quantity>0&&p.quantity<=99&&Number.isInteger(p.price)&&p.price>0&&Number.isInteger(p.step)&&p.step>0);key=typeof d.key==='string'?d.key:'';locked=d.locked===true;}}catch{}
  const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify({cart,key,locked}));}catch{}badge();};
  function badge(){const count=cart.reduce((n,p)=>n+p.quantity,0);if($('shopCartCount'))$('shopCartCount').textContent=count?`Кошик · ${count}`:'Кошик';}
  async function request(path,options){const r=await apiFetch(path,options);const d=await r.json();if(!r.ok)throw new Error(d.error||'Не вдалося завантажити магазин.');return d;}
  function status(text){$('shopStatus').textContent=text;}
  function image(src,alt=''){return src?`<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">`:'<span class="shop-image-placeholder" aria-hidden="true">KARP</span>';}
  function preserveForm(){if($('shopCar'))carId=$('shopCar').value;if($('shopComment'))comment=$('shopComment').value;}
  const findCategory=(id,nodes=categories)=>{for(const node of nodes){if(node.id===id)return node;const found=findCategory(id,node.children||[]);if(found)return found;}return null;};
  function categoryCards(nodes){return nodes.map(c=>`<button class="shop-category" type="button" data-category="${esc(c.id)}"><span class="shop-category-image">${image(c.image,c.name)}</span><strong>${esc(c.name)}</strong><span class="shop-category-arrow" aria-hidden="true">↗</span></button>`).join('');}
  async function open(){version++;path=[];show('shop');badge();if(!categories.length){status('Завантажуємо каталог…');try{const d=await request('shop/categories');categories=d.categories;renderCategories();status(d.configured===false?'Каталог тимчасово недоступний. Спробуйте пізніше.':'');}catch(e){status(e.message);}}}
  function renderCategories(){$('shopCategories').innerHTML=categoryCards(categories);}
  function choose(id){
    const node=findCategory(id);if(!node)return;
    version++;category=id;q='';$('shopSearch').value='';
    if(path.at(-1)!==id)path.push(id);
    show('shopProducts');$('shopCategoryTitle').textContent=node.name;
    const children=node.children||[];
    $('shopSubcategories').innerHTML=categoryCards(children);
    $('shopSubcategories').hidden=!children.length;
    $('shopSearchForm').hidden=Boolean(children.length);
    $('shopProductList').innerHTML='';$('shopProductStatus').textContent='';$('shopMore').hidden=true;
    if(!children.length)return browse(id);
  }
  function back(){version++;path.pop();const id=path.at(-1);if(id)choose(id);else open();}
  function preferredStock(p,quantity=p.step){
    const rank=s=>s.delivery==='Доставка сьогодні'?0:s.delivery==='Доставка завтра'?1:2;
    return [...p.stocks].filter(s=>s.quantity>=quantity).sort((a,b)=>rank(a)-rank(b)||b.quantity-a.quantity)[0];
  }
  async function browse(id,more=false){
    const node=findCategory(id);if(!node)return;
    category=id;show('shopProducts');$('shopCategoryTitle').textContent=node.name;
    if(!more){page=1;products=[];$('shopProductList').innerHTML='';}
    const current=++version;$('shopProductStatus').textContent='Перевіряємо ціни й наявність…';$('shopMore').hidden=true;
    try{
      const d=await request('shop/products?'+new URLSearchParams({category,page:String(page),q}));if(current!==version)return;
      products=more?[...products,...d.products]:d.products;
      $('shopProductList').innerHTML=products.map((p,i)=>{const stock=preferredStock(p);return `<article class="shop-product"><div class="shop-product-photo">${image(p.image)}</div><div class="shop-product-body"><div class="shop-brand">${esc(p.brand)} · ${esc(p.article)}</div><h2>${esc(p.name)}</h2><strong class="shop-price">${money(p.price)}</strong><p class="small">${stock?'В наявності':'Немає потрібної кількості'}</p><p class="shop-delivery">${esc(stock?.delivery||'')}</p><button class="primary" type="button" data-add="${i}" ${stock?'':'disabled'}>У кошик${p.step>1?' · '+p.step+' шт.':''}</button></div></article>`;}).join('');
      $('shopProductStatus').textContent=products.length?'Наявність уточнюємо під час оформлення.':'Товарів у наявності не знайдено.';
      $('shopMore').hidden=!d.has_more;
    }catch(e){if(current===version){$('shopProductStatus').textContent=e.message;if(more){page--;$('shopMore').hidden=false;}}}
  }
  function add(index){
    if(locked){alert('Спочатку перевірте статус попереднього замовлення в кошику.');return;}
    const p=products[index],old=cart.find(x=>x.id===p.id),quantity=(old?.quantity||0)+p.step,stock=preferredStock(p,quantity);
    if(!stock||quantity>99){alert('Недостатньо товару для цієї кількості.');return;}
    if(old){old.quantity=quantity;old.price=p.price;old.stocks=p.stocks;old.warehouse=stock.id;}else{if(cart.length>=20){alert('У кошику може бути до 20 позицій.');return;}cart.push({...p,warehouse:stock.id,quantity:p.step});}
    $('shopReceipt').hidden=true;
    key='';save();const b=document.querySelector(`[data-add="${index}"]`);if(b){b.textContent='Додано ✓';setTimeout(()=>{if(b.isConnected)b.textContent='У кошик';},1200);}
  }
  function openCart(){show('shopCart');renderCart();}
  function renderCart(){
    $('shopCartList').innerHTML=cart.length?cart.map((p,i)=>`<article class="card shop-cart-item"><div class="shop-brand">${esc(p.brand)} · ${esc(p.article)}</div><h2>${esc(p.name)}</h2><p class="small">${esc(p.stocks.find(s=>s.id===p.warehouse)?.delivery||'')}<br>${money(p.price)} / шт.</p><div class="shop-quantity"><button type="button" class="secondary" data-qty="${i}" data-delta="-1" aria-label="Зменшити кількість" ${locked?'disabled':''}>−</button><strong>${p.quantity}</strong><button type="button" class="secondary" data-qty="${i}" data-delta="1" aria-label="Збільшити кількість" ${locked?'disabled':''}>+</button><b>${money(p.price*p.quantity)}</b><button type="button" class="shop-remove" data-remove="${i}" aria-label="Видалити товар" ${locked?'disabled':''}>×</button></div></article>`).join(''):'<div class="card empty">Кошик порожній. Оберіть товари в каталозі.</div>';
    $('shopCheckoutForm').hidden=!cart.length;
    $('shopTotal').textContent=money(cart.reduce((n,p)=>n+p.price*p.quantity,0));
    $('shopCar').innerHTML='<option value="">Без прив’язки до авто</option>'+((typeof customerData!=='undefined'&&customerData?.cars)||[]).map(c=>`<option value="${Number(c.id)}">${esc([c.brand,c.model].filter(Boolean).join(' '))} · ${esc(c.vin||'')}</option>`).join('');
    $('shopCar').value=carId;$('shopComment').value=comment;$('shopCar').disabled=locked;$('shopComment').disabled=locked;
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
    preserveForm();key=key||crypto.randomUUID();locked=true;save();
    const current=version,button=$('shopSubmit');button.disabled=true;$('shopCheckoutStatus').textContent='Перевіряємо товари та передаємо замовлення…';
    try {
      const r=await apiFetch('shop/checkout',{method:'POST',body:JSON.stringify({key,items:cart.map(p=>({id:p.id,warehouse:p.warehouse,price:p.price,quantity:p.quantity})),car_id:Number(carId)||null,comment})});
      const d=await r.json();if(current!==version)return;
      if(d.success){const demo=d.demo||d.review_account;cart=[];key='';locked=false;save();renderCart();$('shopCheckoutStatus').textContent='';$('shopReceipt').hidden=false;$('shopReceiptText').textContent=demo ? 'Це демонстраційне замовлення. До CRM воно не передавалося.' : `Замовлення прийнято. Менеджер уточнить наявність і зв’яжеться з вами. Номер заявки: ${d.order.public_id}`;return;}
      if([400,403,409,429,503].includes(r.status)&&!d.order){locked=false;key='';save();renderCart();}
      $('shopCheckoutStatus').textContent=(d.error||'Не вдалося підтвердити замовлення.')+(d.order?.public_id?` Номер заявки: ${d.order.public_id}`:'');
    }catch(e){$('shopCheckoutStatus').textContent='Не вдалося перевірити відповідь сервера. Натисніть «Перевірити замовлення» — нову заявку створено не буде.';}
    finally{button.disabled=false;button.textContent=locked?'Перевірити замовлення':'Замовити';}
  }
  async function orders(){show('shopOrders');$('shopOrdersList').textContent='Завантаження…';try{const d=await request('shop/orders');$('shopOrdersList').innerHTML=d.orders.length?d.orders.map(o=>`<article class="card"><strong>${o.status==='sent'?'Передано менеджеру':'Потребує перевірки менеджером'}</strong><p class="small">${esc(new Date(o.created_at).toLocaleString('uk-UA'))}<br>№ ${esc(o.public_id)}</p><b>${money(o.total_cents)}</b></article>`).join(''):'<div class="card empty">Замовлень поки немає.</div>';}catch(e){$('shopOrdersList').textContent=e.message;}}
  function reset(){version++;cart=[];key='';locked=false;carId='';comment='';save();if($('shopOrdersList'))$('shopOrdersList').innerHTML='';if($('shopReceipt'))$('shopReceipt').hidden=true;}
  window.Shop={open,browse:choose,back,openCart,orders,reset};
  document.addEventListener('DOMContentLoaded',()=>{
    badge();
    for(const id of ['shopCategories','shopSubcategories'])$(id).addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b)choose(b.dataset.category);});
    $('shopSearchForm').addEventListener('submit',e=>{e.preventDefault();q=$('shopSearch').value.trim();browse(category);});
    $('shopMore').addEventListener('click',()=>{page++;browse(category,true);});
    $('shopProductList').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(b)add(Number(b.dataset.add));});
    $('shopCartList').addEventListener('click',e=>{const b=e.target.closest('[data-qty]'),r=e.target.closest('[data-remove]');if(b)change(Number(b.dataset.qty),Number(b.dataset.delta));if(r&&!locked){preserveForm();cart.splice(Number(r.dataset.remove),1);key='';save();renderCart();}});
    $('shopCheckoutForm').addEventListener('submit',submit);
  });
})();
