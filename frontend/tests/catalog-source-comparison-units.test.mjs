import test from 'node:test';
import assert from 'node:assert/strict';
import evidence from '../../docs/catalog-transformers-2026/review/identity-completion/legacy-dimension-unit-evidence.json' with { type: 'json' };
import { catalogSourceComparisons } from '../lib/catalog/identityCompletionData.js';

test('all 27 website dimension cells retain mm independently of unknown PDF units', () => {
  assert.equal(evidence.records.length, 9);
  let checked = 0;
  for (const reviewed of evidence.records) {
    const panel = catalogSourceComparisons.find(row => row.canonicalId === reviewed.canonicalId);
    assert.equal(panel.comparison.legacySourceUrl, reviewed.sourceUrl);
    for (const field of ['Lmm', 'Bmm', 'Hmm']) {
      const spec = panel.comparison.comparedSpecs.find(row => row.field === field);
      assert.equal(spec.legacySourceValue, reviewed.legacyValues[field]);
      assert.equal(spec.legacyUnit, 'мм');
      assert.equal(spec.newUnit, '');
      checked += 1;
    }
  }
  assert.equal(checked, 27);
});

test('NTMI comparison retains the separately printed website and PDF units', () => {
  for (const id of ['ntmi-6', 'ntmi-10']) {
    const specs = catalogSourceComparisons.find(row => row.canonicalId === id).comparison.comparedSpecs;
    const maximum = specs.find(row => row.field === 'maximumPowerValue');
    assert.equal(maximum.legacyUnit, 'ВА'); assert.equal(maximum.newUnit, 'кВА');
    for (const field of ['class05VA', 'class10VA', 'class30VA']) {
      const spec = specs.find(row => row.field === field);
      assert.equal(spec.legacyUnit, 'кА (заголовок сайта)'); assert.equal(spec.newUnit, 'ВА');
    }
  }
});
