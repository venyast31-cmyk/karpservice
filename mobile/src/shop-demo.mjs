// Isolated fictional merchandise for the review account. No supplier or CRM calls.
export const demoShopCategories=[{id:'oil',name:'Оливи та технічні рідини'},{id:'electric',name:'Електрика'},{id:'wipers',name:'Очищення вікон і фар'},{id:'care',name:'Аксесуари та догляд'}];
export function demoShopProducts(category){
  const names={oil:'Демонстраційне моторне мастило 5W-30, 4 л',electric:'Демонстраційний акумулятор 60 А·год',wipers:'Демонстраційний комплект щіток',care:'Демонстраційний засіб для догляду'};
  if(!names[category])return [];
  return [{id:String(demoShopCategories.findIndex(c=>c.id===category)+1).repeat(32),name:names[category],article:'DEMO-001',brand:'Демо',image:'',price:130000,step:1,stocks:[{id:'demo-warehouse',name:'Демонстраційний склад',label:'5',quantity:5,delivery:'Тестова доставка'}]}];
}
