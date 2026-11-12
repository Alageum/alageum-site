import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inventoryLocalizationSources, isTranslatableSource, localizationCoverage, translationCoverageForSources } from '../scripts/audit-localization-coverage.mjs';

test('localization inventory distinguishes prose and headings from technical identifiers', () => {
  for (const value of ['МИССИЯ', 'АРХИВ', 'ВН/НН', 'масла', 'ТМГ-630/10 предназначен для распределительных сетей.', 'Комплектные трансформаторные подстанции']) assert.equal(isTranslatableSource(value), true, value);
  for (const value of ['2БКТП-2500/10-0,4 УХЛ1', 'АОДЦТН-167000/500', '10 → 0,4 кВ', '400 кВА', '1010х665х982', 'АОДЦТН-167000/500 · 167000/33000 кВА', 'transformers:омп-10', 'https://example.test/путь']) assert.equal(isTranslatableSource(value), false, value);
});

test('catalog and archive dictionaries cover actual record bodies, tables and generated descriptions', () => {
  const dictionaries = JSON.parse(readFileSync(new URL('../lib/i18n/dictionaries.json', import.meta.url), 'utf8'));
  const archivePath = new URL('../lib/i18n/archive-dictionaries.json', import.meta.url);
  const archiveDictionaries = existsSync(archivePath) ? JSON.parse(readFileSync(archivePath, 'utf8')) : {};
  const report = localizationCoverage(dictionaries, archiveDictionaries);
  assert.ok(report.catalogRecords >= 800);
  assert.ok(report.archiveRecords >= 200);
  const proseDesignation = 'Автотрансформатор силовой однофазный двухобмоточный для железных дорог типа АОМЖ-10000÷16000/27,5х2-У1(УХЛ1)';
  assert.ok(report.locations[proseDesignation]?.some(location => location.endsWith('.designation')), 'a designation field containing prose must not be excluded');
  assert.ok(Object.values(report.locations).some(locations => locations.some(location => location.endsWith('.intro'))), 'rendered first-sentence intros must be inventoried');
  assert.ok(report.locations['Модульный блок контейнерного типа']?.some(location => location.endsWith('.sku')), 'a legacy SKU field with prose must not be excluded');
  assert.ok(report.locations['вводные для ввода и учета']?.some(location => location.includes('.facet.function')), 'individual semicolon-separated facet options must be inventoried');
  assert.ok(report.locations['трансформаторный отсек']?.some(location => /\.(?:technicalSpecs|variantSpecs)\[\d+\]\.module\[/.test(location)), 'individual block-module list entries must be inventoried');
  assert.ok(report.keys.some(key => key.length > 4000), 'long archive paragraphs must not be omitted');
  for (const [locale, keys] of Object.entries(report.missing)) assert.equal(keys.length, 0, `${locale}: ${keys.length} missing strings; first: ${keys.slice(0, 3).map(key => key.slice(0, 120)).join(' | ')}`);
  for (const [locale, keys] of Object.entries(report.catalogMissing)) assert.equal(keys.length, 0, `${locale}: ${keys.length} catalog strings missing from shared client dictionaries`);
  // A dictionary entry that merely copies a paragraph is not a completed translation.
  for (const locale of ['en', 'zh', 'uz']) {
    const copiedParagraphs = report.keys.filter(key => key.length > 300 && /\s/.test(key) && (dictionaries[locale]?.[key] || archiveDictionaries[locale]?.[key]) === key);
    assert.equal(copiedParagraphs.length, 0, `${locale}: ${copiedParagraphs.length} copied source paragraphs must be translated`);
  }
  const inventory = inventoryLocalizationSources();
  assert.ok([...inventory.values()].some(locations => [...locations].some(location => /\.blocks.*\.rows/.test(location))), 'archive table labels must be inventoried');
});


test('server-only archive translations do not mask a missing catalog translation', () => {
  const sources = new Map([
    ['Текст каталога', new Set(['catalog:example.description'])],
    ['Текст архива', new Set(['archive:example.blocks[0].text'])],
    ['Общий текст', new Set(['catalog:example.name', 'archive:example.title'])],
  ]);
  const shared = { en: { 'Общий текст': 'Shared text' } };
  const archive = { en: { 'Текст каталога': 'Catalog text', 'Текст архива': 'Archive text' } };
  const report = translationCoverageForSources(sources, shared, archive);
  assert.deepEqual(report.archiveMissing.en, []);
  assert.deepEqual(report.catalogMissing.en, ['Текст каталога']);
  assert.deepEqual(report.missing.en, ['Текст каталога']);
});
