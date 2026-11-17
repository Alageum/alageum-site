import { mapLocations, mapCities } from './enterprise-map-locations.js';
import { offices } from './content.js';
import { engineeringOrganizations } from './engineering-organizations.js';

// Navigation taxonomy supplied by the company, November 2026. Locations are
// city centres; registry addresses are labelled and are not factory entrances.
const existing = (id, title) => ({ ...mapLocations.find(item => item.id === id), ...(title ? { title } : {}) });
const added = (id, title, city, address, addressSource, extra = {}) => ({
  id, title, short: title, kind: 'enterprise', city,
  description: '', capabilities: [],
  contact: { city, address, label: 'Адрес по открытому источнику' },
  addressSource, href: null, ...extra,
});
const salesCities = ['Астана', 'Алматы', 'Караганда', 'Усть-Каменогорск', 'Павлодар', 'Актау', 'Уральск', 'Актобе', 'Атырау'];
const production = [
  existing('asia-trafo'), existing('ktz'), existing('utz'), existing('petz'),
  existing('batys-electric', 'Batys Electric'), existing('ural-electric'), existing('aemz'),
  added('shetz', 'Шымкентский электротехнический завод', 'Шымкент', 'ж. м. Тассай, 1196', 'https://enbek.kz/ru/предприятие/товарищество-с-ограниченной-ответственностью-шымкентский-электротехнический-завод~1284005'),
  added('shmu', 'ШМУ', 'Шымкент', 'ул. С. Халметова, 2', 'https://procurement.gov.kz/ru/registry/show_supplier/921303'),
  added('zemi', 'ЗЭМИ', 'Шымкент', 'ул. Капал батыр, территория Ондиристик, 46', 'https://procurement.gov.kz/ru/registry/show_supplier/745731'),
  added('zshi', 'ЗШИ', null, null, null),
  added('nur-stroy', 'Нур-Строй', 'Туркестан', 'Кызылординская трасса, строение 7, тупик 1, дом б/н', 'https://nurstroy.kz/pages/contact.php'),
  added('voltrex', 'Voltrex', 'Шымкент', 'Енбекшинский район, ж. м. Жулдыз, 336', 'https://www.gov.kz/uploads/2025/10/22/57fc30f51cfa5c343a7063ddcaaa141e_original.1516752.pdf'),
  added('ker', 'КЭР', null, null, null),
  added('panel-radiators', 'Завод панельных радиаторов', 'Уральск', null, '/materials/ru-novosti-panelnye-radiatory-kazakhstanskogo-proizvodstva-budut-eksportirovatsya-v-belarus', { description: 'Радиаторное производство на базе Уральского трансформаторного завода.', href: '/manufacturers/utz' }),
];
export const enterpriseDirectoryGroups = [
  { id: 'engineering', title: 'Проектирование', items: engineeringOrganizations.map(item => item.id === 'energia'
    ? added(item.id, 'КазНИПИ Энергия', 'Алматы', 'пр. Абылай хана, 58', 'https://energia.kz/ru/page/kontakty_2', { ...item, title: 'КазНИПИ Энергия', contact: { city: 'Алматы', address: 'пр. Абылай хана, 58', phone: '+7 727 355 18 88', tel: '+77273551888', email: 'info@energia.kz' } })
    : added(item.id, 'ПромЭнерго', 'Астана', 'ул. Сарайшык, 11, н. п. 7', 'https://procurement.gov.kz/ru/registry/show_supplier/96014', { ...item, title: 'ПромЭнерго' })) },
  { id: 'production', title: 'Производственные площадки', items: production },
  { id: 'sales', title: 'Офисы продаж Alageum Sales', items: salesCities.map((city, index) => {
    const contact = offices.find(item => item.city === city);
    return { id: `sales-${index}`, title: `Филиал ТОО Alageum Sales г. ${city}`, short: city, city, kind: 'office', contact: { ...contact, label: 'Отдел продаж' }, description: '', capabilities: [], href: `https://2gis.kz/search/${encodeURIComponent(`${city} Alageum Sales ${contact.address}`)}` };
  }) },
  { id: 'installation', title: 'Электромонтаж', items: [existing('elmo'), added('transformer-service', 'Alageum Transformer Service', 'Шымкент', 'ж. м. Тассай, 142/2', 'https://procurement.gov.kz/ru/registry/show_supplier/944944')] },
  { id: 'logistics', title: 'Логистика', items: [added('alageum-logistic', 'Alageum Logistic', 'Алматы', 'ул. Утеген батыра, 7/1', 'https://procurement.gov.kz/ru/registry/show_supplier/788656')] },
];
export const enterpriseDirectoryItems = enterpriseDirectoryGroups.flatMap(group => group.items.map(item => ({ ...item, category: group.id })));
export const directoryItemsForCategory = (category = 'all') => enterpriseDirectoryItems.filter(item => category === 'all' || item.category === category);
export const mappedDirectoryItems = (category = 'all') => directoryItemsForCategory(category).filter(item => item.contact?.city);

// Visual grouping must not determine administrative membership.
const republicanCities = { shymkent: 'Shymkent City', almaty: 'Almaty City', astana: 'Astana' };
export const directoryCities = [...mapCities.map(city => ({ ...city, displayRegionName: city.regionName, regionName: republicanCities[city.id] || city.regionName })), { id: 'turkestan', title: 'Туркестан', regionName: 'Turkistan Region', labelSide: 'left', lat: 43.29458, lon: 68.25685, source: 'https://www.geonames.org/1517945/turkistan.html' }];
