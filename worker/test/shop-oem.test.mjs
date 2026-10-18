import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {vehiclesView,nodesView,partsView,oemImage,handleOem,quickView,searchView} from '../src/shop-oem.js';
const fixture=async name=>JSON.parse(await readFile(new URL('./fixtures/oem-'+name+'.json',import.meta.url),'utf8')).data;
test('provider sample response maps exact model, equipment and nested catalogue',async()=>{
 const result=vehiclesView(await fixture('resolve'));
 assert.equal(result.vehicles[0].model,'ML/GLE 350 CDI/D 4MATIC');
 assert.equal(result.vehicles[0].id,'66805a43f90242a29500c068490669e7');
 const groups=nodesView((await fixture('groups')).data.sections);
 assert.equal(groups[0].children[0].children[0].name,'ENGINE HOUSING');
 const units=nodesView((await fixture('children')).data.units);
 assert.equal(units[0].parts,true);assert.match(units[0].image,/^https:\/\/vinalfa.com\/images\/oem\?/);
 const parts=partsView(await fixture('parts'));
 assert.equal(parts.parts[0].numbers[0].number,'Q0000000001');assert.equal(parts.parts[0].points[0].x,432);
});
test('image origin and protocol are restricted; raw provider properties are dropped',()=>{
 for(const u of ['javascript:alert(1)','https://vinalfa.com.evil.test/images/oem','https://user@vinalfa.com/images/oem','https://vinalfa.com/account'])assert.equal(oemImage(u),'');
 assert.deepEqual(nodesView([{name:'x',hash:'a'.repeat(32),secret:'bad',image:'https://evil.test/x'}]),[{id:'a'.repeat(32),name:'x',image:'',parts:false,children:[]}]);
});
function db(){const rows=new Map();return {rows,prepare(sql){return {bind(...args){return {async first(){const row=rows.get(args[0]);return row&&row.expires>args[1]?{payload:row.payload}:null;},async run(){if(sql.startsWith('INSERT'))rows.set(args[0],{payload:args[1],expires:args[2]});}};}};}};}
test('repeat VIN lookup uses cache without spending new lookup quota',async()=>{
 const env={VINALFA_API_TOKEN:'test',AUTH_DB:db()},raw=await fixture('resolve');let calls=0,paidRates=0;
 const deps={api:{resolve:async()=>{calls++;return raw;}},rate:async(env,key)=>{if(key==='oem-vin-global')paidRates++;return true;}};
 const request=()=>new Request('https://example.com/shop/oem/resolve',{method:'POST',body:JSON.stringify({vin:'WDC1660231A178846'})});
 assert.equal((await handleOem(request(),env,{},deps)).status,200);
 assert.equal((await handleOem(request(),env,{},deps)).status,200);
 assert.equal(calls,1);assert.equal(paidRates,1);
 const nav=await handleOem(new Request('https://example.com/shop/oem?op=groups&vehicle='+raw.data.modifications[0].hash),env,{}, {...deps,api:{groups:async()=>fixture('groups')}});
 assert.equal(nav.status,200);assert.ok((await nav.json()).nodes.length);
});
test('invalid VIN, unknown vehicle and exhausted quota never call provider',async()=>{
 const env={VINALFA_API_TOKEN:'test',AUTH_DB:db()},deps={api:{resolve:()=>assert.fail('unexpected network')},rate:async()=>true};
 assert.equal((await handleOem(new Request('https://example.com/shop/oem/resolve',{method:'POST',body:'{"vin":"bad"}'}),env,{},deps)).status,400);
 assert.equal((await handleOem(new Request('https://example.com/shop/oem?op=groups&vehicle='+'a'.repeat(32)),env,{},deps)).status,410);
 assert.equal((await handleOem(new Request('https://example.com/shop/oem/resolve',{method:'POST',body:'{"vin":"WDC1660231A178846"}'}),env,{}, {...deps,rate:async(e,k)=>k!=='oem-vin-global'})).status,429);
});

test('quick taxonomy keeps provider identifiers and searches retain matched articles',async()=>{
 const nodes=quickView((await fixture('quick')).quick_taxonomy.tree);
 assert.equal(nodes[0].children[0].quick,'service-oil-filter');
 assert.equal(nodes[1].children.find(x=>x.name==='Cylinder head gasket').quick,'dvigatel-prokladka-gbts');
 assert.equal(nodes[0].children[0].query,undefined);
 const found=searchView((await fixture('search')).items);
 assert.ok(found[0].matches.includes('A6421800010'));
 assert.ok(!found[0].foundParts);
});

test('complete catalogue retains every group, diagram and part beyond previous display limits',()=>{
 const nodes=Array.from({length:601},(_,i)=>({hash:i.toString(16).padStart(32,'0'),name:'Unit '+i,kind:'diagram'}));
 assert.equal(nodesView(nodes).length,601);
 assert.equal(partsView({data:{parts:Array.from({length:1001},(_,i)=>({reference:String(i),numbers:[]}))}}).parts.length,1001);
 let nested=nodes.slice(0,1);for(let i=0;i<12;i++)nested=[{name:'Level '+i,children:nested}];
 let result=nodesView(nested);for(let i=0;i<12;i++)result=result[0].children;
 assert.equal(result[0].id,'0'.repeat(32));
});
