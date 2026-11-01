import { regionBoundaries } from './enterprise-map-boundaries.js';
import { mapCities } from './enterprise-map-locations.js';

const regionNames = {
  'Abai Region': 'Абайская область', 'Akmola Region': 'Акмолинская область',
  'Aktobe Region': 'Актюбинская область', 'Almaty Region': 'Алматинская область',
  'Atyrau Region': 'Атырауская область', 'West Kazakhstan Region': 'Западно-Казахстанская область',
  'Jambyl Region': 'Жамбылская область', 'Jetisu Region': 'Область Жетісу',
  'Karaganda Region': 'Карагандинская область', 'Kostanay Region': 'Костанайская область',
  'Kyzylorda Region': 'Кызылординская область', 'Mangystau Region': 'Мангистауская область',
  'Pavlodar Region': 'Павлодарская область', 'North Kazakhstan Region': 'Северо-Казахстанская область',
  'Turkistan Region': 'Туркестанская область', 'Ulytau Region': 'Область Ұлытау',
  'East Kazakhstan Region': 'Восточно-Казахстанская область',
};
// Republican cities retain the map’s existing visual grouping.
export const mapRegions = regionBoundaries.filter(region => regionNames[region.name]).map(region => {
  const path = region.displayPath || region.path;
  const coordinates = [...path.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(match => [Number(match[1]), Number(match[2])]);
  const xs = coordinates.map(point => point[0]);
  const ys = coordinates.map(point => point[1]);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { ...region, path, title: regionNames[region.name], cities: mapCities.filter(city => city.regionName === region.name).map(city => city.id), bounds: { left, right, top, bottom } };
});

export function regionViewport(region) {
  const { left, right, top, bottom } = region.bounds;
  return { x: (left + right) / 2, y: (top + bottom) / 2, scale: Math.min(5, 820 * .48 / (right - left), 460 * .8 / (bottom - top)) };
}
