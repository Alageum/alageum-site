import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import sharp from 'sharp';
import { transformer2026Types, transformer2026TypeIds, resolveTransformer2026Type } from '../lib/catalog/models/transformer2026Types.js';
import { createTransformer2026Geometry, disposeTransformer2026Geometry } from '../lib/catalog/models/transformer2026Geometry.js';
import { transformer2026IconDefinitions, renderTransformer2026Icon } from '../lib/catalog/models/transformer2026Icons.js';
import { transformer2026GroupTypes } from '../lib/catalog/models/transformer2026GroupMap.js';
import { transformer2026AssetEvidence as evidence, transformer2026RecordProposals as records, getTransformer2026ReviewAsset as get } from '../lib/catalog/models/transformer2026Bindings.js';
import { baselineOfficialProducts as officialProducts } from '../lib/catalog/data.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import oldBaseline from './fixtures/old-catalog-transformer-stability.json' with { type: 'json' };
const sourceExists = page => existsSync(new URL(`../public/catalog-source/transformers-2026/page-${String(page).padStart(3, '0')}.webp`, import.meta.url));

test('new evidence registry accounts for every source row, group and missing construction without activation', () => {
  assert.equal(evidence.activation, 'staging-only'); assert.equal(evidence.records.length, 540); assert.equal(new Set(evidence.records.map(record => record.sourceRecordId)).size, 540);
  assert.equal(evidence.groups.length, 87); assert.equal(transformer2026TypeIds.length, 62); assert.equal(Object.keys(transformer2026IconDefinitions).length, 67);
  assert.equal(evidence.counts.sourceRowsWithGroup, 343); assert.equal(evidence.counts.sourceRowsWithoutGroup, 197);
  assert.equal(evidence.counts.groupsWithGeometry, 78); assert.equal(evidence.counts.groupsWithIcon, 84);
  assert.equal(evidence.counts.heldOldIdentityRows, 32); assert.equal(evidence.counts.rowsWithGeometryChoice, 333);
  assert.equal(evidence.sourceSha256, '8f27b781f1ff620ce2d67f606d6e115f2d0c35fbd31698f04c392a8ae611c70e');
  assert.deepEqual(Object.keys(transformer2026GroupTypes).sort(), evidence.groups.map(group => group.id).sort());
  for (const row of evidence.records) { assert.equal(row.runtimeEligible, false); assert.equal(row.exactMeshReuseAllowed, false); assert.equal(row.dimensionAccurate, false); assert.equal(row.independentTableReviewRequired, true); assert.ok(row.reasons.length); }
});

test('accepted group evidence is pixel-reviewed, local, closed-allowlisted and attached to row-specific source pages', () => {
  for (const group of evidence.groups) {
    assert.equal(group.reviewedPixels, true); assert.equal(group.reviewedAt, '2026-10-05'); assert.ok(group.observations.length > 30);
    for (const page of group.sourcePages) assert.ok(sourceExists(page), `${group.id}/${page}`);
    for (const id of group.recordIds) assert.ok(records[id], `${group.id}/${id}`);
    if (group.geometryType) { const definition = transformer2026Types[group.geometryType]; assert.ok(definition); for (const page of group.sourcePages) assert.ok(definition.pages.includes(page), `${group.id}/${page}`); }
    if (group.iconType) assert.ok(transformer2026IconDefinitions[group.iconType]);
  }
  for (const row of evidence.records) for (const choice of row.choices) { assert.ok(choice.sourcePages.length, row.sourceRecordId); for (const page of choice.sourcePages) assert.ok(row.sourcePages.includes(page), row.sourceRecordId); }
});

