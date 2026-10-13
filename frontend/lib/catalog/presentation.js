import { editorialConfigurationLabel } from './catalogEditorial.js';
import { getAdditionalCatalogVariantIds } from './identityCompletion.js';
import { familyPresentationBindings, getFamilyPresentationEvidence } from './familyPresentation.js';
// Display helpers only. Never pass their strings back into source records or asset guards.
const hasValue = value => value != null && String(value).trim() !== '' && !/^[\s\-\u2010-\u2015\u2212]+$/.test(String(value));
const familyNames = new Map([
  ['ЗОМ — измерительный, railway', 'Измерительные трансформаторы ЗОМ'],
  ['ЗНОМ — nominal-winding-voltage option1', 'Измерительные трансформаторы ЗНОМ'],
]);
const executions = new Map([
  ['drawing-only row', 'Обозначение на чертеже'],
  ['standard', 'Стандартная комплектация'],
  ['optional', 'Дополнительная комплектация'],
  ['named only in small drawing table shared with НОМ-6', 'Обозначение в таблице чертежа совместно с НОМ-6'],
  ['измерительный, railway', 'Измерительный, для железной дороги'],
  ['nominal-winding-voltage option1', 'Номинальные напряжения обмоток: вариант 1'],
  ['nominal-winding-voltage option2', 'Номинальные напряжения обмоток: вариант 2'],
  ['generic named rating configurations; no explicit model code', 'Табличные параметры без обозначения отдельной модели'],
  ['35 kV', '35 кВ'],
]);
export const isCatalogFamily = product => product?.recordKind === 'family' || product?.recordType === 'official-catalog-family';
export const displayProductName = product => product?.catalogEditorial?.displayLabel || product?.catalogEditorial?.displayName || familyNames.get(product?.name) || product?.name || product?.designation || '';
export const displayFamilyName = product => familyNames.get(product?.familyName) || product?.familyName || '';
export const displayExecution = product => {
  if (product?.catalogEditorial && typeof product.catalogEditorial.displayExecution === 'string') return product.catalogEditorial.displayExecution;
  const value = product?.execution || product?.sourceRow?.variant || '';
  return executions.get(value) || value;
};
export const displayExecutionValue = value => executions.get(value) || value || '';
export const displaySubtype = product => displayExecutionValue(product?.subtype);
export const displaySpecLabel = label => label === 'Drawing grouped designation' ? 'Общее обозначение на чертеже' : label === 'nominalVoltageScope' ? 'Указанные напряжения' : label;

/** Only explicit, reciprocal relationships from the supplied catalog. Never hydrate an API row from static data. */
export function catalogFamilyMembers(product, records = []) {
  if (!isCatalogFamily(product)) return [];
  if ((product.sourceId === 'transformers-2026' || Object.hasOwn(familyPresentationBindings, product.id)) && !getFamilyPresentationEvidence(product)) return [];
  const ids = new Set([...(product.variantIds || []), ...getAdditionalCatalogVariantIds(product.id), ...(product.catalogEditorial?.navigationChildIds || [])]);
  return records.filter(member => ids.has(member.id) && member.familyId === product.id && !isCatalogFamily(member)
    && member.source === product.source && member.sourceId === product.sourceId
    && member.sourceFileId === product.sourceFileId && member.sourceSha256 === product.sourceSha256);
}

export function catalogEvidenceSpecs(product, key) {
  const predicates = {
    power: label => /мощност/i.test(label) && !/потребля|управляем|станции катодной|положение|ответвлен/i.test(label),
    voltage: label => /^(?:(?:Номинальн\S* |Первичн\S* |Вторичн\S* )?напряжени[ея]|Класс напряжения|ВН(?:\s|$)|НН(?:\s|$)|СН(?:\s|$))/i.test(label)
      && !/короткого|к\.з|регулирован|ступен|испытат/i.test(label),
    cooling: label => /^(?:Тип |Вид |Система |Способ )?охлаждени[ея]$/i.test(label),
    function: label => /^(?:Назначение|Применение|Функциональные исполнения)$/i.test(label),
  };
  return (product.technicalSpecs || []).filter(spec => predicates[key]?.(spec.label) && hasValue(spec.value));
}

export function formatEvidenceSpec(spec, { includeLabel = true, requireUnit = false } = {}) {
  const unit = spec.unit ? ` ${spec.unit}` : requireUnit ? ' (единица не указана)' : '';
  return `${includeLabel ? `${displaySpecLabel(spec.label)}: ` : ''}${spec.value}${unit}`;
}

