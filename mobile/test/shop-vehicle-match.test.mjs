import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../shop.js',import.meta.url),'utf8');
const match=vm.runInNewContext('('+source.slice(source.indexOf('async function matchVehicleModel('),source.indexOf('  async function loadVehicleModels(')).trim()+')');
const identity={brand:'MERCEDES-BENZ',model:'S 430'};
const models=[{name:'S-CLASS (W220)'},{name:'S-CLASS (W221)'},{name:'SL (R230)'}];
test('VIN badge resolves through supplier modifications without confusing S and SL',async()=>{
 assert.equal(JSON.stringify(await match(identity,models,async model=>model.includes('W220')?[{name:'S 430 (220.070, 220.170) 279 л.с. (1998-2005)'}]:[])),JSON.stringify(['S-CLASS (W220)']));
});
test('ambiguous, partial and different-drive matches require manual generation choice',async()=>{
 assert.equal(JSON.stringify(await match(identity,models,async()=>[{name:'S 430 (example)'}])),JSON.stringify(['S-CLASS (W220)','S-CLASS (W221)']));
 assert.equal(JSON.stringify(await match(identity,models,async model=>{if(model.includes('W221'))throw Error('offline');return [{name:'S 430 (example)'}];})),JSON.stringify([]));
 assert.equal(JSON.stringify(await match(identity,models,async()=>[{name:'S 430 4-matic (example)'}])),JSON.stringify([]));
});
test('exact catalogue model is selected without modification requests',async()=>{
 assert.equal(JSON.stringify(await match({brand:'BMW',model:'3 (E90)'},[{name:'3 (E90)'}],()=>{throw Error('unexpected request');})),JSON.stringify(['3 (E90)']));
});
