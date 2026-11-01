import { manufacturers, offices } from './content.js';
import { enterpriseCities, enterpriseContacts } from './company.js';

const officialSource = 'https://alageum.com/ru/kontakty';
const searchSource = 'https://2gis.kz/search/Alageum';
const centralContact = { phone: '+7 771 005 22 22', tel: '+77710052222', email: 'sales@alageum.com', label: 'Единый отдел продаж', contactSource: officialSource };
const officeContact = city => ({ ...offices.find(office => office.city === city), label: 'Отдел продаж', contactSource: officialSource });

// User-supplied 2GIS business listings, 2026-11-01. Residential listings excluded.
// Same-site factory listings are merged; legal entities and factory profiles stay intact.
const factoryListings = {
  ktz: { aliases: ['Alageum Electric', 'Kentau transformator zauyty'], listingSource: searchSource },
  aemz: { aliases: ['Alageum Electric'], listingSource: searchSource },
  utz: { aliases: ['Alageum Electric'], listingSource: 'https://2gis.kz/uralsk/firm/70000001025237296' },
  elmo: { colocated: 'По этому адресу в 2ГИС также указан Alageum Trade — торговая компания.', listingSource: searchSource },
  'batys-electric': { aliases: ['Актауский трансформаторный завод'], listingSource: 'https://2gis.kz/aktau/firm/70000001030328909', listedAddress: 'Промышленная зона 6, 65' },
};

const additionalLocations = [
  { id: 'office-astana-sarayshyk', city: 'Астана', title: 'Alageum Electric — офис продаж', short: 'Сарайшык, 11', address: 'ул. Сарайшык, 11', ...officeContact('Астана') },
  { id: 'office-astana-trade', city: 'Астана', title: 'Alageum Trade', short: 'Шары Жиенкуловой, 12', address: 'ул. Шары Жиенкуловой, 12' },
  { id: 'office-almaty-gagarin', city: 'Алматы', title: 'Alageum Electric — офис продаж', short: 'Гагарина, 206Б', address: 'пр. Гагарина, 206Б' },
  { id: 'office-shymkent-11', city: 'Шымкент', title: 'Alageum Electric — Жибек жолы, 11/10', short: 'Жибек жолы, 11/10', address: 'ул. Жибек жолы, 11/10' },
  { id: 'office-shymkent-142', ...officeContact('Шымкент'), city: 'Шымкент', title: 'Alageum Electric — офис продаж', short: 'Жибек жолы, 142/2', address: 'ул. Жибек жолы, 142/2', alternateAddress: 'На официальном сайте: Каратауский р-н, ж. м. Тассай, зд. 142/2.' },
  { id: 'office-karaganda', city: 'Караганда', title: 'Alageum Electric — офис продаж', short: 'Бухар-жырау, 92/2', address: 'пр. Бухар-жырау, 92/2, Apart Hotel 92/2', alternateAddress: 'На официальном сайте: ул. Камская, 85, офисы 21–22.' },
  { id: 'office-oskemen', ...officeContact('Усть-Каменогорск'), city: 'Усть-Каменогорск', title: 'Alageum Electric — офис продаж', short: 'Горького, 50А', address: 'ул. Максима Горького, 50А, офисы 206–207' },
  { id: 'office-pavlodar', ...officeContact('Павлодар'), city: 'Павлодар', title: 'Alageum Sales', short: 'Циолковского, 272', address: 'ул. Циолковского, 272, 2 этаж', listingSource: 'https://2gis.kz/pavlodar/firm/70000001084532750' },
  { id: 'office-atyrau', ...officeContact('Атырау'), city: 'Атырау', title: 'Alageum Sales', short: 'Атамбаева, 27', address: 'ул. Отешкали Атамбаева, 27, 2 этаж', listingSource: 'https://2gis.kz/atyrau/firm/70000001035476240' },
  { id: 'office-aktobe', ...officeContact('Актобе'), city: 'Актобе', title: 'Alageum Electric — офис продаж', short: '312 Стрелковой Дивизии, 44а', address: 'пр. 312 Стрелковой Дивизии, 44а', listingSource: 'https://2gis.kz/aktobe/firm/70000001032733799' },
];

export const mapLocations = [
  ...manufacturers.map(item => {
    const listing = factoryListings[item.id] || {};
    return {
      ...item, ...listing, kind: 'enterprise', href: `/manufacturers/${item.id}`,
      contact: { ...enterpriseContacts[item.id], ...(listing.listedAddress ? { address: listing.listedAddress } : {}), contactSource: officialSource },
    };
  }),
  ...additionalLocations.map(item => ({
    ...item, kind: 'office', listingSource: item.listingSource || searchSource,
    href: item.listingSource || `https://2gis.kz/search/${encodeURIComponent(`${item.city} ${item.title} ${item.address}`)}`,
    description: `Торговая точка и контакты Alageum в городе ${item.city}.`,
    capabilities: ['Продажа электротехнической продукции'],
    contact: { ...centralContact, ...item },
  })),
];

export const mapContacts = Object.fromEntries(mapLocations.map(item => [item.id, item.contact]));
export const locationsInCity = (city = 'all') => mapLocations.filter(item => city === 'all' || item.contact.city === city);

const cityRegions = {
  aktau: 'Mangystau Region', uralsk: 'West Kazakhstan Region', petropavlovsk: 'North Kazakhstan Region',
  kentau: 'Turkistan Region', shymkent: 'Turkistan Region', almaty: 'Almaty Region',
};

// City-centre markers, not geocoded factory entrances. New centres: OSM/Nominatim.
export const mapCities = [
  ...enterpriseCities.map(city => ({ ...city, regionName: cityRegions[city.id] })),
  {"id": "astana", "title": "Астана", "regionName": "Akmola Region", "labelSide": "left", "lat": 51.1282804, "lon": 71.4304708, "source": "https://www.openstreetmap.org/relation/3087156"},
  {"id": "karaganda", "title": "Караганда", "regionName": "Karaganda Region", "labelSide": "below", "lat": 49.8421549, "lon": 73.1063206, "source": "https://www.openstreetmap.org/relation/3577787"},
  {"id": "oskemen", "title": "Усть-Каменогорск", "regionName": "East Kazakhstan Region", "labelSide": "left", "lat": 49.9484438, "lon": 82.6274791, "source": "https://www.openstreetmap.org/relation/10062283"},
  {"id": "pavlodar", "title": "Павлодар", "regionName": "Pavlodar Region", "labelSide": "right", "lat": 52.2857573, "lon": 76.9455035, "source": "https://www.openstreetmap.org/way/170089891"},
  {"id": "atyrau", "title": "Атырау", "regionName": "Atyrau Region", "labelSide": "below", "lat": 47.1067183, "lon": 51.9138976, "source": "https://www.openstreetmap.org/relation/9347854"},
  {"id": "aktobe", "title": "Актобе", "regionName": "Aktobe Region", "labelSide": "right", "lat": 50.2836938, "lon": 57.2298129, "source": "https://www.openstreetmap.org/relation/14210662"},
];
