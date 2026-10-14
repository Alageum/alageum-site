import { catalogEvidenceSpecs, catalogConfigurationEvidence, catalogFamilyMembers, formatEvidenceSpec, displaySubtype, displayProductName, displayFamilyName } from './presentation.js';
// A presentation layer only: source records, their identities and evidence stay intact.
// This module deliberately does not import data.js, so both static and API callers can use it.
const present = (value) => value !== null && value !== undefined && value !== '';
const hasEvidence = (value) => present(value) && !/^[\s\-\u2010-\u2015\u2212]+$/.test(String(value));
const unique = (values) => [...new Set(values.filter(present).map(String))];
const compare = (a, b) => a.localeCompare(b, 'ru', { numeric: true });
const withUnit = (value, unit = '') => `${value}${unit ? ` ${unit}` : ''}`;
const isFamily = (product) => product.recordKind === 'family' || product.recordType === 'official-catalog-family';

// Navigation groups rows by a reusable equipment type; it does NOT merge their identities.
export const equipmentTypes = [
  { id: 'reactor', name: 'Реакторы', categories: ['reactors'] },
  { id: 'transformer-accessory', name: 'Принадлежности трансформаторов', categories: ['accessories'] },
  { id: 'oil-transformer', name: 'Масляные трансформаторы', categories: ['transformers'] },
  { id: 'dry-transformer', name: 'Сухие трансформаторы', categories: ['transformers'] },
  { id: 'instrument-transformer', name: 'Измерительные трансформаторы', categories: ['transformers'] },
  { id: 'substation', name: 'Комплектные подстанции', categories: ['substations'] },
  { id: 'modular-substation', name: 'Блочно-модульные здания и подстанции', categories: ['substations', 'cabinets'] },
  { id: 'pole-substation', name: 'Мачтовые и столбовые подстанции', categories: ['substations'] },
  { id: 'switchgear', name: 'Распределительные устройства и ячейки', categories: ['switchgear'] },
  { id: 'disconnector', name: 'Разъединители', categories: ['switchgear'] },
  { id: 'distribution-cabinet', name: 'Распределительные шкафы, щиты и ящики', categories: ['cabinets', 'switchgear'] },
  { id: 'control-cabinet', name: 'Шкафы и ящики управления', categories: ['cabinets'] },
  { id: 'compensation-cabinet', name: 'Шкафы компенсации', categories: ['cabinets'] },
  { id: 'protection-cabinet', name: 'Устройства электрохимической защиты', categories: ['protection'] },
  { id: 'metering-box', name: 'Контрольно-измерительные пункты', categories: ['protection'] },
];

export const catalogTaxonomy = [
  { id: 'reactors', name: 'Реакторы' },
  { id: 'accessories', name: 'Принадлежности трансформаторов' },
  { id: 'transformers', name: 'Трансформаторы' },
  { id: 'switchgear', name: 'Коммутация и распределение' },
  { id: 'substations', name: 'Комплектные подстанции' },
  { id: 'cabinets', name: 'Шкафы, щиты и управление' },
  { id: 'protection', name: 'Катодная защита и измерение' },
].map((category) => ({ ...category, subcategories: equipmentTypes.filter((type) => type.categories.includes(category.id)) }));

const rows = {
  power: { key: 'power', label: 'Мощность', unit: 'кВА' },
  voltage: { key: 'voltage', label: 'Напряжение', unit: '' },
  cooling: { key: 'cooling', label: 'Охлаждение', unit: '' },
  current: { key: 'current', label: 'Ток по каталогу', unit: '' },
  installation: { key: 'installation', label: 'Установка', unit: '' },
  subtype: { key: 'subtype', label: 'Тип оборудования', unit: '' },
  function: { key: 'function', label: 'Назначение', unit: '' },
};
const categoryKeys = {
  transformers: ['power', 'voltage', 'cooling'],
  reactors: ['voltage', 'subtype'],
  accessories: ['subtype', 'function'],
  substations: ['power', 'voltage', 'installation'],
  switchgear: ['voltage', 'current', 'installation'],
  cabinets: ['voltage', 'current', 'subtype'],
  protection: ['voltage', 'current', 'function'],
};

export function categorySpecRows(category) {
  return (categoryKeys[category] || ['voltage', 'installation', 'subtype']).map((key) => ({ ...rows[key] }));
}

/** Display fields can include reactive power without introducing a nominal-power facet. */
export function categoryDisplayRows(category) {
  const displayRows = categorySpecRows(category);
  if (category === 'reactors') displayRows.unshift({ ...rows.power, label: 'Мощность по источнику', unit: '' });
  return displayRows;
}