test('proposals reuse visible construction across explicitly linked rows without inferring from category, ratings or arbitrary IDs', () => {
  assert.equal(get('alageum-tmg-standard-16').type, 'tr26-corrugated-small');
  assert.equal(get('alageum-tmg-standard-25').type, get('alageum-tmg-standard-16').type);
  assert.equal(get('alageum-2026-isolating-tmg-630').type, 'tr26-isolating');
  assert.notEqual(get('alageum-2026-isolating-tmg-630').type, get('alageum-tmg-standard-16').type);
  assert.equal(get({ id: 'alageum-tmg-standard-16', category: 'reactors', nominalPowerKva: 999999 }).type, 'tr26-corrugated-small');
  for (const id of ['alageum-tmg-standard-16-unreviewed', 'tmg-400', '__proto__', 'toString']) { assert.equal(get(id).type, null); assert.equal(get(id).iconType, null); }
  assert.equal(resolveTransformer2026Type('oil-transformer'), null);
  assert.throws(() => createTransformer2026Geometry('unverified-transformer'), RangeError);
  assert.equal(renderTransformer2026Icon('unverified-transformer'), null);
});

test('mixed executions have no silent default, accept only explicit source alternatives, and preserve cutaway distinctions', () => {
  const mixed = evidence.records.filter(row => row.status === 'execution-choice-required'); assert.equal(mixed.length, 32);
  for (const row of mixed) {
    assert.equal(get(row.sourceRecordId).type, null); assert.equal(get(row.sourceRecordId).iconType, null);
    assert.equal(get(row.sourceRecordId, 'unverified-enclosure').type, null);
    for (const choice of row.choices) { const result = get(row.sourceRecordId, choice.groupId); assert.equal(result.type, choice.geometryType); assert.equal(result.status, 'explicit-execution-proposal'); assert.equal(result.runtimeEligible, false); }
  }
  assert.notEqual(transformer2026GroupTypes['dry-tsl-open-6-10'], transformer2026GroupTypes['dry-tslz-enclosed-6-10']);
  assert.notEqual(transformer2026GroupTypes['dry-tsnz-mesh'], transformer2026GroupTypes['dry-tsnz-top-bushing']);
  assert.equal(evidence.groups.find(group => group.id === 'dry-tslz-enclosed-6-10').viewMode, 'illustrative-cutaway');
  assert.equal(evidence.groups.find(group => group.id === 'dry-tsnz-mesh').viewMode, 'illustrative-topology');
});

test('duplicate old identities, uncertain captions and source gaps cannot be bypassed by selecting a group', () => {
  for (const row of evidence.records.filter(row => ['old-identity-hold', 'execution-binding-unverified', 'source-evidence-needed'].includes(row.status))) {
    assert.equal(get(row.sourceRecordId).type, null, row.sourceRecordId); assert.equal(get(row.sourceRecordId).iconType, null, row.sourceRecordId); assert.equal(get(row.sourceRecordId).fallbackKind, 'source-document'); assert.match(get(row.sourceRecordId).fallbackLabel, /Нет подтвержденного/);
    for (const choice of row.choices) assert.equal(get(row.sourceRecordId, choice.groupId).type, null, row.sourceRecordId);
  }
  for (const row of evidence.records.filter(row => !row.evidenceGroupIds.length)) { assert.equal(row.choices.length, 0); assert.equal(row.selectedType, null); }
  assert.equal(transformer2026GroupTypes['photo-section-165'], null); assert.equal(transformer2026GroupTypes['photo-factory-166'], null); assert.equal(transformer2026GroupTypes['dry-tsi-unproven'], null);
  assert.equal(get('alageum-tmg-standard-400').status, 'old-identity-hold');
  assert.equal(get('alageum-tmgi-x4k3-63').status, 'execution-binding-unverified');
  assert.ok(Object.isFrozen(records)); assert.ok(Object.isFrozen(records['alageum-tmg-standard-16'].choices));
});

