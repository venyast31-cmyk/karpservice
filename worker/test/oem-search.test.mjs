import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {quickSearchWithFallback} from '../src/oem-search.js';
import {searchView} from '../src/shop-oem.js';
const fixture=async n=>JSON.parse(await readFile(new URL('./fixtures/oem-'+n+'.json',import.meta.url),'utf8')).data;
const taxonomy=async()=>(await fixture('quick')).quick_taxonomy.tree;
for(const [category,query,expected] of [['cooling-radiator','radiator','A2205000903'],['cooling-water-pump','pump','A1122001501'],['brake-disc','brake disc','A2204210812'],['engine-mounts','engine mount','A2202400617']]){
 test('empty quick index resolves real '+category+' via name search',async()=>{
  const calls=[];const api={quickSearch:async()=>({items:[]}),search:async(v,q)=>{calls.push(q);return fixture('search-'+q.replaceAll(' ','-'));}};
  const result=await quickSearchWithFallback(api,'a'.repeat(32),category,taxonomy);
  assert.equal(calls[0],query);assert.ok(result.items.length);
  const view=searchView(result.items);assert.ok(view.some(n=>n.matches.includes(expected)));
  assert.ok(view.every(n=>n.preview.length));
  if(category==='cooling-radiator'){
   assert.equal(view.length,2);assert.ok(!view.some(n=>/GRILLE|WIRING|BUMPER/.test(n.name)));
   assert.deepEqual(view[0].matches,['A2205000903']);assert.equal(view[1].preview[0].reference,'30');
  }
 });
}
test('working quick selection does not consume fallback calls',async()=>{
 const direct=await fixture('search');
 assert.equal(await quickSearchWithFallback({quickSearch:async()=>direct,search:()=>assert.fail()},'a'.repeat(32),'service-oil-filter',()=>assert.fail()),direct);
});
test('unknown category and upstream denial do not trigger broad catalog searches',async()=>{
 await assert.rejects(quickSearchWithFallback({quickSearch:async()=>({items:[]})},'a'.repeat(32),'unknown',taxonomy),/invalid_query/);
 await assert.rejects(quickSearchWithFallback({quickSearch:async()=>{throw Error('access denied');},search:()=>assert.fail()},'a'.repeat(32),'cooling-radiator',()=>assert.fail()),/access denied/);
});
test('fallback for other groups uses supplier taxonomy labels and remains bounded',async()=>{
 const calls=[];const api={quickSearch:async()=>({items:[]}),search:async(v,q)=>{calls.push(q);return {items:[]};}};
 const d=await quickSearchWithFallback(api,'a'.repeat(32),'cooling-hoses',taxonomy);
 assert.deepEqual(d.items,[]);assert.equal(calls[0],'Coolant hose');assert.ok(calls.length<=3);
});