/** Navigation subtype only. Product silhouettes must use getEquipmentVisual(), not this heuristic. */
export function equipmentTypeFor(product = {}) {
  const family = product.familyProduct || product;
  const id = family.familyId || family.id || '';
  // Short editorial labels must not erase source evidence of the equipment type.
  const text = [displayProductName(family), displayFamilyName(family), family.name, family.familyName, family.series, family.subtype, family.installation].join(' ').toLocaleLowerCase('ru');
  if (family.productKind === 'reactor' || family.category === 'reactors') return 'reactor';
  if (family.category === 'accessories') return 'transformer-accessory';
  if (family.category === 'transformers') {
    const documentedInstrumentFamily = family.sourceId === 'transformers-2026' && ['zom', 'znom'].includes(family.sourceFamilyId);
    if (documentedInstrumentFamily || /нтми|измерительн/.test(text)) return 'instrument-transformer';
    const documentedDryFamily = family.sourceId === 'transformers-2026' && ['ts-low-voltage', 'tsi-tools', 'tsn-nomex'].includes(family.sourceFamilyId);
    return documentedDryFamily || family.cooling === 'Сухое' || /сухой|сухие|тсл/.test(text) ? 'dry-transformer' : 'oil-transformer';
  }
  if (family.category === 'substations') {
    if (/^cat-mtp|^cat-ktp-25-250$|^cat-ktpo-/.test(id) || /мачтов|столбов/.test(text)) return 'pole-substation';
    if (/^cat-bktp-|^cat-ktpb-k/.test(id) || /блочн|модульн|бетонн/.test(text)) return 'modular-substation';
    return 'substation';
  }
  if (family.category === 'switchgear') {
    if (/рлнд|разъединител/.test(text)) return 'disconnector';
    if (id === 'cat-vru') return 'distribution-cabinet';
    return 'switchgear';
  }
  if (family.category === 'protection') {
    return /^cat-(kik|skip)(-|$)/.test(id) || /контрольно-измерительн/.test(text) ? 'metering-box' : 'protection-cabinet';
  }
  if (/модульный блок контейнерного типа/.test(text)) return 'modular-substation';
  if (/компенсац|конденсаторн/.test(text)) return 'compensation-cabinet';
  if (/управлен|плавн.+пуск|русм/.test(text)) return 'control-cabinet';
  return 'distribution-cabinet';
}

/** Group only explicit family relationships or the same documented website series. */
export function groupProducts(records = []) {
  const families = new Map(records.filter(isFamily).map((product) => [product.id, product]));
  const declaredParent = new Map();
  for (const family of families.values()) {
    for (const id of family.variantIds || []) declaredParent.set(id, family.id);
  }
  const buckets = new Map();
  for (const product of records) {
    const parentId = families.has(product.familyId) ? product.familyId : declaredParent.get(product.id);
    const websiteSeries = product.source === 'official' && !product.recordKind && product.series && product.sourceUrl;
    const key = parentId || (isFamily(product) ? product.id : websiteSeries
      ? `website:${product.category}:${product.series}:${product.sourceUrl}` : `record:${product.id}`);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(product);
  }
  return [...buckets.values()].map((members) => {
    const familyProduct = members.find(isFamily) || null;
    const representative = familyProduct || members[0];
    const websiteSeries = !familyProduct && representative.source === 'official' && representative.series;
    const variants = members.filter((member) => !isFamily(member));
    const group = {
      ...representative,
      // Every detailId/id is already a valid product URL, including web-only series.
      id: representative.id,
      detailId: representative.id,
      name: familyProduct ? familyProduct.name : websiteSeries ? `Серия ${representative.series}` : representative.name,
      sku: familyProduct ? familyProduct.sku : websiteSeries ? representative.series : representative.sku,
      series: representative.series || representative.sku,
      isCatalogGroup: true,
      familyProduct,
      members,
      memberIds: members.map((member) => member.id),
      variants,
      variantIds: variants.map((member) => member.id),
      variantCount: variants.length,
      // Imported variants repeat family configurations as context; count the canonical list once.
      configurationCount: (familyProduct?.configurations || representative.configurations || []).length,
      // These arrays contain existing source objects/values; no source row is rewritten.
      configurations: familyProduct?.configurations || representative.configurations || [],
      sourcePages: [...new Set(members.flatMap((member) => member.sourcePages || []))].sort((a, b) => a - b),
      notes: unique(members.flatMap((member) => member.notes || [])),
    };
    // Never present a representative model's scalar as a specification of the whole series.
    for (const key of ['power', 'voltage', 'cooling', 'installation', 'manufacturer']) {
      const values = members.map((member) => member[key]).filter(present);
      group[key] = new Set(values).size === 1 ? values[0] : null;
    }
    group.equipmentType = equipmentTypeFor(group);
    return group;
  });
}

export function getFamilyForProduct(id, records = []) {
  const groups = records.some((record) => record.isCatalogGroup) ? records : groupProducts(records);
  return groups.find((group) => group.memberIds.includes(id)) || null;
}

const powerSpec = (spec) => /мощност/i.test(spec.label) && spec.unit === 'кВА'
  && !/потребля|управляем|станции катодной|предельн|классе|класс точности/i.test(spec.label);