test('every illustrative mesh has finite bounded geometry, explicit scale disclaimer and reusable disposal', () => {
  for (const type of transformer2026TypeIds) {
    const model = createTransformer2026Geometry(type), bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    assert.equal(model.userData.units, 'arbitrary-scene-units'); assert.equal(model.userData.dimensionAccurate, false); assert.equal(model.userData.exactMeshReuseAllowed, false);
    assert.match(model.userData.disclosure, /не CAD/); assert.equal(model.userData.type, type);
    assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - 2.8) < 1e-6, type); assert.ok(Math.abs(bounds.min.y) < 1e-6, type); assert.ok(size.x > 0 && size.y > 0 && size.z > 0);
    let meshCount = 0; const resources = new Set(model.userData.materials);
    model.traverse(object => { if (object.isMesh) { meshCount++; assert.ok(object.name); assert.ok([...object.geometry.attributes.position.array].every(Number.isFinite), type); assert.ok(object.position.toArray().every(Number.isFinite)); resources.add(object.geometry); } });
    assert.ok(meshCount > 5 && meshCount < 600, `${type}: ${meshCount}`);
    let disposed = 0; for (const resource of resources) resource.addEventListener('dispose', () => disposed++);
    disposeTransformer2026Geometry(model); assert.equal(disposed, resources.size); assert.equal(model.children.length, 0);
  }
});

test('source-visible topology distinctions remain in actual mesh components', () => {
  const names = type => { const model = createTransformer2026Geometry(type), result = []; model.traverse(object => result.push(object.name)); disposeTransformer2026Geometry(model); return result; };
  assert.ok(names('tr26-corrugated-small').includes('corrugated-wall-fin')); assert.ok(!names('tr26-corrugated-small').includes('external-conservator')); assert.ok(!names('tr26-corrugated-small').includes('transport-wheel'));
  assert.ok(names('tr26-conservator-small').includes('external-conservator')); assert.ok(names('tr26-pole-bracket').includes('pole-mount-bracket'));
  assert.ok(names('tr26-panel-side-terminals').includes('end-hv-terminal')); assert.ok(!names('tr26-panel-side-terminals').includes('top-hv-bushing'));
  assert.ok(names('tr26-side-terminal-box').includes('closed-side-terminal-box')); assert.ok(!names('tr26-side-terminal-box').includes('protective-terminal-hood'));
  assert.ok(names('tr26-dry-mesh-cutaway').includes('cutaway-upper-front-panel')); assert.ok(!names('tr26-dry-mesh-closed').includes('visible-cast-coil'));
  assert.equal(names('tr26-instrument-two-round').filter(name => name === 'instrument-hv-bushing').length, 2); assert.equal(names('tr26-instrument-three-triangle').filter(name => name === 'instrument-hv-bushing').length, 3);
  assert.ok(names('tr26-hv-tdn-16').includes('visible-fan-housing')); assert.ok(!names('tr26-hv-tdn-10').includes('visible-fan-housing'));
});

test('all 67 source-based vector icons rasterize visibly within the viewBox without Three.js or source images', async () => {
  for (const type of Object.keys(transformer2026IconDefinitions)) {
    const svg = renderTransformer2026Icon(type, 128, transformer2026IconDefinitions[type].name);
    assert.doesNotMatch(svg, /<image|<img|NaN|undefined|Infinity/); assert.match(svg, /role="img"/); assert.match(svg, /<path/);
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); let ink = 0, edge = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * info.channels + 3] > 50) { ink++; if (x < 1 || y < 1 || x >= info.width - 1 || y >= info.height - 1) edge++; }
    assert.ok(ink > 250, `${type}: blank icon ${ink}`); assert.equal(edge, 0, `${type}: clipped icon`);
  }
  assert.doesNotMatch(readFileSync(new URL('../lib/catalog/models/transformer2026Icons.js', import.meta.url), 'utf8'), /from ['"]three/);
  assert.throws(() => renderTransformer2026Icon('tr26-corrugated-small', Infinity), RangeError);
  assert.ok(renderTransformer2026Icon('tr26-corrugated-small', 64, '<script>').includes('&lt;script&gt;'));
});

