import {mapRegions} from '../lib/public/enterprise-map-regions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {enterpriseMapReducer,readEnterpriseMapState,writeEnterpriseMapState,previewLocations,cityMovesWithRegion,resolveEnterpriseArea} from '../lib/public/enterprise-map-state.js';
import {mappedDirectoryItems,directoryCities} from '../lib/public/enterprise-directory.js';
const initial=readEnterpriseMapState(new URLSearchParams());
test('changing category clears the old region and organization immediately',()=>{
 const state=enterpriseMapReducer({...initial,regionId:'123',organizationId:'ktz'},{type:'category',id:'engineering'});
 assert.deepEqual(state,{category:'engineering',regionId:null,cityId:null,organizationId:null});
 assert.equal(enterpriseMapReducer(state,{type:'organization',id:'ktz'}),state);
});
test('organization and city clicks open the same complete area list as an area click',()=>{
 const locations=mappedDirectoryItems('production');
 const selected=resolveEnterpriseArea(locations,directoryCities,mapRegions,{organizationId:'voltrex'});
 const direct=resolveEnterpriseArea(locations,directoryCities,mapRegions,{regionId:String(selected.region.osmId)});
 const point=resolveEnterpriseArea(locations,directoryCities,mapRegions,{cityId:'shymkent'});
 assert.equal(selected.activeId,'voltrex');
 assert.deepEqual(selected.items.map(item=>item.id),direct.items.map(item=>item.id));
 assert.deepEqual(point.items.map(item=>item.id),direct.items.map(item=>item.id));
 assert.equal(selected.items.length,7);
 assert.ok(selected.items.every(item=>item.category==='production'));
 assert.equal(point.region.osmId,direct.region.osmId);
});
test('a one-organization area still has an area list and a selected organization',()=>{
 const locations=mappedDirectoryItems('production');
 const selected=resolveEnterpriseArea(locations,directoryCities,mapRegions,{organizationId:'batys-electric'});
 assert.equal(selected.items.length,1);assert.equal(selected.activeId,'batys-electric');
 assert.equal(selected.region.name,'Mangystau Region');
});
test('reset preserves the category; clicking the same region toggles its selection',()=>{
 const state=enterpriseMapReducer({...initial,category:'production'},{type:'region',id:123});
 assert.equal(enterpriseMapReducer(state,{type:'region',id:123}).regionId,null);
 assert.equal(enterpriseMapReducer(state,{type:'reset'}).category,'production');
});
test('URL selection round trips, preserves unrelated parameters, and rejects stale organization IDs',()=>{
 const state=enterpriseMapReducer({...initial,category:'production'},{type:'organization',id:'voltrex'});
 const params=writeEnterpriseMapState('?city=Алматы&region=123&ref=test',state);
 assert.equal(params.get('ref'),'test');assert.equal(params.has('region'),false);assert.equal(params.has('city'),false);
 assert.deepEqual(readEnterpriseMapState(params),state);
 assert.equal(readEnterpriseMapState(new URLSearchParams('category=sales&organization=voltrex')).organizationId,null);
});

test('every city marker lifts with its displayed polygon without changing administrative filters',()=>{
 for (const city of directoryCities) {
  assert.equal(cityMovesWithRegion(city,{name:city.displayRegionName || city.regionName}),true,city.title);
  assert.equal(cityMovesWithRegion(city,{name:'unrelated'}),false,city.title);
 }
 const shymkent=directoryCities.find(city=>city.id==='shymkent');
 assert.equal(cityMovesWithRegion(shymkent,{name:'Turkistan Region'}),true);
 assert.equal(shymkent.regionName,'Shymkent City');
 assert.equal(cityMovesWithRegion(shymkent,undefined),false);
});
