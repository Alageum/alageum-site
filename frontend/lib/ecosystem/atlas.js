import { manufacturers } from '../public/content.js';
import { enterpriseContacts, enterpriseCities } from '../public/company.js';
import { getManufacturerPhoto } from '../public/photography.js';
import { partnerProfiles, partners } from '../public/partners.js';

const astana = { title: 'Астана', lat: 51.17, lon: 71.45 };
const partnerCities = { kmg: astana, kegoc: astana, bi: astana };
export const atlasPoints = [...manufacturers.map((item) => ({ id: item.id, key: `own:${item.id}`, kind: 'own', title: item.title, city: enterpriseContacts[item.id]?.city, point: enterpriseCities.find((city) => city.title === enterpriseContacts[item.id]?.city), text: item.description, capabilities: item.capabilities, href: `/manufacturers/${item.id}`, source: item.source, photos: getManufacturerPhoto(item.id) ? [{ src: getManufacturerPhoto(item.id).path, caption: getManufacturerPhoto(item.id).caption }] : [] })), ...partners.map((item) => ({ id: item.id, key: `partner:${item.id}`, kind: 'partner', title: item.name, city: partnerCities[item.id]?.title || 'Международная география', point: partnerCities[item.id], text: partnerProfiles[item.id].paragraphs.join('\n\n'), capabilities: [partnerProfiles[item.id].focus], year: partnerProfiles[item.id].year, href: `/partners/${item.id}`, source: partnerProfiles[item.id].source, photos: partnerProfiles[item.id].gallery }))];
