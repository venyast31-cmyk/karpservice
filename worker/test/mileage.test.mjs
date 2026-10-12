import test from 'node:test';
import assert from 'node:assert/strict';
import { firstMileage, recordedMileage, mileageKey } from '../src/mileage.js';

test('unknown mileage remains unknown; zero is valid and latest dated reading wins', () => {
  assert.equal(firstMileage(null, undefined, '', false), null);
  assert.equal(firstMileage(null, 0, 123), 0);
  assert.equal(recordedMileage({history:[]}), null);
  assert.equal(recordedMileage({mileage:70000,history:[
    {created_at:'2026-01-01',mileage:150000},
    {created_at:'2026-02-01',mileage:null},
    {created_at:'2026-03-01',mileage:145000}
  ]}),145000);
  assert.equal(recordedMileage({mileage:'42000',history:[{mileage:null}]}),42000);
  assert.equal(mileageKey({id:1,vin:'wdbng70j45a441584'}),mileageKey({id:2,vin:'WDBNG70J45A441584'}));
});
