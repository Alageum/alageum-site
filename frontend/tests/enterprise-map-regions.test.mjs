import test from 'node:test';
import assert from 'node:assert/strict';
import { mapRegions, regionViewport } from '../lib/public/enterprise-map-regions.js';
import { mapCities, mapLocations, locationsInCity } from '../lib/public/enterprise-map-locations.js';

test('every enterprise city belongs to exactly one map region', () => {
  const cities = mapRegions.flatMap(region => region.cities).sort();
  assert.deepEqual(cities, mapCities.map(city => city.id).sort());
});

test('region selection fits the full outline beside the enterprise cards', () => {
  assert.equal(mapRegions.length, 17);
  for (const region of mapRegions) {
    const view = regionViewport(region);
    assert(Number.isFinite(view.x) && Number.isFinite(view.y));
    assert(view.scale > 1 && view.scale <= 5);
    assert((region.bounds.right - region.bounds.left) * view.scale <= 820 * .48 + .001);
    assert((region.bounds.bottom - region.bounds.top) * view.scale <= 460 * .8 + .001);
  }
});

test('southern map grouping includes enterprises from Kentau and Shymkent', () => {
  assert.deepEqual(mapRegions.find(region => region.name === 'Turkistan Region').cities, ['kentau', 'shymkent']);
  assert.deepEqual(mapRegions.find(region => region.name === 'Almaty Region').cities, ['almaty']);
});


test('map includes factories and supplied offices without residential listings', () => {
  assert.equal(mapLocations.length, 18);
  assert.equal(mapCities.length, 12);
  assert.equal(new Set(mapLocations.map(item => item.id)).size, mapLocations.length);
  assert.equal(mapLocations.filter(item => item.kind === 'enterprise').length, 8);
  assert.equal(mapLocations.filter(item => item.kind === 'office').length, 10);
  assert(!mapLocations.some(item => /жилой|eco village/i.test(item.title)));
  for (const item of mapLocations) {
    assert(mapCities.some(city => city.title === item.contact.city));
    assert(item.contact.address && item.contact.tel && item.href);
    if (item.kind === 'office') assert(item.href.startsWith('https://2gis.kz/'));
  }
});

test('new offices enable their regions and preserve same-site factory aliases', () => {
  assert.equal(mapRegions.filter(region => region.cities.length).length, 11);
  assert.equal(locationsInCity('Астана').length, 2);
  assert.equal(locationsInCity('Шымкент').length, 3);
  assert.equal(locationsInCity('Алматы').length, 3);
  assert.equal(locationsInCity('Актобе').length, 1);
  assert.deepEqual(mapRegions.find(region => region.name === 'Akmola Region').cities, ['astana']);
  assert.equal(mapLocations.filter(item => item.id === 'ktz').length, 1);
  assert(mapLocations.find(item => item.id === 'ktz').aliases.includes('Kentau transformator zauyty'));
  assert(mapLocations.find(item => item.id === 'elmo').colocated.includes('Alageum Trade'));
});
