// Bounded, repeatable identity completion. This never updates existing source rows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readInventories, adaptInventories, common, scalarSpecs, normalizeSpec, familyKey, objectDigest, digest } from './catalog/transformer-adapter.mjs';
import { baselineOfficialProducts } from '../frontend/lib/catalog/data.js';
import { transformerRecordShape, recordShapeDigest } from '../frontend/lib/catalog/models/transformer2026Shape.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative)));
const review = 'docs/catalog-transformers-2026/review/identity-completion';
const approval = read(`${review}/clearance.json`);
assert.equal(approval.format, 'alageum-identity-completion-clearance-v1');
assert.equal(approval.status, 'approved-bounded-identity-representation');
for (const [file, expected] of Object.entries(approval.evidenceSha256)) {
  assert.match(file, /^[a-z-]+\.json$/);
  assert.equal(digest(fs.readFileSync(path.join(root, review, file))), expected, `Changed identity evidence: ${file}`);
}
const source = read('docs/catalog-transformers-2026/review/source-manifest.json');
assert.equal(source.sha256, approval.sourceSha256);
const sections = readInventories(path.join(root, 'docs/catalog-transformers-2026/review'));
const reviewed = structuredClone(sections);
for (const section of reviewed) if (section.inventory.source?.filePath) delete section.inventory.source.filePath;
assert.equal(objectDigest(reviewed), approval.inventorySha256, 'Changed reviewed source inventories');
const original = adaptInventories(sections, source, baselineOfficialProducts);
const base = [...baselineOfficialProducts, ...original.records];
assert.equal(base.length, 823);
const baselineById = new Map(base.map(row => [row.id, row]));
const sourceModels = new Map(sections.flatMap(section => section.inventory.models).map(row => [row.id, row]));
const sourceFamilies = new Map(sections.flatMap(section => section.inventory.families).map(row => [row.id, row]));
const held = read(`${review}/held-source-records.json`);
for (const { reviewFile: _reviewFile, ...row } of held) assert.equal(objectDigest(row), objectDigest(sourceModels.get(row.id)), `Changed held row: ${row.id}`);
const findings = new Map(read(`${review}/overlap-findings.json`).findings.map(row => [row.heldId, row]));
assert.equal(approval.actions.length, 32);
assert.equal(new Set(approval.actions.map(row => row.sourceRecordId)).size, 32);
assert.deepEqual(approval.actions.map(row => row.sourceRecordId).sort(), original.identity.held.map(row => row.id).sort());

