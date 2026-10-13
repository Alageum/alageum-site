import materials from './materials-index.json' with {type:'json'};
const canonical=value=>{try{const u=new URL(value);u.hash='';return `${u.hostname.replace(/^www\./,'')}${u.pathname.replace(/\/$/,'')}${u.search}`;}catch{return value;}};
const pages=new Map(materials.items.map(item=>[canonical(item.url),`/materials/${item.id}`]));
pages.set('alageum.com','/company');pages.set('alageum.com/ru','/company');
pages.set('alageum.com/ru/kontakty','/contacts');
pages.set('alageum.com/ru/katalog/transformatory','/catalog?category=transformers');
pages.set('alageum.com/ru/katalog/shkafy-upravleniya','/catalog?category=substations');
for(const id of ['kulmakov-timur-timerbulatovich','n-r-ali-dastan-nurlan-ly','shamshiev-ersultan-abdurashitovich','tokmurzin-ruslan-rustamovich-2'])pages.set(`alageum.com/ru/kompaniya/rukovodstvo/${id}`,'/company/team');
const documents=new Map([
 ['alageum.com/images/katalog/2Imid_rus2024.pdf','/documents/alageum-group-2024.pdf'],
 ['asiatrafo.kz/images/referent.pdf','/documents/asia-trafo-references-2019-2023.pdf'],
 ['drive.google.com/file/d/1qMKtgoDWWIjVhAwbrRd8YORKhIpSKazr/view','/catalog/source?page=1'],
 ['drive.google.com/file/d/113q2las1R18OJ6g6laJ5ZN4PFPsY635f/view','/catalog/source?source=transformers-2026&page=1']
]);
export function localResourceHref(href){if(typeof href!=='string'||!/^https?:\/\//i.test(href))return href;const key=canonical(href);const direct=documents.get(key)||pages.get(key);if(direct)return direct;const file=href.match(/drive\.google\.com\/file\/d\/([^/]+)/)?.[1];if(file==='1qMKtgoDWWIjVhAwbrRd8YORKhIpSKazr')return '/catalog/source?page=1';if(file==='113q2las1R18OJ6g6laJ5ZN4PFPsY635f')return '/catalog/source?source=transformers-2026&page=1';return /^(?:www\.)?alageum\.com$/i.test(new URL(href).hostname)?'/materials':href;}
