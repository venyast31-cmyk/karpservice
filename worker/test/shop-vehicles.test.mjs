import test from 'node:test';
import assert from 'node:assert/strict';
import {vehicleSelection,vehicleCatalogue,vehicleGroups} from '../src/shop-vehicles.js';
test('VIN suggestions expose identity only and unavailable VIN retains manual selection',async()=>{
 const p=new URLSearchParams({vin:'W0L0ZCF3551081282'});
 const d=await vehicleCatalogue(p,async(path,q)=>{assert.equal(path,'/search/suggests');assert.equal(q.q,p.get('vin'));return {type:'vehicle',vehicle:{brand:'OPEL',name:'VECTRA-C',model_year:2005,ssd:'private',catalog:'secret'}};});
 assert.deepEqual(Object.keys(d.vehicle).sort(),['brand','model','year']);
 assert.equal((await vehicleCatalogue(p,async()=>{throw Error('supplier_403')})).vehicle,null);
 assert.equal((await vehicleCatalogue(new URLSearchParams({vin:'invalid'}),()=>{throw Error('must not call')})).status,400);
});
test('catalog selection is encoded, scoped and rejects malformed requests',async()=>{
 assert.deepEqual(vehicleSelection(new URLSearchParams({car:'BMW>5 (E39)',node:'Двигун/Фільтри'})),{cars:['BMW>5 (E39)'],nodes:'Двигун/Фільтри'});
 assert.throws(()=>vehicleSelection(new URLSearchParams({node:'Двигун'})));
 const d=await vehicleCatalogue(new URLSearchParams({brand:'BMW'}),async(path,q)=>{assert.equal(path,'/search/products/aggregations/car/BMW/models');return {models:{'5 (E39)':{products_count:3}}};});assert.equal(d.options[0].name,'5 (E39)');
 const g=await vehicleGroups(new URLSearchParams({car:'BMW>5 (E39)'}),async(path,q)=>{assert.deepEqual(q.cars,['BMW>5 (E39)']);return {nodes:[{path:'Двигун/Фільтри',name:'Фільтри'}]};});assert.equal(g.groups[0].path,'Двигун/Фільтри');
});