// Independent UUIDv5 keeps generation available in frontend-only checkouts.
function importedProductId(key) {
  const bytes = createHash('sha1').update(Buffer.from('541788eefbf04d859d33e593b82f303c', 'hex')).update(`product:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const records = [], panels = [], aliases = {}, guards = {}, familyMembers = {};
function guard(record) {
  return guards[record.id] ||= { recordShapeSha256: recordShapeDigest(transformerRecordShape(record)), databaseId: importedProductId(record.id), comparisonIds: [], relatedReferences: [] };
}
const labels = { powerKva: 'Номинальная мощность', nominalVoltageRaw: 'Номинальное напряжение', group: 'Группа соединения обмоток', lossP0: 'Потери холостого хода', lossPk: 'Потери короткого замыкания', UkPct: 'Напряжение короткого замыкания', I0Pct: 'Ток холостого хода', Lmm: 'L', Bmm: 'B', Hmm: 'H', massKg: 'Масса', oilKg: 'Масса масла', hvKv: 'ВН', lvKv: 'НН основная', additionalLvKv: 'НН дополнительная', class05VA: 'Мощность в классе 0,5', class10VA: 'Мощность в классе 1,0', class30VA: 'Мощность в классе 3,0', maximumPowerValue: 'Максимальная мощность', maximumPowerUnit: 'Единица максимальной мощности', ratedPowerHeader: 'Заголовок номинальной мощности' };
// Units belong to each primary source. In particular, a missing PDF dimension
// unit must not erase the website's explicit mm header. NTMI's printed anomaly
// is preserved rather than silently corrected or borrowed from the PDF.
const legacyUnits = Object.freeze({ powerKva: 'кВА', group: '', UkPct: '%', I0Pct: '%',
  Lmm: 'мм', Bmm: 'мм', Hmm: 'мм', oilKg: 'кг', massKg: 'кг',
  hvKv: 'кВ', lvKv: 'кВ', additionalLvKv: 'кВ',
  class05VA: 'кА (заголовок сайта)', class10VA: 'кА (заголовок сайта)', class30VA: 'кА (заголовок сайта)', maximumPowerValue: 'ВА' });
for (const action of approval.actions) {
  assert.ok(['execution', 'alias', 'source-comparison'].includes(action.mode));
  const row = sourceModels.get(action.sourceRecordId), finding = findings.get(action.sourceRecordId);
  const legacy = baselineById.get(action.legacyId), family = sourceFamilies.get(row?.familyId);
  assert.ok(row && finding && legacy && family, `Unknown identity action ${action.sourceRecordId}`);
  assert.equal(finding.legacyId, legacy.id);
  assert.ok(row.candidateOldIds.includes(legacy.id));
  const own = common(row, family, source);
  const configurations = original.configurations.filter(config => config.modelId === row.id);
  if (action.mode === 'execution') {
    assert.equal(finding.recommendation.action, 'admit_explicit_execution_under_new_id');
    assert.equal(action.canonicalId, row.id);
    assert.ok(row.execution, 'Execution admissions require an explicit source label');
    assert.ok(!baselineById.has(row.id));
    const parent = baselineById.get(familyKey(row.familyId));
    assert.ok(parent, 'Identity completion must not invent a new family card');
    const technicalSpecs = [...own.technicalSpecs, ...parent.technicalSpecs.filter(spec => !own.technicalSpecs.some(ownSpec => objectDigest(spec) === objectDigest(ownSpec)))];
    const record = scalarSpecs({ ...own, id: row.id, name: row.name.includes(row.execution) ? row.name : `${row.name} · ${row.execution}`,
      recordKind: 'variant', recordType: 'catalog-model', familyId: parent.id, familyName: parent.name,
      series: typeof row.series === 'string' ? row.series : parent.series, subtype: row.execution,
      description: family.descriptionSource?.text || '', variantSpecs: own.technicalSpecs, technicalSpecs,
      sourcePages: [...new Set([...own.sourcePages, ...technicalSpecs.map(spec => spec.page), ...own.manufacturerEvidencePages])].sort((a, b) => a - b),
      configurations, notes: [...new Set([...own.notes, ...parent.notes])],
    });
    records.push(record);
    guard(record).relatedReferences.push({ id: legacy.id, name: legacy.name, relation: action.relation, sourceUrl: legacy.sourceUrl });
    guard(legacy).relatedReferences.push({ id: record.id, name: record.name, relation: action.relation, sourceUrl: record.sourceUrl });
    (familyMembers[parent.id] ||= []).push(record.id);
  } else {
    assert.equal(action.canonicalId, legacy.id);
    if (action.mode === 'alias') {
      assert.equal(finding.exactAliasSupported, true);
      assert.equal(action.relation, 'same_catalog_model');
      aliases[row.id] = legacy.id;
    } else assert.equal(finding.exactAliasSupported, false);
    const comparedSpecs = finding.comparedSpecs.map(spec => {
      assert.ok(Object.hasOwn(legacyUnits, spec.field), `Unreviewed legacy source unit: ${spec.field}`);
      return { ...spec, label: labels[spec.field] || spec.field,
        newUnit: finding.newCatalogFingerprint[spec.field]?.unit ?? '', legacyUnit: legacyUnits[spec.field] };
    });
    const conflicts = finding.contradictions.map(spec => ({ ...spec, label: labels[spec.field] || spec.field }));
    const notes = [...own.notes];
    if (action.mode === 'alias') notes.push('Максимальная мощность: каталог печатает кВА, сайт — ВА; числа совпадают. Заголовок номинальной мощности на сайте печатает кА, каталог — ВА. Единицы сохранены по источникам; нормализованная мощность в кВА не определена.');
    else notes.push('Источники относятся к одной серии или обозначению. Совпадение конкретного исполнения не установлено; значения каждого источника показаны отдельно.');
    if (legacy.id === 'cat-shtz') notes.push('Страница 86 не указывает напряжение шкафа, габариты, массу, климатическое исполнение или IP. Параметры старого каталога не перенесены в описание 2026 года.');
    const familySpecs = (family.technicalSpecs || []).map(normalizeSpec);
    panels.push({ id: row.id, canonicalId: legacy.id, relation: action.relation, representation: action.mode,
      designation: own.designation, execution: own.execution, sourceId: own.sourceId, sourceFileId: own.sourceFileId,
      sourceSha256: own.sourceSha256, sourceTitle: own.sourceTitle, sourceUrl: own.sourceUrl,
      sourcePages: [...new Set([...own.sourcePages, ...familySpecs.map(spec => spec.page)])].sort((a, b) => a - b),
      sourceRow: own.sourceRow, sourceFamilyId: own.sourceFamilyId, sourceRecordType: own.sourceRecordType,
      technicalSpecs: own.technicalSpecs, familySpecs, description: family.descriptionSource?.text || '', rawSourceSpecs: own.rawSourceSpecs, configurations,
      power: row.familyId === 'ntmi' ? null : scalarSpecs({ ...own }).power, manufacturer: own.manufacturer,
      notes, comparison: { legacySourceUrl: legacy.sourceUrl, legacySourceTitle: legacy.sourceTitle || 'Публичная страница производителя',
        legacySourcePages: legacy.sourcePages || [], comparedSpecs, conflicts, unresolved: finding.remainingDecision,
        finding: finding.finding, exactOrderableSkuProven: false, citations: finding.citations },
    });
    guard(legacy).comparisonIds.push(row.id);
  }
}
assert.equal(records.length, 20); assert.equal(panels.length, 12); assert.equal(Object.keys(aliases).length, 2);
assert.equal(panels.filter(panel => panel.representation === 'source-comparison').length, 10);
assert.ok(panels.filter(panel => panel.representation === 'alias').every(panel => panel.power === null));
assert.equal(new Set([...base, ...records].map(row => row.id)).size, 843);
const counts = { baselineRecordCount: 823, executionAdmissions: 20, aliases: 2, sourceComparisons: 10, sourcePanels: 12, newFamilyCards: 0, resultRecordCount: 843,
  admissionConfigurations: records.reduce((sum, row) => sum + row.configurations.length, 0), panelConfigurations: panels.reduce((sum, row) => sum + row.configurations.length, 0) };
const metadata = { format: 'alageum-identity-completion-v1', sourceId: 'transformers-2026', sourceFileId: source.source_file_id,
  sourceSha256: source.sha256, inventorySha256: approval.inventorySha256, approvalSha256: objectDigest(approval),
  baselineRecordsSha256: objectDigest(base), recordsSha256: objectDigest(records), panelsSha256: objectDigest(panels),
  counts, aliases, actions: approval.actions, familyMembers, guards };
const outputs = new Map();
const bytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const destination = 'docs/catalog-transformers-2026/completion';
function chunks(name, values) {
  const parts = []; let pending = [];
  const flush = () => {
    if (!pending.length) return;
    const stem = `${name}-${String(parts.length + 1).padStart(3, '0')}`, content = bytes(pending);
    assert.ok(content.length < 74000);
    outputs.set(`${destination}/${stem}.json`, content);
    outputs.set(`frontend/lib/catalog/identity-completion-data/${stem}.js`, Buffer.from(`// Generated by scripts/complete-catalog-identities.mjs.\nconst data = ${JSON.stringify(pending, null, 2)};\nexport default data;\n`));
    parts.push({ path: `${stem}.json`, recordCount: pending.length, bytes: content.length, sha256: digest(content) }); pending = [];
  };
  for (const value of values) { if (pending.length && bytes([...pending, value]).length >= 73800) flush(); pending.push(value); } flush();
  return parts;
}
metadata.recordChunks = chunks('records', records); metadata.panelChunks = chunks('panels', panels);
outputs.set(`${destination}/manifest.json`, bytes(metadata));
outputs.set('frontend/lib/catalog/identity-completion-data/manifest.json', bytes(metadata));
for (const [relative, content] of [...outputs]) if (relative.startsWith(destination)) outputs.set(relative.replace(destination, 'backend-node/data/catalog-identity-completion'), content);
const imports = [...metadata.recordChunks, ...metadata.panelChunks].map((chunk, i) => `import part${i} from './identity-completion-data/${chunk.path.replace('.json', '.js')}';`);
outputs.set('frontend/lib/catalog/identityCompletionData.js', Buffer.from(`// Generated by scripts/complete-catalog-identities.mjs.\n${imports.join('\n')}\nexport const identityCompletionProducts = [${metadata.recordChunks.map((_, i) => `...part${i}`).join(',')}];\nexport const catalogSourceComparisons = [${metadata.panelChunks.map((_, i) => `...part${i + metadata.recordChunks.length}`).join(',')}];\n`));
const release = read('backend-node/data/catalog-release.json');
release.recordCount = 843;
release.sources.identityCompletion = { recordCount: 20, aliases: 2, sourceComparisons: 10, sourcePanels: 12, sourceId: 'transformers-2026', approvalSha256: metadata.approvalSha256, recordsSha256: metadata.recordsSha256, manifestSha256: digest(bytes(metadata)) };
outputs.set('backend-node/data/catalog-release.json', bytes(release));
for (const directory of [destination, 'backend-node/data/catalog-identity-completion', 'frontend/lib/catalog/identity-completion-data']) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) continue;
  for (const name of fs.readdirSync(absolute).filter(name => /^(records|panels)-\d{3}\.(json|js)$/.test(name))) {
    if (outputs.has(`${directory}/${name}`)) continue;
    if (check) throw new Error(`Stale identity completion shard: ${directory}/${name}`);
    fs.unlinkSync(path.join(absolute, name));
  }
}
for (const [relative, content] of outputs) {
  const file = path.join(root, relative);
  if (check) assert.equal(digest(fs.readFileSync(file)), digest(content), `Stale identity completion: ${relative}`);
  else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
}
console.log(JSON.stringify({ ...counts, baselineRecordsSha256: metadata.baselineRecordsSha256, recordsSha256: metadata.recordsSha256, panelsSha256: metadata.panelsSha256, outputFiles: outputs.size }, null, 2));
