// Lossless, identity-conservative adapter. Review inputs are evidence, not orderable SKUs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export const SOURCE_ID = 'transformers-2026';
export const SECTIONS = ['section-006-045', 'section-046-101', 'section-102-187'];
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const objectDigest = value => digest(JSON.stringify(canonical(value)));
const unique = values => [...new Set(values)];
const pages = values => unique(values).sort((a,b) => a-b);
export const familyKey = id => `tr2026-family-${id.toLowerCase()}`;
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function readChunkList(directory, name) {
  const index = json(path.join(directory, `${name}.json`));
  if (Array.isArray(index)) return index;
  assert.equal(index.format, 'alageum-transformer-review-chunks-v1');
  const records = index.chunks.flatMap(chunk => {
    assert.match(chunk.path, /^[a-z]+-\d{3}\.json$/);
    const bytes = fs.readFileSync(path.join(directory, chunk.path));
    assert.equal(digest(bytes), chunk.sha256, `Stale review chunk: ${chunk.path}`);
    assert.equal(bytes.length, chunk.bytes);
    const rows = JSON.parse(bytes); assert.equal(rows.length, chunk.recordCount); return rows;
  });
  assert.equal(records.length,index.recordCount); return records;
}
export function readInventories(root) {
  return SECTIONS.map(section => {
    const dir = path.join(root, section);
    const inventory = fs.existsSync(path.join(dir,'inventory.json')) ? json(path.join(dir,'inventory.json')) : {
      ...json(path.join(dir,'metadata.json')),
      families: readChunkList(dir,'families'), models: readChunkList(dir,'models'), configurations: readChunkList(dir,'configurations'),
    };
    return { section, inventory, ledger: json(path.join(dir,'page-ledger.json')), assets: json(path.join(dir,'asset-families.json')) };
  });
}
function notesFor(row) {
  return unique([...(row.notes || []), ...(row.uncertainties || [])].map(n => typeof n === 'string' ? n : JSON.stringify(n)));
}
export function normalizeSpec(spec) {
  assert.equal(typeof spec.label,'string');
  assert.ok(typeof spec.value === 'string' || typeof spec.value === 'number');
  assert.ok(Number.isInteger(spec.page) && spec.page >= 1 && spec.page <= 187, `Invalid spec physical page ${JSON.stringify(spec)}`);
  assert.ok(spec.unit == null || typeof spec.unit === 'string');
  return { ...spec, value:String(spec.value), unit: spec.unit ?? '', ...(spec.unit == null ? { sourceUnit: spec.unit ?? null, unitStatus:'not-stated' } : {}) };
}
function classification(row,family) {
  if (row.productKind === 'reactor' || family.productKind === 'reactor') return {category:'reactors',productKind:'reactor'};
  if (row.recordType === 'accessory' || family.id === 'dry-accessories') return {category:'accessories',productKind:'accessory'};
  return {category:'transformers',productKind:row.productKind || family.productKind || 'transformer'};
}
export function common(row,family,source) {
  const sourcePages = pages(row.sourcePages || []);
  assert.ok(sourcePages.length && sourcePages.every(p => Number.isInteger(p) && p >= 1 && p <= source.page_count), `Invalid source pages ${row.id}`);
  const technicalSpecs = (row.technicalSpecs || []).map(normalizeSpec);
  for (const spec of technicalSpecs) assert.ok(sourcePages.includes(spec.page), `${row.id} spec page ${spec.page} missing from provenance`);
  const manufacturerPages = row.manufacturerEvidencePages || (row.manufacturer === 'АО «КТЗ»' ? [32] : family.manufacturer === 'ТОО «Asia Trafo»' ? [166] : []);
  return {
    ...classification(row,family), sku:null, designation:row.designation || row.modelDesignationRaw || row.sourceDesignation || row.title,
    execution:row.execution || row.variantLabel || '', source:'official', sourceKind:'supplied-pdf', sourceId:SOURCE_ID,
    sourceFileId:source.source_file_id, sourceSha256:source.sha256, sourceUrl:source.url,
    sourceTitle:'Технический каталог трансформаторов · 18.03.2026', sourcePages,
    sourceRow: row.sourceRow || null, sourceFamilyId:family.id, sourceRecordType:row.recordType || 'explicit-model-row',
    manufacturer:row.manufacturer || null, manufacturers:row.manufacturer ? [row.manufacturer] : [], manufacturerEvidencePages:manufacturerPages,
    brand:row.brand || null, isOrderableSku:false,
    power:null, voltage:null, voltageUnit:'', cooling:null, installation:null,
    technicalSpecs, notes:notesFor(row),
    image:`/catalog-source/${SOURCE_ID}/page-${String(sourcePages[0]).padStart(3,'0')}.webp`,
    imageSourcePage:sourcePages[0], imageCaption:`Страница ${sourcePages[0]} исходного каталога; не фотография изделия`, documentCount:1,
    rawSourceSpecs:row.rawSourceSpecs || row.rawSpecs || row.technicalSpecs || [],
  };
}
export function scalarSpecs(record) {
  const power = record.technicalSpecs.find(s => /^Номинальная мощность$/.test(s.label) && s.unit === 'кВА');
  if (power && /^\d+(?:[.,]\d+)?$/.test(power.value)) record.power=Number(power.value.replace(',','.'));
  const voltage = record.technicalSpecs.find(s => /^Номинальное напряжение$/.test(s.label) && ['В','кВ'].includes(s.unit));
  if(voltage) { record.voltage=voltage.value; record.voltageUnit=voltage.unit; }
  const installation = record.technicalSpecs.find(s => s.label === 'Установка');
  if(installation) record.installation=installation.value;
  return record;
}
function configuration(row,model) {
  const sourcePages=pages(row.sourcePages || [row.page]);
  const specifications=(row.technicalSpecs || []).map(normalizeSpec);
  // Connection columns were individually transcribed and aligned; retain only those printed choices.
  if(row.connectionGroupRaw != null) {
    const specs=model?.technicalSpecs || [];
    for(const [key,label,pattern] of [['connectionGroupRaw','Группа соединения обмоток',/Группа соединения/],['PkWRaw','Рк',/^(?:Рк|Pk|Pк)$/],['UkPercentRaw','U к',/^U ?к$/]]) {
      const raw=specs.find(s=>pattern.test(s.label));
      if(row[key] != null) specifications.push(normalizeSpec({label,value:row[key],unit:raw?.unit ?? null,page:row.page}));
    }
  }
  return {
    id:row.id, designation:row.designation || row.configurationLabel || row.connectionGroupRaw || row.kind,
    kind:'configuration', sourceKind:row.kind || row.recordType || 'printed-connection-option',
    modelId:row.modelId || null, page:sourcePages[0], sourcePages, specifications,
    isOrderableSku:false, sourceRow:row.sourceRow || null,
    rawSource:row, notes:notesFor(row),
  };
}
export function adaptInventories(sections,source,oldRecords) {
  const oldIds = new Set(oldRecords.map(r=>r.id));
  const allModels=sections.flatMap(s=>s.inventory.models);
  const allFamilies=sections.flatMap(s=>s.inventory.families);
  const allConfigurations=sections.flatMap(s=>s.inventory.configurations);
  for(const [label,rows] of [['model',allModels],['family',allFamilies],['configuration',allConfigurations]]) assert.equal(new Set(rows.map(r=>r.id)).size, rows.length,`Duplicate ${label} identity`);
  const held=allModels.filter(r=>r.candidateOldIds?.length);
  held.forEach(row=>row.candidateOldIds.forEach(id=>assert.ok(oldIds.has(id), `Unknown old candidate ${id}`)));
  const heldIds=new Set(held.map(r=>r.id));
  const models=allModels.filter(r=>!heldIds.has(r.id));
  const modelMap=new Map(allModels.map(r=>[r.id,r]));
  const families=new Map(allFamilies.map(r=>[r.id,r]));
  const records=[]; const skippedFamilies=[];
  const configs=allConfigurations.map(row=>configuration(row,modelMap.get(row.modelId)));
  for(const family of allFamilies) {
    const sourceModels=allModels.filter(r=>r.familyId===family.id);
    const admitted=sourceModels.filter(r=>!heldIds.has(r.id));
    const familyConfigurations=configs.filter(c=>allConfigurations.find(r=>r.id===c.id).familyId===family.id && (!c.modelId || !heldIds.has(c.modelId)));
    // A family with only unresolved old identities must not create a second catalog card.
    if(sourceModels.length && !admitted.length) { skippedFamilies.push(family.id); continue; }
    const familyPages=pages([...(family.sourcePages || []),...admitted.flatMap(r=>r.sourcePages),...familyConfigurations.flatMap(c=>c.sourcePages)]);
    const parent=scalarSpecs({ ...common({...family,sourcePages:familyPages},family,source),id:familyKey(family.id),name:family.title || family.headingRaw || family.designation,
      recordKind:'family',recordType:'catalog-family',sourceRecordType:sourceModels.length?'family':'configuration-family',
      series:family.seriesRaw || family.designation || family.title,subtype:family.execution || family.variantLabel || '',
      description:family.descriptionSource?.text || '',variantIds:admitted.map(r=>r.id),configurations:familyConfigurations,
    });
    records.push(parent);
    for(const row of admitted) {
      assert.ok(!oldIds.has(row.id),`New identity collides with old ${row.id}`);
      const own=common(row,family,source);
      const technicalSpecs=[...own.technicalSpecs,...parent.technicalSpecs.filter(s=>!own.technicalSpecs.some(t=>objectDigest(s)===objectDigest(t)))];
      const sourcePages=pages([...own.sourcePages,...technicalSpecs.map(s=>s.page),...own.manufacturerEvidencePages]);
      records.push(scalarSpecs({...own,id:row.id,name:row.name || row.designation,recordKind:'variant',recordType:row.recordType==='accessory'?'catalog-accessory':row.recordType==='drawing-only-model'?'catalog-drawing-label':'catalog-model',
        familyId:parent.id,familyName:parent.name,series:typeof row.series==='string'?row.series:parent.series,subtype:row.execution || '',
        description:family.descriptionSource?.text || '',variantSpecs:own.technicalSpecs,technicalSpecs,sourcePages,
        configurations:familyConfigurations.filter(c=>c.modelId===row.id),notes:unique([...own.notes,...parent.notes]),
      }));
    }
  }
  assert.equal(new Set(records.map(r=>r.id)).size,records.length);
  for(const row of allModels) assert.ok(families.has(row.familyId),`Unknown family ${row.id}`);
  for(const row of allConfigurations) assert.ok(families.has(row.familyId),`Unknown configuration family ${row.id}`);
  const ledger=sections.flatMap(s=>Array.isArray(s.ledger)?s.ledger:s.ledger.pages);
  assert.deepEqual(ledger.map(p=>p.pdfPage),Array.from({length:182},(_,i)=>i+6));
  const identity={format:'alageum-transformer-identity-v1',sourceId:SOURCE_ID,oldRecordCount:oldRecords.length,oldRecordsSha256:objectDigest(oldRecords),oldIds:[...oldIds],admittedModelIds:models.map(r=>r.id),held:held.map(r=>({id:r.id,designation:r.designation,execution:r.execution,sourcePages:r.sourcePages,candidateOldIds:r.candidateOldIds,reason:'Identity unresolved; excluded from runtime cards and automatic merges'})),skippedFamilyIds:skippedFamilies,automaticMerges:[]};
  const metadata={format:'alageum-transformer-import-v1',sourceId:SOURCE_ID,title:'Технический каталог трансформаторов',edition:'18.03.2026',sourceFileId:source.source_file_id,sourceSha256:source.sha256,sourceUrl:source.url,pageCount:source.page_count,
    sourceFamilyCount:allFamilies.length,sourceModelVariationCount:allModels.length,sourceConfigurationCount:allConfigurations.length,heldModelCount:held.length,admittedModelCount:models.length,
    familyCount:records.filter(r=>r.recordKind==='family').length,recordCount:records.length,active:false,verifiedOrderableSkuCount:0,
    admittedConfigurationCount:configs.filter(c=>!c.modelId || !heldIds.has(c.modelId)).length,heldConfigurationCount:configs.filter(c=>heldIds.has(c.modelId)).length,
    coverage:Array.from({length:source.page_count},(_,i)=>{const page=i+1;const sourceEntry=ledger.find(p=>p.pdfPage===page);return {page,type:sourceEntry?.pageType || (page===1?'cover':page<6?'overview':'source-page'),families:records.filter(r=>r.recordKind==='family'&&r.sourcePages.includes(page)).map(r=>r.id),printedPage:sourceEntry?.printedPage ?? null,notes:sourceEntry?.notes || []};})};
  return {records,identity,metadata,configurations:configs};
}