export function displayRowReference(product) {
  const row = product.sourceRow;
  const page = row?.page || row?.pdfPage || row?.electricalTablePage;
  if (!page) return '';
  return `стр. ${page}${row.row != null ? `, строка ${row.row}` : ''}${row.voltageSubrow != null ? `, вариант напряжений ${row.voltageSubrow}` : ''}`;
}

export function catalogMemberLabel(product) {
  if (product.catalogEditorial?.displayLabel) return product.catalogEditorial.displayLabel;
  const voltage = catalogEvidenceSpecs(product, 'voltage').map(spec => formatEvidenceSpec(spec, { requireUnit: true }));
  return [product.designation || product.sku || displayProductName(product), displayExecution(product), ...voltage, displayRowReference(product)].filter(Boolean).join(' · ');
}

export function displayDescription(product, records = []) {
  if (hasValue(product.description)) return product.description;
  if (product.sourceKind !== 'supplied-pdf') return '';
  const name = displayProductName(product);
  if (isCatalogFamily(product)) {
    const members = catalogFamilyMembers(product, records);
    return `Семейство «${name}» в печатном каталоге.${members.length ? ` Связанных записей с отдельными характеристиками: ${members.length}. Выберите запись, чтобы увидеть её параметры и доступные материалы источника.` : product.configurations?.length ? ` Табличных строк: ${product.configurations.length}. Они приведены ниже отдельно; это параметры источника, а не отдельные модели.` : ' Параметры и исполнения приведены на страницах источника.'} Сводные значения относятся к разным записям; готовое сочетание параметров и артикул заказа не заданы.`;
  }
  const purpose = catalogEvidenceSpecs(product, 'function').map(spec => formatEvidenceSpec(spec));
  const electrical = ['power', 'voltage', 'cooling'].flatMap(key => catalogEvidenceSpecs(product, key).map(spec => formatEvidenceSpec(spec, { requireUnit: key !== 'cooling' })));
  const evidence = [...purpose, ...electrical.slice(0, 4)];
  const execution = displayExecution(product);
  return `${name}${execution ? ` · ${execution}` : ''}. ${evidence.length ? `${evidence.join('; ')}. ` : ''}Запись печатного каталога${displayRowReference(product) ? `: ${displayRowReference(product)}` : ''}. Комплектация и код заказа уточняются.${product.notes?.length ? ' Ограничения и несогласованности источника сохранены в примечаниях.' : ''}`;
}

/** Keep warnings visible when a family overview quotes any member's source values. */
export function catalogSourceWarnings(product, records = []) {
  const seen = new Set();
  return [product, ...catalogFamilyMembers(product, records)].flatMap(member => (member.notes || []).flatMap(note => {
    if (seen.has(note)) return [];
    seen.add(note);
    return [{ note, productId: member.id, designation: member.designation || member.sku || displayProductName(member) }];
  }));
}

/** A printed configuration stays a table row; it never becomes a product or a source of combined SKUs. */
export function catalogConfigurationLabel(configuration, index = 0) {
  const editorial = editorialConfigurationLabel(configuration);
  if (editorial) return editorial;
  const designation = configuration.designation || '';
  const printed = configuration.sourceRow?.variant || configuration.rawSource?.configurationLabel;
  const facts = ['voltage', 'power'].flatMap(key => catalogEvidenceSpecs({ technicalSpecs: configuration.specifications || [] }, key).map(spec => formatEvidenceSpec(spec, { requireUnit: true })));
  const qualifier = printed || facts.join(' · ');
  return [...new Set([designation, qualifier].filter(hasValue))].join(' · ') || `Строка таблицы ${index + 1}`;
}

export function catalogConfigurationEvidence(product, key) {
  if (!isCatalogFamily(product)) return [];
  if ((product.sourceId === 'transformers-2026' || Object.hasOwn(familyPresentationBindings, product.id)) && !getFamilyPresentationEvidence(product)) return [];
  return (product.configurations || []).flatMap((configuration, index) => catalogEvidenceSpecs({ technicalSpecs: configuration.specifications || [] }, key)
    .map(spec => ({ ...spec, configurationId: configuration.id || `row-${index + 1}`, configurationLabel: catalogConfigurationLabel(configuration, index) })));
}