test('new library preserves all 238 identities and234 mappings, with one SHR11 completion and three exact protection successors', () => {
  assert.equal(officialProducts.length, 238);
  const unchanged = row => row.id !== 'cat-pr-shr11-v002';
  const disclosure = 'Упрощённая иллюстрация примера из каталога. Мелкие элементы бокового вида и их пространственное расположение воспроизведены не полностью; см. исходный чертёж на стр. 69. Размеры, материалы и комплектация исполнения не утверждаются. Не CAD.';
  const successors = {
    'cat-ptm-tded': {
      oldType: null, oldIcon: 'paired-protection-enclosures', type: 'source69-paired-protection-examples-icon',
      reason: 'Парный символ двух отдельно подписанных примеров со стр. 69; не общий корпус семейства и не внешний вид табличного исполнения. Мелкие элементы боковых видов опущены.',
    },
    'cat-ptm-tded-v012': {
      oldType: 'protection-cabinet', oldIcon: 'protection-cabinet', type: 'source69-ptm-u1-example',
      reason: `${disclosure} Опущены: малый боковой прямоугольник, короткие элементы под козырьком, точная конструкция опор.`,
    },
    'cat-ptm-tded-v013': {
      oldType: 'indoor-protection-enclosure', oldIcon: 'indoor-protection-enclosure', type: 'source69-tde9-u3-example',
      reason: `${disclosure} Опущены: два верхних круглых элемента бокового вида, боковой прямоугольник, нижний боковой выступ.`,
    },
  };
  const expected = oldBaseline.filter(unchanged).map(row => {
    if (!Object.hasOwn(successors, row.id)) return row;
    const successor = successors[row.id];
    assert.equal(row.visual.type, successor.oldType, row.id);
    assert.equal(row.icon.type, successor.oldIcon, row.id);
    return { ...row,
      visual: successor.oldType === null ? row.visual : { ...row.visual, type: successor.type, reason: successor.reason },
      icon: { ...row.icon, type: successor.type, reason: successor.reason },
    };
  });
  assert.equal(expected.filter(row => Object.hasOwn(successors, row.id)).length, 3);
  assert.deepEqual(officialProducts.filter(unchanged).map(product => ({ id: product.id, visual: getEquipmentVisual(product), icon: getEquipmentIcon(product) })), expected);
  const completed = officialProducts.find(product => product.id === 'cat-pr-shr11-v002');
  assert.equal(getEquipmentVisual(completed).type, 'open-distribution-panel');
  assert.equal(getEquipmentIcon(completed).confidence, 'source-based');
  for (const relative of ['models/visualMap.js', 'models/iconMap.js']) assert.doesNotMatch(readFileSync(new URL(`../lib/catalog/${relative}`, import.meta.url), 'utf8'), /getTransformer2026ReviewAsset/); // Runtime uses only independently hash-bound allowlists
  assert.equal(officialProducts.filter(product => getEquipmentVisual(product).confidence === 'source-matched').length, 172);
});


test('source recheck guards the triangular NTMI layout, three AOMZh terminals and asymmetric end-mounted fans', () => {
  const ntmi = createTransformer2026Geometry('tr26-instrument-three-triangle');
  const terminals = []; ntmi.traverse(object => { if (object.name === 'instrument-hv-bushing') terminals.push(object.position.toArray()); });
  assert.equal(terminals.length, 3); assert.equal(new Set(terminals.map(position => position[2])).size, 2);
  disposeTransformer2026Geometry(ntmi);
  const aom = createTransformer2026Geometry('tr26-rail-power-three'); let hv = 0; aom.traverse(object => { if (object.name === 'power-primary-terminal') hv++; }); assert.equal(hv, 3); disposeTransformer2026Geometry(aom);
  for (const [type, count, sides] of [['tr26-power-split-25', 2, 1], ['tr26-hv-tdtn-16', 3, 2], ['tr26-power-split-40', 4, 2]]) {
    const model = createTransformer2026Geometry(type), fans = []; model.traverse(object => { if (object.name === 'visible-fan-housing') fans.push(object); });
    assert.equal(fans.length, count, type); assert.equal(new Set(fans.map(fan => Math.sign(fan.position.z))).size, sides, type);
    for (const fan of fans) assert.equal(fan.rotation.z, Math.PI / 2, type);
    disposeTransformer2026Geometry(model);
  }
});

