// Isolated fictional merchandise for the review account. No supplier or CRM calls.
import {CATEGORIES} from '../../worker/src/shop-catalog.js';
const view=({id,name,image,children})=>({id,name,image:'https://cdn.bm.parts/photos/320x320/'+image.replace(/\\/g,'/').replace(/^photo\//,''),children:children.map(view)});
export const demoShopCategories=CATEGORIES.map(view);
export function demoShopProducts(category){
  category=String(category||'').split(':')[0];
  const names={oil:'Демонстраційне моторне мастило 5W-30, 4 л',electric:'Демонстраційний акумулятор 60 А·год',wipers:'Демонстраційний комплект щіток',care:'Демонстраційний засіб для догляду'};
  if(!names[category])return [];
  return [{id:String(demoShopCategories.findIndex(c=>c.id===category)+1).repeat(32),name:names[category],article:'DEMO-001',brand:'Демо',image:'',price:130000,step:1,stocks:[{id:'demo-warehouse',label:'5',quantity:5,delivery:'Тестова доставка'}]}];
}
