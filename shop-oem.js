(() => {
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={'M':'Двигун','GA':'Автоматична коробка передач','ENGINE':'Двигун','ENGINE HOUSING':'Корпус двигуна','ENGINE MANAGEMENT':'Керування двигуном','FUEL INJECTION':'Впорскування пального','ENGINE LUBRICATION':'Система змащування','ENGINE COOLING':'Охолодження двигуна','ENGINE SUSPENSION':'Опори двигуна','AUTOMATIC TRANSMISSION':'Автоматична коробка передач','TRANSFER CASE':'Роздавальна коробка','FRONT AXLE':'Передня вісь','REAR AXLE':'Задня вісь','WHEELS':'Колеса','PROPELLER SHAFT':'Карданний вал','BRAKES':'Гальма','STEERING':'Кермове керування','FUEL SYSTEM':'Паливна система','EXHAUST SYSTEM':'Вихлопна система','RADIATOR':'Радіатор','ELECTRICAL SYSTEM':'Електрика','HEATING AND VENTILATION':'Опалення та вентиляція','WASHER SYSTEM':'Склоомивачі','FRONT DOORS':'Передні двері','REAR DOORS':'Задні двері','WINDOWS':'Скло','ROOF':'Дах','ACCESSORIES':'Аксесуари','OIL FILTER AND OIL COOLER':'Масляний фільтр і теплообмінник','OIL FILTER':'Масляний фільтр','TS OIL FILTER ELEMENT':'Фільтрувальний елемент','CYLINDER HEAD':'Головка блока циліндрів','CYLINDER CRANKCASE':'Блок циліндрів','TIMING CASE':'Корпус ГРМ','OIL PAN & OIL LEVEL DISPLAY':'Піддон та рівень мастила'};
  const label=s=>labels[s]||s;
  const quick=[['service-oil-filter','Масляний фільтр'],['service-air-filter','Повітряний фільтр'],['service-cabin-filter','Фільтр салону'],['service-fuel-filter','Паливний фільтр'],['service-brake-pads','Гальмівні колодки'],['service-wipers','Щітки']];
  let epoch=0,car=null,history=[],view=null,retry=null,zoom=1,selected=null,vinEpoch=0;
  async function request(path,options){const r=await apiFetch(path,options);const d=await r.json();if(!r.ok)throw new Error(d.error||'Каталог тимчасово недоступний.');return d;}
  function invalidate(){vinEpoch++;epoch++;$('shopVinChoices').replaceChildren();}
  function carText(v){return [v.brand,v.model].filter(Boolean).join(' ');}
  function carMeta(v){return [v.date&&'Випуск: '+v.date,v.engine&&'Двигун: '+v.engine,v.transmission&&'КПП: '+v.transmission].filter(Boolean).join(' · ');}
  async function find(e){
    e.preventDefault();const vin=$('shopVin').value.trim().toUpperCase();$('shopVin').value=vin;
    invalidate();const current=vinEpoch;
    if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)){$('shopVinStatus').textContent='Введіть 17 символів VIN без I, O та Q.';return;}
    $('shopVin').blur();$('shopVinSubmit').disabled=true;$('shopVinStatus').textContent='Визначаємо комплектацію авто…';
    try{const d=await request('shop/oem/resolve',{method:'POST',body:JSON.stringify({vin})});if(current!==vinEpoch)return;
      $('shopVinStatus').textContent=d.vehicles.length>1?'Оберіть комплектацію автомобіля:':'Автомобіль знайдено.';
      $('shopVinChoices').replaceChildren();
      d.vehicles.forEach(v=>{const b=document.createElement('button');b.type='button';b.className='oem-car-choice';b.innerHTML=`<strong>${esc(carText(v))}</strong><small>${esc(carMeta(v))}</small><span>Відкрити каталог</span>`;b.addEventListener('click',()=>selectCar(v));$('shopVinChoices').append(b);});
      if(d.vehicles.length===1)await selectCar(d.vehicles[0]);
    }catch(err){if(current===vinEpoch)$('shopVinStatus').textContent=err.message;}
    finally{if(current===vinEpoch)$('shopVinSubmit').disabled=false;}
  }
  async function selectCar(v){car=v;history=[];view=null;$('oemQuery').value='';show('shopOem');$('oemCar').innerHTML=`<strong>${esc(carText(v))}</strong><small>${esc(carMeta(v))}</small>${v.equipment.length?`<details><summary>Комплектація</summary><dl>${v.equipment.map(x=>`<dt>${esc(x.name)}</dt><dd>${esc(x.value)}</dd>`).join('')}</dl></details>`:''}`;await navigate('groups',{},'Групи запчастин',false);}
  async function navigate(op,params,title,push=true){
    const current=++epoch,vehicle=car.id;
    $('oemStatus').textContent=op==='parts'?'Завантажуємо схему…':'Завантажуємо каталог…';$('oemRetry').hidden=true;
    $('oemNodes').setAttribute('aria-busy','true');
    const action=()=>navigate(op,params,title,push);retry=action;
    try{const d=await request('shop/oem?'+new URLSearchParams({op,vehicle,...params}));if(current!==epoch)return;
      if(push&&view)history.push(view);view={op,title,data:d};render();retry=null;
    }catch(e){if(current===epoch){$('oemStatus').textContent=e.message;$('oemRetry').hidden=false;}}
    finally{if(current===epoch)$('oemNodes').removeAttribute('aria-busy');}
  }
  function openNode(n){
    if(n.children.length){epoch++;history.push(view);view={op:'local',title:label(n.name),data:{nodes:n.children}};render();}
    else if(n.id)navigate(n.parts?'parts':'children',{section:n.id},label(n.name));
  }
  function render(){
    selected=null;zoom=1;$('oemTitle').textContent=view.title;$('oemStatus').textContent='';$('oemRetry').hidden=true;
    $('oemBack').textContent=history.length?'← Назад':'← До магазину';
    $('oemQuick').hidden=view.op==='parts';$('oemSearch').hidden=view.op==='parts';
    $('oemNodes').replaceChildren();$('oemDiagram').hidden=view.op!=='parts';
    if(view.op==='parts'){
      $('oemImage').onload=drawPoints;$('oemImage').onerror=()=>{$('oemStatus').textContent='Зображення не завантажилося. Список деталей доступний нижче.';};
      $('oemPoints').replaceChildren();$('oemImage').src=view.data.image||'';$('oemViewport').hidden=!view.data.image;
      $('oemCanvas').style.width='100%';renderParts();if($('oemImage').complete&&$('oemImage').naturalWidth)drawPoints();
    }else{
      const nodes=view.data.nodes||[];
      nodes.forEach(n=>{const b=document.createElement('button');b.type='button';b.className='oem-node';b.innerHTML=(n.image?`<img src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'')+`<span>${esc(label(n.name))}</span>`;b.addEventListener('click',()=>openNode(n));$('oemNodes').append(b);});
      if(!nodes.length)$('oemStatus').textContent='У цьому розділі деталей не знайдено. Спробуйте іншу групу.';
    }
  }
  function drawPoints(){
    const img=$('oemImage');if(!view||view.op!=='parts'||!img.naturalWidth)return;
    $('oemPoints').replaceChildren();
    for(const p of view.data.parts)for(const point of p.points){
      const b=document.createElement('button');b.type='button';b.className='oem-point'+(selected===p.reference?' selected':'');b.textContent=p.reference;b.setAttribute('aria-label','Позиція '+p.reference);
      b.style.left=((point.x+point.width/2)/img.naturalWidth*100)+'%';b.style.top=((point.y+point.height/2)/img.naturalHeight*100)+'%';
      b.addEventListener('click',()=>{selected=p.reference;renderParts();drawPoints();$('oemPartTitle').scrollIntoView({behavior:'smooth',block:'center'});});$('oemPoints').append(b);
    }
  }
  function renderParts(){
    const parts=view.data.parts.filter(p=>selected===null||p.reference===selected);$('oemAllParts').hidden=selected===null;
    $('oemPartTitle').textContent=selected===null?'Деталі на схемі':'Позиція '+selected;$('oemParts').replaceChildren();
    parts.forEach(p=>p.numbers.forEach(n=>{const card=document.createElement('article');card.className='oem-part';card.innerHTML=`<div class="oem-part-heading"><span class="oem-reference">${esc(p.reference)}</span><h2>${esc(label(n.name))}</h2></div><strong class="oem-number">${esc(n.number)}</strong>${n.quantity?`<small>Кількість на схемі: ${esc(n.quantity)}</small>`:''}${n.replacement?`<p>Заміна: ${esc(n.replacement)}</p>`:''}${n.description.length?`<details><summary>Примітки та застосування</summary>${n.description.map(x=>`<p>${esc(x.value)}</p>`).join('')}</details>`:''}`;
      const b=document.createElement('button');b.type='button';b.className='primary';b.textContent='Ціна та наявність';b.disabled=!/^[A-Za-z0-9 .\/-]{2,100}$/.test(n.number);b.addEventListener('click',()=>Shop.oe(n.number));card.append(b);$('oemParts').append(card);
    }));
    if(!parts.some(p=>p.numbers.length))$('oemParts').textContent='Для цієї позиції немає артикулів.';
  }
  function back(){epoch++;retry=null;$('oemRetry').hidden=true;if(history.length){view=history.pop();render();}else Shop.open();}
  function setZoom(value){zoom=Math.max(1,Math.min(4,value));$('oemCanvas').style.width=(zoom*100)+'%';}
  window.Oem={find,invalidate,resume:()=>{show('shopOem');}};
  document.addEventListener('DOMContentLoaded',()=>{
    $('oemBack').addEventListener('click',back);$('oemRetry').addEventListener('click',()=>retry?.());
    $('oemAllParts').addEventListener('click',()=>{selected=null;renderParts();drawPoints();});
    $('oemZoomIn').addEventListener('click',()=>setZoom(zoom+.5));$('oemZoomOut').addEventListener('click',()=>setZoom(zoom-.5));
    $('oemSearch').addEventListener('submit',e=>{e.preventDefault();const q=$('oemQuery').value.trim();if(q.length<2){$('oemStatus').textContent='Введіть щонайменше 2 символи.';return;}$('oemQuery').blur();navigate('search',{q},'Результати пошуку');});
    for(const [id,name]of quick){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=name;b.addEventListener('click',()=>navigate('search',{quick:id},name));$('oemQuick').append(b);}
  });
})();