test('large corrugated/conservator terminals preserve source four-tall-LV contact plates and three-short-HV hierarchy', () => {
  for (const type of ['tr26-corrugated-large', 'tr26-conservator-large']) {
    const model = createTransformer2026Geometry(type), hv = [], lv = [], plates = [];
    model.traverse(object => { if (object.name === 'top-hv-bushing') hv.push(object); if (object.name === 'top-lv-bushing') lv.push(object); if (object.name === 'lv-flat-contact-plate') plates.push(object); });
    assert.equal(hv.length, 3, type); assert.equal(lv.length, 4, type); assert.equal(plates.length, 4, type);
    const hvTops = hv.map(object => new THREE.Box3().setFromObject(object).max.y), lvTops = lv.map(object => new THREE.Box3().setFromObject(object).max.y);
    assert.ok(Math.min(...lvTops) > Math.max(...hvTops), `${type}: LV contact plates must be taller than HV bushings`);
    for (const plate of plates) { const { width, height, depth } = plate.geometry.parameters; assert.ok(depth < width / 3 && depth < height / 3); }
    disposeTransformer2026Geometry(model);
  }
  for (const type of ['tr26-corrugated-small', 'tr26-conservator-small']) {
    const model = createTransformer2026Geometry(type), hv = [], lv = []; let plates = 0;
    model.traverse(object => { if (object.name === 'top-hv-bushing') hv.push(object); if (object.name === 'top-lv-bushing') lv.push(object); if (object.name === 'lv-flat-contact-plate') plates++; });
    assert.equal(plates, 0, type); assert.equal(hv.length, 3); assert.equal(lv.length, 4);
    assert.ok(new THREE.Box3().setFromObject(hv[0]).max.y > new THREE.Box3().setFromObject(lv[0]).max.y, type);
    disposeTransformer2026Geometry(model);
  }
});


test('reviewed oil/measurement repairs preserve visible terminal counts, planes and directional cooling', () => {
  const model = type => createTransformer2026Geometry(type);
  const find = (object, name) => { const found=[]; object.traverse(item=>{if(item.name===name)found.push(item)});return found; };
  for(const type of ['tr26-pole-bracket','tr26-side-terminal-box']) {
    const m=model(type); assert.ok(find(m,'corrugated-wall-fin').every(fin=>fin.position.z<0),type); assert.equal(find(m,'corrugated-end-fin').length,12,type); disposeTransformer2026Geometry(m);
  }
  const flanged=model('tr26-flanged-ends'), lv=find(flanged,'flange-lv-bushing');assert.equal(lv.length,4);assert.equal(new Set(lv.map(item=>item.position.x)).size,2);assert.equal(find(flanged,'lv-flat-contact-plate').length,4);disposeTransformer2026Geometry(flanged);
  const om=model('tr26-pole-cylinder');assert.equal(find(om,'instrument-hv-bushing').length,2);assert.equal(find(om,'instrument-secondary-terminal').length,4);disposeTransformer2026Geometry(om);
  const omp=model('tr26-single-side-bushings');assert.equal(find(omp,'side-lv-bushing').length,2);assert.equal(find(omp,'top-lv-bushing').length,0);for(const terminal of find(omp,'side-lv-bushing'))assert.equal(terminal.rotation.x,Math.PI/2);disposeTransformer2026Geometry(omp);
  const isolating=model('tr26-isolating');const hs=[...find(isolating,'top-hv-bushing'),...find(isolating,'top-lv-bushing')];assert.equal(find(isolating,'top-hv-bushing').length,3);assert.equal(find(isolating,'top-lv-bushing').length,3);assert.equal(hs.length,6);assert.equal(new Set(hs.map(b=>new THREE.Box3().setFromObject(b).max.y.toFixed(6))).size,1);disposeTransformer2026Geometry(isolating);
  const nami=model('tr26-instrument-three-rect');assert.equal(find(nami,'instrument-hv-bushing').length,3);assert.equal(find(nami,'instrument-secondary-terminal').length,7);assert.equal(new Set(find(nami,'instrument-hv-bushing').map(b=>b.position.z)).size,2);disposeTransformer2026Geometry(nami);
  const ntmi=model('tr26-instrument-three-triangle');assert.equal(find(ntmi,'polygonal-mounting-base').length,0);disposeTransformer2026Geometry(ntmi);
  const large35=model('tr26-upright-sealed-35');assert.equal(find(large35,'top-lv-bushing').length,7);assert.equal(find(large35,'lv-flat-contact-plate').length,7);disposeTransformer2026Geometry(large35);
  for(const type of ['tr26-tilted-sealed','tr26-tilted-conservator']){const m=model(type);const hv=find(m,'top-hv-bushing');assert.ok(hv[0].rotation.z>0&&hv[2].rotation.z<0);disposeTransformer2026Geometry(m);}
  const tmzh=model('tr26-tilted-conservator');assert.equal(find(tmzh,'external-conservator-long-axis').length,1);disposeTransformer2026Geometry(tmzh);
  const rpn=model('tr26-rpn-corrugated');assert.ok(find(rpn,'visible-oil-fill-tube')[0].position.x*find(rpn,'external-tap-drive')[0].position.x<0);disposeTransformer2026Geometry(rpn);
});

