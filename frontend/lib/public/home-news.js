import {news} from '../ecosystem/news.js';

// These are the same archived publications shown in the public news directory.
// Their detail pages remain available independently of editorial CMS entries.
const archiveIds = {
 'domestic-production':'ru-novosti-glava-alageum-electric-predlozhil-novye-mery-podderzhki-otechestvennogo-proizvodstva',
 'caspian-support':'ru-novosti-alageum-electric-napravit-300-mln-tenge-semyam-pogibshikh-i-postradavshikh-na-kaspii',
 'petropavlovsk-substation':'ru-novosti-alageum-obespechit-energiej-novye-obekty-petropavlovska',
};
export function homeArchiveNews(limit=3){
 return news.filter(item=>archiveIds[item.id]).toSorted((a,b)=>b.date.localeCompare(a.date)).slice(0,limit).map(item=>({...item,href:`/materials/${archiveIds[item.id]}`}));
}
