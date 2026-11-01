import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasPoints } from '../lib/ecosystem/atlas.js';

test('all atlas objects have unique identities across the combined view', () => {
  assert.equal(new Set(atlasPoints.map(point => point.key)).size, atlasPoints.length);
  for (const point of atlasPoints) assert(point.id && point.key && point.href);
});

test('the ktz factory and railway partner remain independently selectable', () => {
  const factory = atlasPoints.find(point => point.kind === 'own' && point.id === 'ktz');
  const railway = atlasPoints.find(point => point.kind === 'partner' && point.id === 'ktz');
  assert(factory && railway);
  assert.notEqual(factory.key, railway.key);
  assert.equal(atlasPoints.find(point => point.key === factory.key), factory);
  assert.equal(atlasPoints.find(point => point.key === railway.key), railway);
  assert.equal(factory.href, '/manufacturers/ktz');
  assert.equal(railway.href, '/partners/ktz');
  assert.notEqual(factory.title, railway.title);
});

test('atlas detail links preserve public IDs rather than internal selection keys', () => {
  for (const point of atlasPoints) {
    assert.equal(point.href, `/${point.kind === 'own' ? 'manufacturers' : 'partners'}/${point.id}`);
  }
});