test('dry transformer source links, busbars, enclosure sides and heating ribs are explicit', () => {
  const count=(m,name)=>{let n=0;m.traverse(o=>{if(o.name===name)n++});return n};
  const cast=createTransformer2026Geometry('tr26-dry-cast-open');assert.equal(count(cast,'visible-diagonal-front-link'),3);disposeTransformer2026Geometry(cast);
  for(const [type,front,rear] of [['tr26-dry-foil-open',9,6],['tr26-dry-nomex-open',3,4]]){const m=createTransformer2026Geometry(type);assert.equal(count(m,'front-busbar-terminal'),front);assert.equal(count(m,'rear-busbar-terminal'),rear);disposeTransformer2026Geometry(m);}
  for(const [type,vents,panels] of [['tr26-dry-mesh-cutaway',1,1],['tr26-dry-mesh-closed',1,1],['tr26-dry-top-bushings',2,0],['tr26-dry-compact-louver',2,0]]){const m=createTransformer2026Geometry(type);assert.equal(count(m,'visible-side-vent'),vents);assert.equal(count(m,'flush-side-terminal-panel'),panels);assert.equal(count(m,'external-terminal-cover'),0);disposeTransformer2026Geometry(m);}
  for(const type of ['tr26-heating-three-row','tr26-heating-single-row']){const m=createTransformer2026Geometry(type);assert.ok(count(m,'visible-long-wall-rib')>0);disposeTransformer2026Geometry(m);}
});

test('power source layouts split incompatible pages and preserve per-side radiator units, stacking and terminal groups', () => {
  const expected={ 'tr26-rail-power-three':[2,3], 'tr26-power-three-winding-35':[3,4], 'tr26-panel-lv-four':[2,2], 'tr26-panel-lv-seven':[3,3], 'tr26-panel-conservator-offset':[3,2], 'tr26-panel-conservator-large':[3,2], 'tr26-panel-conservator-balanced':[3,3], 'tr26-hv-three':[2,3], 'tr26-hv-three-wide':[4,3], 'tr26-panel-low-voltage':[3,2], 'tr26-panel-low-voltage-balanced':[3,3] };
  for(const [type,counts] of Object.entries(expected)) {const m=createTransformer2026Geometry(type),units=[];m.traverse(o=>{if(o.name==='external-radiator-unit')units.push(o);if(o.name==='external-radiator-panel')assert.ok(o.geometry.parameters.width>o.geometry.parameters.depth*3,type);});assert.deepEqual([-1,1].map(sign=>units.filter(o=>Math.sign(o.position.z)===sign).length),counts,type);disposeTransformer2026Geometry(m);}
  assert.notEqual(transformer2026GroupTypes['drawing-tm-lv04-125'],transformer2026GroupTypes['drawing-tm-lv04-126']);assert.notEqual(transformer2026GroupTypes['drawing-tmn110-147'],transformer2026GroupTypes['drawing-tmn110-148']);
  assert.equal(transformer2026Types['tr26-panel-lv-seven'].layout.terminalGroups.find(g=>g.role==='secondary').positions.length,7);
  const three=transformer2026Types['tr26-hv-three-winding'].layout.terminalGroups;assert.equal(three.find(g=>g.role==='medium').positions.length,3);assert.equal(three.find(g=>g.role==='small').positions.length,3);assert.equal(three.find(g=>g.role==='medium').positions[0][1],three.find(g=>g.role==='small').positions[0][1]);
  const offset=createTransformer2026Geometry('tr26-hv-offset-conservator');let lengthwise=0;offset.traverse(o=>{if(o.name==='external-conservator-long-axis'){lengthwise++;assert.equal(o.rotation.z,Math.PI/2)}});assert.equal(lengthwise,1);disposeTransformer2026Geometry(offset);
});

