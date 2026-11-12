// Search aliases describe topics; historical titles and bodies remain unchanged.
const topics = [
  [/трансформатор|transformer/u, 'transformer transformers трансформатор'],
  [/завод|зауыт|factory|plant/u, 'plant factory завод зауыт'],
  [/подстанц|қосалқы|substation/u, 'substation substations подстанция қосалқы станция'],
  [/производств|өндіріс|manufactur|production/u, 'production manufacturing производство өндіріс'],
  [/колледж|college/u, 'college колледж'],
  [/истори|тарих|history/u, 'history история тарих'],
  [/руководств|басшыл|leadership|management/u, 'leadership management руководство басшылық'],
  [/социал|әлеумет|social/u, 'social социальный әлеуметтік'],
  [/экспорт|export/u, 'export экспорт'],
  [/электро|электр|electric/u, 'electrical electric электро электр'],
  [/строител|құрылыс|construction/u, 'construction строительство құрылыс'],
];
export function materialMatches(item, query, translatedTitle = item.title) {
  const title = `${item.title} ${translatedTitle} ${item.id}`.toLowerCase();
  const aliases = topics.filter(([pattern]) => pattern.test(title)).map(([,words]) => words).join(' ');
  const category = item.url.includes('/novosti/') ? 'news новости жаңалықтар 新闻 yangiliklar' : item.url.includes('/predpriyatiya/') ? 'enterprises предприятия кәсіпорындар 企业 korxonalar' : '';
  const haystack = `${title} ${aliases} ${category}`;
  return query.trim().toLowerCase().split(/\s+/u).filter(Boolean).every(word => haystack.includes(word));
}