const currentSpec = (spec) => /^(?:Номинальн(?:ый|ые) (?:выпрямленный |нормальный )?ток|Ток силовой цепи|Ток устройств ввода)/i.test(spec.label)
  && !/отключен|термич|электродинамич|пиков|кратковременн|трансформатор.*тока/i.test(spec.label);

function sourceRows(product, key) {
  const predicate = key === 'power' ? powerSpec : key === 'current' ? currentSpec : key === 'function'
    ? (spec) => /^(?:Назначение|Функциональные исполнения)$/.test(spec.label) : () => false;
  const specific = (product.variantSpecs || []).filter(predicate);
  const technical = specific.length ? specific : (product.technicalSpecs || []).filter(predicate);
  const configurations = product.recordKind === 'variant' ? [] : (product.configurations || []).flatMap((configuration) => (configuration.specifications || []).filter(predicate));
  return [...technical, ...configurations].filter((spec) => hasEvidence(spec.value));
}

function evidenceValues(product, key) {
  if (key === 'equipmentType') return [equipmentTypeFor(product)];
  if (key === 'voltage') return hasEvidence(product.voltage) ? [withUnit(product.voltage, product.voltageUnit ?? 'кВ')] : [];
  if (key === 'power') {
    if (hasEvidence(product.power)) return [String(product.power)];
    // Consumed power and motor power must never become a transformer-power facet.
    if (!['transformers', 'substations'].includes(product.category)) return [];
  }
  if (key === 'power' || key === 'current' || key === 'function') {
    if (hasEvidence(product[key])) return [String(product[key])];
    const values = sourceRows(product, key).flatMap((spec) => {
      // Split only explicitly printed semicolon lists; never expand a range or derive combinations.
      const parts = String(spec.value).split(';').map((part) => part.trim()).filter(hasEvidence);
      return parts.map((part) => key === 'power' ? part : withUnit(part, spec.unit));
    });
    if (key === 'function' && !values.length && hasEvidence(product.subtype)) values.push(product.subtype);
    return values;
  }
  return hasEvidence(product[key]) ? [String(product[key])] : [];
}

/** Values for facets. A filtered group uses only members that passed the other active filters. */
export function facetValues(productOrGroup, key) {
  let members = productOrGroup?.members || (Array.isArray(productOrGroup) ? productOrGroup : [productOrGroup]);
  if (productOrGroup?.matchingMemberIds) {
    const matching = new Set(productOrGroup.matchingMemberIds);
    members = members.filter((member) => matching.has(member.id));
  }
  return unique(members.filter(Boolean).flatMap((member) => evidenceValues(member, key))).sort(compare);
}

/** Compact category-aware display rows. Units are included in value, never guessed or converted. */
export function getCatalogSpecSummary(productOrGroup, records = [], category = productOrGroup?.category) {
  if (!productOrGroup) return [];
  const members = productOrGroup.members || [productOrGroup, ...catalogFamilyMembers(productOrGroup, records)];
  return categoryDisplayRows(category).map((row) => {
    const editorial = !productOrGroup.members && productOrGroup.catalogEditorial;
    if (row.key === 'voltage' && editorial && Array.isArray(editorial.voltageValues)) return { ...row, value: editorial.voltageDisplay, unit: '', values: [...editorial.voltageValues], sourceRows: editorial.voltageSourceRows || [] };
    const values = unique(members.flatMap((member) => {
      const source = [...catalogEvidenceSpecs(member, row.key), ...catalogConfigurationEvidence(member, row.key)];
      // Preserve winding, accuracy-class, reactive-power and unit labels. No unit conversion or cross-product combination.
      if (source.length && (member.sourceId === 'transformers-2026' || !hasEvidence(member[row.key]))) {
        return source.map(spec => `${spec.configurationId ? 'По строкам таблицы: ' : ''}${formatEvidenceSpec(spec, { requireUnit: ['power', 'voltage'].includes(row.key) })}`);
      }
      if (row.key === 'subtype') return hasEvidence(displaySubtype(member)) ? [displaySubtype(member)] : [];
      return evidenceValues(member, row.key).map(value => withUnit(value, row.unit));
    })).sort(compare);
    return {
      key: row.key,
      label: row.label,
      value: values.length ? values.join(' · ') : '—',
      unit: '',
      values,
      sourceRows: members.flatMap((member) => ([...catalogEvidenceSpecs(member, row.key), ...catalogConfigurationEvidence(member, row.key)].length ? [...catalogEvidenceSpecs(member, row.key), ...catalogConfigurationEvidence(member, row.key)] : sourceRows(member, row.key)).map((spec) => ({ ...spec, productId: member.id }))),
    };
  });
}

/** Keep list and hero summaries readable; full values remain in the detailed table. */
export function compactCatalogSpecValue(row, limit = 4) {
  return row?.values?.length > limit ? `${row.values.slice(0, limit).join(' · ')} · ещё ${row.values.length - limit} значений в записях` : row?.value || '—';
}
