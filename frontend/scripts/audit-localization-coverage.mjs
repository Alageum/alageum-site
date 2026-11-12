import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { officialProducts, categories } from '../lib/catalog/data.js';
import { displayProductName, displayFamilyName, displayExecution, displaySubtype, displayExecutionValue, catalogMemberLabel, catalogSourceWarnings, displayDescription, isCatalogFamily, catalogConfigurationLabel } from '../lib/catalog/presentation.js';
import { getCatalogSpecSummary, compactCatalogSpecValue, facetValues, categoryDisplayRows, equipmentTypes } from '../lib/catalog/grouping.js';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const excludedFields = /^(?:id|sku|series|url|href|src|path|sourceUrl|sourceFileId|sourceId|sourceSha256|sourceCheckedAt|imageSourcePage|sourceRecordType|sourceKind|source|recordType|recordKind|format|generation|fieldPath|sourceRecordSha256|group_keys|markingGroupKey|familyKey|modelKey|variantKey|sourceFamilyKey|identity|asset|hash|sha256|geometry|vertices|faces|bindings|manifest|selectors|rule|selector|rawCategory)$/;
const cyrillic = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/;
const lower = /[а-яёәғқңөұүһі]/;
const exactTechnical = /^(?:[0-9]*[A-ZА-ЯЁІҚҒӘӨҰҮҢҺ]+(?:[-/()\d.,хx×+–— ]|[A-ZА-ЯЁІҚҒӘӨҰҮҢҺ])*(?:кВ|кВА|кВт|Гц|мм|кг|м|А|В|УХЛ\d*)?|[\d\s.,;:/()√+–—→×хx%-]+\s*(?:кВ|кВА|кВт|Гц|мм|кг|м|А|В))$/;
export function isTranslatableSource(value) {
  if (typeof value !== 'string') return false;
  const source = value.replace(/\s+/g, ' ').trim();
  if (!source || !cyrillic.test(source) || /^(?:https?:|\/|[a-z-]+:)/.test(source)) return false;
  if (/^[\d.,\s×хxXХ*+/√()[\]–—-]+$/.test(source)) return false;
  if (source.includes(' · ') && source.split(' · ').every(part => !isTranslatableSource(part))) return false;
  if (/^(?:ВН|НН|СН)(?:\s*\/\s*(?:ВН|НН|СН))*$/.test(source)) return true;
  // Values composed only of measurements/units are not language-bearing prose.
  const withoutUnits = source.replace(/(?:кВА|кВ|кВт|Гц|мм|кг|ВН|НН|СН|УХЛ\d*|У\d+|А|В)/g, '');
  if (!cyrillic.test(withoutUnits)) return false;
  if (/^[УYДDнn\/\-0-9]+$/.test(source) || /^[A-ZА-ЯЁ]{2,}[а-яё]$/.test(source)) return false;
  // Units, winding notation and exact model designations are source identifiers.
  if (exactTechnical.test(source) && /\d|[-/()]/.test(source) && (!lower.test(source) || /^(?:[\d., /()-]+\s*)?(?:кВ|кВА|кВт|Гц|мм|кг|м|А|В)$/.test(source))) return false;
  if (/^[A-ZА-ЯЁІҚҒӘӨҰҮҢҺ0-9]+[-/(][A-ZА-ЯЁІҚҒӘӨҰҮҢҺ0-9.,/()хx×+–— \-]+(?:\s*(?:кВ|кВА|кВт|Гц|мм|кг))?$/.test(source)) return false;
  if (new Set(['ВН', 'НН', 'СН', 'КРУ', 'КРУЭ', 'КТП', 'БКТП', 'НКУ', 'КТЗ', 'УТЗ', 'ПЭТЗ', 'АЭМЗ', 'ТМ', 'ТМГ', 'ТМЭГ', 'ТМЭ', 'УХЛ', 'АО', 'ТОО']).has(source)) return false;
  return true;
}

export function inventoryLocalizationSources() {
  const sources = new Map();
  function add(value, location) {
    if (!isTranslatableSource(value)) return;
    const text = value.replace(/\s+/g, ' ').trim();
    if (!sources.has(text)) sources.set(text, new Set());
    sources.get(text).add(location);
  }
  function visit(value, location, field = '') {
    if (excludedFields.test(field)) {
      // Legacy SKU/series fields occasionally contain a descriptive phrase rather than a code.
      if (['sku', 'series'].includes(field) && typeof value === 'string' && /[а-яёәғқңөұүһі]{3}/.test(value)) add(value, location);
      return;
    }
    if (typeof value === 'string') add(value, location);
    else if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${location}[${index}]`, field));
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) visit(item, `${location}.${key}`, key);
  }
  for (const product of officialProducts) {
    const root = `catalog:${product.id}`;
    visit(product, root);
    const name = displayProductName(product);
    const execution = displayExecution(product);
    const description = displayDescription(product, officialProducts);
    const generatedPrefix = `${name}${execution ? ` · ${execution}` : ''}. `;
    // ProductOverview presents the first sentence after its repeated name/execution prefix.
    const overviewDescription = !product.description && isCatalogFamily(product) ? '' : description;
    const intro = (overviewDescription.startsWith(generatedPrefix) ? overviewDescription.slice(generatedPrefix.length) : overviewDescription).split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/u)[0];
    const specifications = getCatalogSpecSummary(product, officialProducts);
    for (const [field, value] of Object.entries({ displayName: name, familyName: displayFamilyName(product), execution, subtype: displaySubtype(product), memberLabel: catalogMemberLabel(product), warnings: catalogSourceWarnings(product, officialProducts), description, intro, specifications, compactSpecifications: specifications.map(row => compactCatalogSpecValue(row)), displayRows: categoryDisplayRows(product.category) })) visit(value, `${root}.${field}`);
    for (const key of ['power', 'voltage', 'cooling', 'installation', 'current', 'subtype', 'function', 'manufacturer']) {
      for (const value of facetValues(product, key)) {
        add(value, `${root}.facet.${key}`);
        add(displayExecutionValue(value), `${root}.facet.${key}.displayValue`);
      }
    }
    // SpecificationTable renders each semicolon-separated block module as its own text node.
    for (const field of ['technicalSpecs', 'variantSpecs']) {
      for (const [rowIndex, row] of (product[field] || []).entries()) {
        if (row.label !== 'Блок-модули') continue;
        const modules = String(row.value ?? '').split(';').map(value => value.trim()).filter(Boolean);
        if (modules.length > 1) modules.forEach((module, index) => add(module, `${root}.${field}[${rowIndex}].module[${index}]`));
      }
    }
    for (const [index, configuration] of (product.configurations || []).entries()) {
      const label = catalogConfigurationLabel(configuration, index);
      const designation = configuration.designation || label;
      const qualifier = label === designation ? '' : label.startsWith(`${designation} · `) ? label.slice(designation.length + 3) : label;
      add(label, `${root}.configuration[${index}].displayLabel`);
      add(qualifier, `${root}.configuration[${index}].displayQualifier`);
    }
  }
  visit(categories, 'catalog:categories');
  visit(equipmentTypes, 'catalog:equipmentTypes');
  const index = JSON.parse(readFileSync(path.join(frontend, 'lib/public/materials-index.json'), 'utf8'));
  for (const entry of index.items) {
    const material = JSON.parse(readFileSync(path.join(frontend, `lib/public/materials/${entry.id}.json`), 'utf8'));
    add(entry.title, `archive:${entry.id}.indexTitle`);
    add(material.title, `archive:${entry.id}.title`);
    add(material.copyright, `archive:${entry.id}.copyright`);
    visit(material.blocks, `archive:${entry.id}.blocks`);
    for (const attachment of material.attachments || []) add(attachment.title, `archive:${entry.id}.attachment`);
  }
  const thumbnails = JSON.parse(readFileSync(path.join(frontend, 'lib/public/material-thumbnails.json'), 'utf8'));
  for (const [id, image] of Object.entries(thumbnails)) add(image.alt, `archive:${id}.thumbnailAlt`);
  // Catalog photos and product illustrations contribute visible captions and accessible labels.
  for (const name of ['photography-manifest.json', 'media-manifest.json', 'ntmi-source-preview-manifest.json']) {
    const manifest = JSON.parse(readFileSync(path.join(frontend, `lib/catalog/${name}`), 'utf8'));
    function labels(value, location) {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (['alt', 'caption', 'label', 'title', 'note'].includes(key)) add(item, `${location}.${key}`);
        else if (item && typeof item === 'object') labels(item, `${location}.${key}`);
      }
    }
    labels(manifest, `catalog:${name}`);
  }
  return sources;
}

export function translationCoverageForSources(sources, dictionaries, archiveDictionaries = {}) {
  const locales = ['kk', 'en', 'zh', 'uz'];
  const keys = [...sources.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
  const catalogKeys = keys.filter(key => [...sources.get(key)].some(location => location.startsWith('catalog:')));
  const archiveKeys = keys.filter(key => [...sources.get(key)].some(location => location.startsWith('archive:')));
  const has = (dictionary, locale, key) => Boolean(dictionary[locale]?.[key]?.trim());
  // Catalog clients must never depend on the server-only archive dictionary.
  const catalogMissing = Object.fromEntries(locales.map(locale => [locale, catalogKeys.filter(key => !has(dictionaries, locale, key))]));
  const archiveMissing = Object.fromEntries(locales.map(locale => [locale, archiveKeys.filter(key => !has(dictionaries, locale, key) && !has(archiveDictionaries, locale, key))]));
  const missing = Object.fromEntries(locales.map(locale => [locale, [...new Set([...catalogMissing[locale], ...archiveMissing[locale]])]]));
  return { keys, missing, catalogMissing, archiveMissing };
}

export function localizationCoverage(dictionaries, archiveDictionaries = {}) {
  const sources = inventoryLocalizationSources();
  const coverage = translationCoverageForSources(sources, dictionaries, archiveDictionaries);
  return { catalogRecords: officialProducts.length, archiveRecords: JSON.parse(readFileSync(path.join(frontend, 'lib/public/materials-index.json'), 'utf8')).items.length, sourceCount: coverage.keys.length, ...coverage, locations: Object.fromEntries([...sources].map(([key, locations]) => [key, [...locations]])) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dictionaries = JSON.parse(readFileSync(path.join(frontend, 'lib/i18n/dictionaries.json'), 'utf8'));
  const archivePath = path.join(frontend, 'lib/i18n/archive-dictionaries.json');
  const archiveDictionaries = existsSync(archivePath) ? JSON.parse(readFileSync(archivePath, 'utf8')) : {};
  const report = localizationCoverage(dictionaries, archiveDictionaries);
  const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
  const keysOutput = process.argv.find(arg => arg.startsWith('--keys='))?.slice(7);
  for (const [destination, value] of [[output, report], [keysOutput, report.keys]]) if (destination) { mkdirSync(path.dirname(path.resolve(destination)), { recursive: true }); writeFileSync(destination, JSON.stringify(value, null, 2) + '\n'); }
  console.log(JSON.stringify({ catalogRecords: report.catalogRecords, archiveRecords: report.archiveRecords, sourceCount: report.sourceCount, missing: Object.fromEntries(Object.entries(report.missing).map(([locale, keys]) => [locale, keys.length])), catalogMissing: Object.fromEntries(Object.entries(report.catalogMissing).map(([locale, keys]) => [locale, keys.length])), archiveMissing: Object.fromEntries(Object.entries(report.archiveMissing).map(([locale, keys]) => [locale, keys.length])) }, null, 2));
  if (process.argv.includes('--check') && Object.values(report.missing).some(keys => keys.length)) process.exitCode = 1;
}
