import test from 'node:test';
import assert from 'node:assert/strict';
import { companyMetricFacts, companyMetricsSource } from '../lib/public/company-metrics.js';

test('published company metrics match the supplied Forbes 2025 profile', () => {
  const byLabel = Object.fromEntries(companyMetricFacts.map(fact => [fact.label, fact]));
  assert.equal(byLabel['Сотрудников'].value, 4100);
  assert.equal(byLabel['Место в рейтинге Forbes'].value, 25);
  assert.equal(byLabel['Выручка'].value, 198.47);
  assert.equal(byLabel['Чистая прибыль'].value, 26.64);
  for (const label of ['Выручка', 'Чистая прибыль']) {
    assert.equal(byLabel[label].decimals, 2);
    assert.equal(byLabel[label].unit, 'млрд ₸');
    assert.match(byLabel[label].note, /2024/);
  }
});

test('financial year is distinct from the publication edition', () => {
  assert.equal(companyMetricsSource.financialYear, 2024);
  assert.equal(companyMetricsSource.editionYear, 2025);
  assert.equal(companyMetricsSource.href, 'https://forbes.kz/ranking/object/1044');
});
