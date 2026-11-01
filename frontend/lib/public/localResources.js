import materials from './materials-index.json' with {type:'json'};
import assets from './legacy-assets.json' with {type:'json'};
const canonical=value=>{try{const u=new URL(value);u.hash='';return `${u.hostname.replace(/^www\./,'')}${u.pathname.replace(/\/$/,'')}${u.search}`;}catch{return value;}};
const pages=new Map(materials.items.map(item=>[canonical(item.url),`/materials/${item.id}`]));
const archivePages=new Map(pages);
pages.set('alageum.com','/');pages.set('alageum.com/ru','/');
for(const [slug,target] of [['o-nas','/company'],['istoriya','/company#history'],['dostizheniya','/company#achievements'],['rukovodstvo','/company/team'],['soc-otv','/company/social'],['prodazha','/contacts#assets']])pages.set(`alageum.com/ru/kompaniya/${slug}`,target);
pages.set('alageum.com/ru/kontakty','/contacts');
for(const [slug,target] of [['novosti','/news'],['predpriyatiya','/manufacturers'],['napravleniya','/solutions'],['katalog','/catalog'],['karera','/careers']])pages.set(`alageum.com/ru/${slug}`,target);
for(const [slug,id] of [['ao-ktz','ktz'],['too-asia-trafo','asia-trafo'],['too-aemz','aemz'],['too-utz','utz'],['too-petropavlovskij-elektrotekhnicheskij-zavod','petz'],['too-elektromontazh','elmo'],['too-aktauskij-transformatornyj-zavod','batys-electric'],['ural-electric','ural-electric']])pages.set(`alageum.com/ru/predpriyatiya/${slug}`,`/manufacturers/${id}`);
pages.set('alageum.com/ru/katalog/transformatory','/catalog?category=transformers');
pages.set('alageum.com/ru/katalog/shkafy-upravleniya','/catalog?category=substations');
const documents=new Map([
 ['alageum.com/images/katalog/2Imid_rus2024.pdf','/documents/alageum-group-2024.pdf'],
 ['asiatrafo.kz/images/referent.pdf','/documents/asia-trafo-references-2019-2023.pdf'],
 ['drive.google.com/file/d/1qMKtgoDWWIjVhAwbrRd8YORKhIpSKazr/view','/catalog/source?page=1'],
 ['drive.google.com/file/d/113q2las1R18OJ6g6laJ5ZN4PFPsY635f/view','/catalog/source?source=transformers-2026&page=1']
]);
const localAssets=new Map(Object.entries(assets).map(([url,path])=>[canonical(url),path]));
function parsed(href){try{return typeof href==='string'&&(/^(?:https?:)?\/\//i.test(href)||/^\/(?:ru|en|kz|kk|zh)\/(?:kompaniya|novosti|predpriyatiya|napravleniya|katalog|kontakty|karera)(?:\/|$)/.test(href)||/^\/(?:images|media|templates|components|modules)(?:\/|$)/.test(href))?new URL(href,'https://alageum.com'):null;}catch{return null;}}
export function isLegacyAlageumHref(href){
 const url=parsed(href);if(!url||! /^(?:www\.)?alageum\.com$/i.test(url.hostname))return false;
 const key=canonical(url.href),path=url.pathname;
 return pages.has(key)||archivePages.has(key)||documents.has(key)||localAssets.has(key)||/^\/(?:ru|en|kz|kk|zh)?\/?$/.test(path)||/^\/(?:ru|en|kz|kk|zh)\/(?:kompaniya|novosti|predpriyatiya|napravleniya|katalog|kontakty|karera)(?:\/|$)/.test(path)||/^\/(?:images|media|templates|components|modules)(?:\/|$)/.test(path)||path==='/index.php';
}
export function localResourceHref(href){
 const url=parsed(href);if(!url)return href;
 const key=canonical(url.href),withoutQuery=key.split('?')[0];
 const direct=documents.get(key)||documents.get(withoutQuery)||pages.get(key)||pages.get(withoutQuery)||localAssets.get(key)||localAssets.get(withoutQuery);
 if(direct)return direct;
 return isLegacyAlageumHref(href)?null:href;
}
export function localSourceHref(href){
 const url=parsed(href);return url&&archivePages.get(canonical(url.href).split('?')[0])||localResourceHref(href);
}
