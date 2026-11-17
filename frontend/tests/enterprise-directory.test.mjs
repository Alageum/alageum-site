import test from 'node:test';
import assert from 'node:assert/strict';
import {enterpriseDirectoryGroups, enterpriseDirectoryItems, directoryItemsForCategory, mappedDirectoryItems, directoryCities} from '../lib/public/enterprise-directory.js';
test('requested groups preserve all 29 organizations and nine sales offices without duplicate identities', () => {
 assert.deepEqual(enterpriseDirectoryGroups.map(group => group.items.length), [2,15,9,2,1]);
 assert.equal(new Set(enterpriseDirectoryItems.map(item => item.id)).size,29);
 assert.equal(directoryItemsForCategory().length,29);
});
test('filtered markers contain only the requested category and confirmed cities', () => {
 for(const group of enterpriseDirectoryGroups) {
  const items=mappedDirectoryItems(group.id);assert.ok(items.length);
  for(const item of items){assert.equal(item.category,group.id);assert.ok(directoryCities.some(city=>city.title===item.contact.city),item.id);}
 }
 for(const id of ['zshi','ker'])assert.ok(!mappedDirectoryItems().some(item=>item.id===id));
});

test('republican cities are excluded from neighbouring administrative regions', () => {
 const regionCities=directoryCities.filter(city=>city.regionName==='Turkistan Region').map(city=>city.title);
 const production=mappedDirectoryItems('production').filter(item=>regionCities.includes(item.contact.city));
 assert.deepEqual(production.map(item=>item.id).sort(),['ktz','nur-stroy']);
 assert.equal(directoryCities.find(city=>city.id==='shymkent').regionName,'Shymkent City');
 assert.equal(directoryCities.find(city=>city.id==='almaty').regionName,'Almaty City');
 assert.equal(directoryCities.find(city=>city.id==='astana').regionName,'Astana');
});

