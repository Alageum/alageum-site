// Corporate content reviewed against the official pages on 2026-10-01.
// Office addresses and city markers are deliberately separate: a city marker is
// never presented as a factory entrance, delivery address or routing coordinate.
export const companySource = 'https://alageum.com/ru/kompaniya/o-nas';
export const contactSource = 'https://alageum.com/ru/kontakty';
export const companyHistory = [
  { year: '1997', title: 'Начало общей истории', text: 'Предприятия проектирования, производства и монтажа электротехнической продукции объединяются под брендом Alageum.', source: 'https://alageum.com/ru/kompaniya/istoriya' },
  { year: '1999', title: 'Развитие производства', text: 'Алматинский электромеханический завод входит в состав группы.', source: 'https://alageum.com/ru/predpriyatiya/too-aemz' },
  { year: '2012', title: 'Единая структура', text: 'Образована управляющая компания холдинга Alageum Electric.', source: 'https://alageum.com/ru/kompaniya/istoriya' },
  { year: '2021', title: 'Новая площадка на севере', text: 'Открыт Петропавловский электротехнический завод.', source: 'https://alageum.com/ru/predpriyatiya/too-petropavlovskij-elektrotekhnicheskij-zavod' },
];
export const projectStages = [
  { number: '01', title: 'Проектирование', text: 'Проработка исходных данных и проектных решений для энергообъектов.', href: '/solutions' },
  { number: '02', title: 'Производство', text: 'Выпуск трансформаторов, подстанций и распределительного оборудования.', href: '/catalog' },
  { number: '03', title: 'Монтаж и запуск', text: 'Строительство, электромонтаж и пусконаладочные работы.', href: '/projects' },
  { number: '04', title: 'Обслуживание', text: 'Гарантийное и техническое сопровождение оборудования.', href: '/contacts' },
];
export const enterpriseContacts = {
  'batys-electric': { city:'Актау', address:'Точный адрес предприятия необходимо уточнить', phone:'+7 771 005 22 22', tel:'+77710052222', email:'sales@alageum.com', label:'Единый отдел продаж — направит запрос предприятию' },
  'ural-electric': { city:'Уральск', address:'Точный адрес предприятия необходимо уточнить', phone:'+7 771 005 22 22', tel:'+77710052222', email:'sales@alageum.com', label:'Единый отдел продаж — направит запрос предприятию' },
  ktz: { city: 'Кентау', address: 'ул. И. Кожабаева, 2', phone: '+7 771 005 40 30', tel: '+77710054030', email: 'ktz@alageum.com', label: 'Отдел продаж · почта приёмной' },
  'asia-trafo': { city: 'Шымкент', address: 'Каратауский р-н, ж. м. Тассай, здание 1196', phone: '+7 7252 92 18 40', tel: '+77252921840', extension: 'доб. 208', email: 'asia.trafo@alageum.com', label: 'Отдел продаж · почта приёмной' },
  aemz: { city: 'Алматы', address: 'ул. Земнухова, 9а · отдел продаж', phone: '+7 771 005 19 04', tel: '+77710051904', email: 'ok@alageum.com', label: 'Отдел продаж' },
  utz: { city: 'Уральск', address: 'ул. Есенжанова, 42/6Н1', phone: '+7 771 005 20 15', tel: '+77710052015', email: 'sales@uraltrafo.kz', label: 'Отдел продаж' },
  petz: { city: 'Петропавловск', address: 'ул. Парковая, 57В', phone: '+7 771 001 99 10', tel: '+77710019910', email: 'sales@petzsko.kz', label: 'Отдел продаж' },
  elmo: { city: 'Алматы', address: 'ул. Утеген Батыра, 7/1', phone: '+7 727 345 03 45', tel: '+77273450345', email: 'info.elmo@alageum.com', label: 'Общий контакт предприятия' },
};
// GeoNames city centres, not enterprise coordinates. CC BY 4.0 attribution is
// shown beside the map. See docs/company-pages-sources.md for exact sources.
export const enterpriseCities = [
  { id:'aktau', title:'Актау', lat:43.6525, lon:51.1575, source:'https://www.geonames.org/search.html?q=Aktau&country=KZ', labelSide:'right' },
  { id: 'uralsk', title: 'Уральск', lat: 51.24601485, lon: 51.42557596, source: 'https://www.geonames.org/search.html?q=Oral%2F', labelSide: 'right' },
  { id: 'petropavlovsk', title: 'Петропавловск', lat: 54.87343494, lon: 69.15064943, source: 'https://www.geonames.org/search.html?country=KZ', labelSide: 'right' },
  { id: 'kentau', title: 'Кентау', lat: 43.51672, lon: 68.50463, source: 'https://www.geonames.org/1522751/kentau.html', labelSide: 'left' },
  { id: 'shymkent', title: 'Шымкент', lat: 42.31, lon: 69.6, source: 'https://www.geonames.org/KZ/largest-cities-in-kazakhstan.html', labelSide: 'below' },
  { id: 'almaty', title: 'Алматы', lat: 43.25248866, lon: 76.911499, source: 'https://www.geonames.org/advanced-search.html?q=Almaty%2CKazakhstan', labelSide: 'right' },
];
export function cityPoint({ lon, lat }) {
  return { x: (lon - 45) / 44 * 820, y: (57 - lat) / 18 * 460 };
}
export function enterprisesInCity(manufacturers, city = 'all') {
  return manufacturers.filter(item => city === 'all' || enterpriseContacts[item.id]?.city === city);
}
