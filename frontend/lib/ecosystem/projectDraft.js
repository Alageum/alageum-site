const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const scalarLimits={name:180,site:300,task:5000,due:50,company:240,buyer:240,seller:240,bin:24,iban:64,currency:3};
export function projectDraftPatch(patch, productExists) {
 const next={};
 for(const [key,max] of Object.entries(scalarLimits))if(Object.hasOwn(patch,key))next[key]=text(patch[key],max);
 if(Object.hasOwn(next,'name')&&!next.name)throw Error('Укажите название проекта.');
 if(Object.hasOwn(patch,'items')){
  if(!Array.isArray(patch.items))throw Error('Некорректный список оборудования.');
  const seen=new Set();next.items=patch.items.filter(item=>item&&typeof item.id==='string'&&productExists(item.id)&&!seen.has(item.id)&&seen.add(item.id)).slice(0,500).map(item=>({id:item.id,quantity:Math.max(1,Math.min(999,Math.floor(Number(item.quantity)||1))),unitPrice:text(item.unitPrice,24)}));
 }
 if(Object.hasOwn(patch,'files')){
  if(!Array.isArray(patch.files))throw Error('Некорректный список документов.');
  next.files=patch.files.filter(file=>file&&typeof file.id==='string'&&typeof file.name==='string').slice(0,100);
 }
 return next;
}