test('unclassified ZOM/ZNOM secondary symbols cannot receive a 3D binding',()=>{
  const group=evidence.groups.find(group=>group.id==='measurement-zom-znom');assert.equal(group.geometryType,null);assert.equal(group.iconType,'tr26-instrument-column');
  for(const id of group.recordIds){const asset=get(id);assert.equal(asset.type,null);assert.equal(asset.iconType,'tr26-instrument-column');assert.ok(asset.reasons.some(reason=>reason.includes('пробки')));}
});


test('short-end oil conservators sit outside terminal footprints; RPN plates retain their own height profile',()=>{
  for(const type of ['tr26-conservator-small','tr26-conservator-large','tr26-rail-single-conservator']){const m=createTransformer2026Geometry(type),terminals=[];let conservator;m.traverse(o=>{if(o.name==='external-conservator')conservator=o;if(['top-hv-bushing','top-lv-bushing'].includes(o.name))terminals.push(o)});const c=new THREE.Box3().setFromObject(conservator);for(const terminal of terminals)assert.equal(c.intersectsBox(new THREE.Box3().setFromObject(terminal)),false,type);disposeTransformer2026Geometry(m);}
  const m=createTransformer2026Geometry('tr26-rpn-corrugated');let plates=0;const hv=[],lv=[];m.traverse(o=>{if(o.name==='lv-flat-contact-plate')plates++;if(o.name==='top-hv-bushing')hv.push(o);if(o.name==='top-lv-bushing')lv.push(o)});assert.equal(plates,4);assert.equal(hv.length,3);assert.equal(lv.length,4);const high=new THREE.Box3().setFromObject(hv[0]).getSize(new THREE.Vector3()).y,low=new THREE.Box3().setFromObject(lv[0]).getSize(new THREE.Vector3()).y;assert.ok(low/high>.7&&low/high<1.1);disposeTransformer2026Geometry(m);
});


test('seven plated LV terminals remain separate in the upright35 plan',()=>{
  const m=createTransformer2026Geometry('tr26-upright-sealed-35'),lv=[];m.traverse(o=>{if(o.name==='top-lv-bushing')lv.push(o)});assert.equal(lv.length,7);for(let i=0;i<lv.length;i++)for(let j=i+1;j<lv.length;j++)assert.equal(new THREE.Box3().setFromObject(lv[i]).intersectsBox(new THREE.Box3().setFromObject(lv[j])),false);disposeTransformer2026Geometry(m);
});


test('final power terminal profiles follow the page158/160 drawings without adding an unverified page116 fitting',()=>{
  const p158=transformer2026Types['tr26-power-low-profile'].layout.terminalGroups;assert.deepEqual(p158.map(g=>[g.positions.length,g.profile,g.height]),[[3,'plate',.31],[3,'plate',.31]]);
  const p160=transformer2026Types['tr26-power-tds'].layout.terminalGroups;assert.deepEqual(p160.map(g=>[g.positions.length,g.profile]),[[4,'ribbed'],[3,'plate']]);assert.ok(p160[1].height>p160[0].height);
  assert.equal(transformer2026Types['tr26-power-split-40'].layout.terminalGroups.some(g=>g.role==='additional-visible-roof-insulator'),false);
});
