import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createDemoSession } from '../src/demo.mjs';
const source=(await readFile(new URL('../src/native.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
function setup(success){
  const events=new Map(), nodes=new Map(), calls=[];let ready,loaded=0;
  for(const id of ['nativeReviewLogin','nativeReviewPassword','nativeReviewStatus','phone'])nodes.set(id,{value:'',textContent:'',disabled:false,addEventListener:(name,fn)=>events.set(id+':'+name,fn)});
  nodes.get('phone').value='+380730000001';nodes.get('nativeReviewPassword').value='test-only-password';
  const window={addEventListener(){},loadCustomer:async()=>{loaded++;}};
  runInNewContext(source,{window,document:{getElementById:id=>nodes.get(id),querySelector:()=>null,documentElement:{classList:{add(){}}},addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')ready=fn;}},navigator:{onLine:true},Capacitor:{isNativePlatform:()=>true},registerPlugin:()=>({}),App:{addListener:async()=>{}},LocalNotifications:{},Haptics:{},Share:{},ImpactStyle:{},reminderDate(){},notificationId(){},createDemoSession,createTransport:()=>async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return Response.json(success?{success:true,session_stored:true,review_account:true}:{success:false,error:'Невірний номер або пароль.'},{status:success?200:401});}});
  ready();return {nodes,calls,get loaded(){return loaded;},click:()=>events.get('nativeReviewLogin:click')({currentTarget:nodes.get('nativeReviewLogin')})};
}
test('test-account login uses password route, clears password and loads server account only after Keychain success',async()=>{
  const h=setup(true);await h.click();assert.equal(h.calls[0].path,'auth/password');assert.equal(h.calls[0].body.phone,'+380730000001');assert.equal(h.loaded,1);assert.equal(h.nodes.get('nativeReviewPassword').value,'');assert.equal(h.nodes.get('nativeReviewLogin').disabled,false);
});
test('invalid test-account password stays on login and clears secret',async()=>{
  const h=setup(false);await h.click();assert.equal(h.loaded,0);assert.match(h.nodes.get('nativeReviewStatus').textContent,/Невірний/);assert.equal(h.nodes.get('nativeReviewPassword').value,'');
});
