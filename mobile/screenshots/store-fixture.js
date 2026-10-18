// Simulator-only navigation. No orders or customer records are created.
window.addEventListener('load',async()=>{
 const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Screen did not load');};
 await wait(()=>window.Shop && !document.documentElement.classList.contains('app-loading'));
 await Shop.open();
 const screen=window.KarpScreenshotScreen;
 if(screen==='groups'){
  document.getElementById('shopVin').value='WDBNG70J45A441584';
  document.getElementById('shopVinForm').requestSubmit();
  await wait(()=>document.querySelector('#shopOem.active .oem-node'));
  document.getElementById('oemQuickTab').click();
  await wait(()=>document.getElementById('oemQuickTab').getAttribute('aria-pressed')==='true'&&document.getElementById('oemNodes').getAttribute('aria-busy')==='false');
 } else if(screen==='checkout'){
  Shop.oe('A2212770195');
  await wait(()=>document.querySelector('#shopProductList [data-add]:not([disabled])'));
  document.querySelector('#shopProductList [data-add]:not([disabled])').click();
  Shop.openCart();
  const select=document.getElementById('shopFulfillment');select.value='nova_poshta';select.dispatchEvent(new Event('change',{bubbles:true}));
  document.getElementById('shopFulfillment').scrollIntoView({block:'start'});
 }else if(screen!=='shop')throw Error('Unknown screen');
 await new Promise(r=>setTimeout(r,2500));
 if(screen!=='checkout')window.scrollTo(0,0);
 document.body.dataset.screenshotReady=screen;
});
