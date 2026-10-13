import { officialProducts as webOfficialProducts } from './official.js';
import { attachCatalogEditorial } from './catalogEditorial.js';
import { importedProducts, catalogImport } from './imported.js';
import { transformerProducts, transformerImport } from './transformers2026.js';
import { identityCompletionProducts } from './identityCompletionData.js';
import { resolveCatalogReadId } from './identityCompletion.js';
export { transformerProducts, transformerImport };
export { identityCompletionProducts };
export { webOfficialProducts, importedProducts, catalogImport };
const importedById = new Map(importedProducts.map(p => [p.id, p]));
export const baselineOfficialProducts = [...webOfficialProducts.map(p => importedById.has(p.id) ? { ...p, ...importedById.get(p.id), manufacturer: importedById.get(p.id).manufacturer ?? p.manufacturer, manufacturers: importedById.get(p.id).manufacturers?.length ? importedById.get(p.id).manufacturers : p.manufacturers, additionalSources: [{ url: p.sourceUrl, label: 'Публичная страница производителя' }] } : p), ...importedProducts.filter(p => !webOfficialProducts.some(w => w.id === p.id))];
export const officialProducts = [...baselineOfficialProducts, ...transformerProducts, ...identityCompletionProducts].map(attachCatalogEditorial);
// Synthetic UI fixtures only. These are not ALAGEUM products or technical recommendations.
// DEMO-001 preserves the identifier/name from backend/scripts/seed.py; its specs remain unknown.
export const categories = [
  { id: 'transformers', name: 'Трансформаторы', short: 'Трансформаторы' },
  { id: 'switchgear', name: 'Коммутация и распределение', short: 'Коммутация' },
  { id: 'substations', name: 'Комплектные подстанции', short: 'Подстанции' },
  { id: 'cabinets', name: 'Шкафы, щиты и управление', short: 'Шкафы и щиты' },
  { id: 'reactors', name: 'Реакторы', short: 'Реакторы' },
  { id: 'accessories', name: 'Принадлежности трансформаторов', short: 'Принадлежности' },
  { id: 'protection', name: 'Катодная защита и измерение', short: 'Защита и измерение' },
];

const fixture = (id, category, name, power, voltage, cooling, installation) => ({
  id, sku: `DEMO-${id.split('-')[1]}`, category, name, power, voltage, cooling, installation,
  source: 'demo', documentCount: 0,
  description: 'Синтетический пример для проверки поиска, фильтров и сравнения. Характеристики не относятся к реальной продукции ALAGEUM и не предназначены для проектирования.',
  image: category === 'transformers' ? '/brand/transformer.png' : null,
});

export const demoProducts = [
  fixture('demo-001', 'transformers', 'Demo Transformer A', null, null, null, null),
  fixture('demo-002', 'transformers', 'Демо · масляный трансформатор 630', 630, '10 / 0,4', 'Масляное', 'Наружная'),
  fixture('demo-003', 'transformers', 'Демо · масляный трансформатор 1000', 1000, '10 / 0,4', 'Масляное', 'Наружная'),
  fixture('demo-004', 'transformers', 'Демо · сухой трансформатор 1000', 1000, '10 / 0,4', 'Сухое', 'Внутренняя'),
  fixture('demo-005', 'transformers', 'Демо · сухой трансформатор 1600', 1600, '6 / 0,4', 'Сухое', 'Внутренняя'),
  fixture('demo-006', 'switchgear', 'Демо · распределительное устройство 6', null, '6', null, 'Внутренняя'),
  fixture('demo-007', 'switchgear', 'Демо · распределительное устройство 10', null, '10', null, 'Внутренняя'),
  fixture('demo-008', 'substations', 'Демо · комплектная подстанция 630', 630, '10 / 0,4', null, 'Наружная'),
  fixture('demo-009', 'substations', 'Демо · комплектная подстанция 1000', 1000, '10 / 0,4', null, 'Наружная'),
];

export const products = [...officialProducts, ...demoProducts];
export const productById = (id) => products.find((product) => product.id === resolveCatalogReadId(id));
export const categoryName = (id) => categories.find((category) => category.id === id)?.name || 'Без категории';
export const valueOrDash = (value, unit = '') => value === null || value === undefined || value === '' ? '—' : `${value}${unit ? ` ${unit}` : ''}`;
export const specRows = [
  { key: 'power', label: 'Номинальная мощность', unit: 'кВА' },
  { key: 'voltage', label: 'Напряжение', unit: 'кВ' },
  { key: 'cooling', label: 'Тип охлаждения' },
  { key: 'installation', label: 'Установка' },
  { key: 'manufacturer', label: 'Производители серии' },
];

export const recordKindLabel = (product) => product.sourceRecordType === 'configuration-family' ? 'Семейство табличных конфигураций' : product.sourceRecordType === 'drawing-only-model' ? 'Обозначение на чертеже' : product.sourceRecordType === 'accessory' ? 'Принадлежность' : product.recordKind === 'family' ? 'Серия / семейство' : product.recordKind === 'variant' ? 'Каталожное обозначение' : product.source === 'demo' ? 'Синтетический пример' : 'Справочная запись';
export const specUnit = (product, row) => row.key === 'voltage' ? (product.voltageUnit ?? row.unit) : row.unit;
