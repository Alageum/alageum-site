import { directoryCities, enterpriseDirectoryGroups, directoryItemsForCategory } from './enterprise-directory.js';

const categoryIds = new Set(enterpriseDirectoryGroups.map(group => group.id));
export function readEnterpriseMapState(params) {
  const category = categoryIds.has(params.get('category')) ? params.get('category') : 'all';
  const items = directoryItemsForCategory(category);
  const organizationId = items.find(item => item.id === params.get('organization') && item.contact?.city)?.id || null;
  const cityId = directoryCities.find(city => city.title === params.get('city') && items.some(item => item.contact?.city === city.title))?.id || null;
  return { category, organizationId, cityId: organizationId ? null : cityId, regionId: organizationId || cityId ? null : params.get('region') || null };
}
export function enterpriseMapReducer(state, action) {
  switch (action.type) {
    case 'restore': return action.state;
    case 'category': return { category: categoryIds.has(action.id) ? action.id : 'all', organizationId: null, cityId: null, regionId: null };
    case 'organization': {
      const item = directoryItemsForCategory(state.category).find(item => item.id === action.id && item.contact?.city);
      return item ? { ...state, organizationId: item.id, cityId: null, regionId: null } : state;
    }
    case 'city': return { ...state, organizationId: null, cityId: action.id, regionId: null };
    case 'region': return { ...state, organizationId: null, cityId: null, regionId: state.regionId === String(action.id) ? null : String(action.id) };
    case 'reset': return { ...state, organizationId: null, cityId: null, regionId: null };
    default: return state;
  }
}
export function writeEnterpriseMapState(params, state) {
  const next = new URLSearchParams(params);
  for (const key of ['category', 'organization', 'city', 'region']) next.delete(key);
  if (state.category !== 'all') next.set('category', state.category);
  if (state.organizationId) next.set('organization', state.organizationId);
  else if (state.cityId) next.set('city', directoryCities.find(city => city.id === state.cityId).title);
  else if (state.regionId) next.set('region', state.regionId);
  return next;
}
export function previewLocations(locations, { city, cities, organizationId }) {
  if (organizationId) return locations.filter(item => item.id === organizationId);
  return locations.filter(item => cities ? cities.includes(item.contact?.city) : item.contact?.city === city);
}

// The map visually merges republican cities into neighbouring polygons, while
// directory filters keep their actual administrative membership separate.
export function cityMovesWithRegion(city, region) {
  return Boolean(region && (city.displayRegionName || city.regionName) === region.name);
}

// Every entry point opens an area list; an organization/city only preselects a row.
export function resolveEnterpriseArea(locations, cities, regions, selection) {
  const organization = locations.find(item => item.id === selection.organizationId);
  const city = cities.find(item => organization ? item.title === organization.contact.city : item.id === selection.cityId);
  const region = city ? regions.find(item => cityMovesWithRegion(city, item)) : regions.find(item => String(item.osmId) === selection.regionId);
  const areaCities = region ? cities.filter(item => cityMovesWithRegion(item, region)) : [];
  const items = region ? previewLocations(locations, { cities: areaCities.map(item => item.title) }) : [];
  const activeId = organization?.id || items.find(item => item.contact.city === city?.title)?.id || items[0]?.id || null;
  return { region: items.length ? region : null, items, activeId };
}
