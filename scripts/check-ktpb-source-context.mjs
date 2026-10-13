import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { officialProducts, productById } from '../frontend/lib/catalog/data.js';
import { getEquipmentVisual } from '../frontend/lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../frontend/lib/catalog/models/iconMap.js';
import { getEquipmentConstructionChoices } from '../frontend/lib/catalog/models/transformerExecutionChoices.js';
import { getNtmiSourcePreview } from '../frontend/lib/catalog/ntmiSourcePreview.js';
import { protectionContextAssetSnapshot } from './catalog/protection-context-asset-snapshot.mjs';
import { ktpbReviewDir, ktpbLegacyContextIds, ktpbAddedContextIds, verifyKtpbAmendment } from './catalog/ktpb-source-context-reviewed-dependencies.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const read = file => fs.readFileSync(path.join(root, ktpbReviewDir, file));

// Semantic evidence, not approval. The historical verifier receives only the
// checked unchanged 24-record subset; the two new contexts are checked here.
export async function verifyKtpbSourceContextPreservation(snapshot) {
  const current = snapshot || await protectionContextAssetSnapshot(root);
  const outputBytes = read('baseline-output-digests.json'), contextBytes = read('baseline-context-outputs.json');
  assert.equal(digest(outputBytes), '4be87cd9c0cabb68aa6c34b92fcca191dc52353d2d931439ed1e23a4f4a42263');
  assert.equal(digest(contextBytes), '1791e639a975d2977daeb754ca292f467086bcc9961e8e9c514657e7bb7824f9');
  const outputs = JSON.parse(outputBytes), legacy = JSON.parse(contextBytes);
  assert.deepEqual(Object.keys(legacy).sort(), ktpbLegacyContextIds);
  for (const [key, expected] of Object.entries(outputs)) assert.equal(digest(JSON.stringify(current[key])), expected, `Changed PR43 ${key}`);
  assert.deepEqual(Object.keys(current.sourceContexts).sort(), [...ktpbLegacyContextIds, ...ktpbAddedContextIds].sort());
  const legacySourceContexts = Object.fromEntries(ktpbLegacyContextIds.map(id => [id, current.sourceContexts[id]]));
  assert.deepEqual(legacySourceContexts, legacy, 'Changed original 24 source contexts');
  for (const id of [...ktpbLegacyContextIds, 'cat-ktpb-k-v002']) {
    const row = productById(id);
    assert.equal(getEquipmentVisual(row).type, null, `Unapproved context geometry ${id}`);
    assert.equal(getEquipmentVisual(row).confidence, 'source-only');
    assert.equal(getEquipmentIcon(row).confidence, 'typical');
    assert.deepEqual(getEquipmentConstructionChoices(row), []);
  }
  const family = productById('cat-ktpb-k'), visual = getEquipmentVisual(family), icon = getEquipmentIcon(family);
  assert.equal(visual.type, 'outdoor-switchyard-substation'); assert.equal(visual.confidence, 'source-matched');
  assert.deepEqual(visual.sourcePages, [55]); assert.equal(icon.confidence, 'source-based'); assert.deepEqual(icon.sourcePages, [55]);
  assert.deepEqual(getEquipmentConstructionChoices(family), []);
  for (const id of ktpbAddedContextIds) for (const mode of ['static', 'api']) {
    const context = current.sourceContexts[id][mode];
    assert.equal(context.canonicalId, id); assert.equal(context.sourceHref, '/catalog/source?page=56');
    assert.deepEqual(context.figures.map(figure => figure.key), ['substations-p056-figure26-2ktpb-110-4n']);
    assert.equal(context.figures[0].cropPath, '/catalog-source/page-056.webp');
    assert.equal(context.figures[0].exemplarHref, null);
    assert.match(context.status, /соответствие.*не установлено/i);
  }
  for (const id of ['cat-ktpb-k-v001', 'cat-ktpb-k-v003']) assert.equal(Object.hasOwn(current.sourceContexts, id), false);
  const rows = officialProducts;
  const gaps = rows.filter(row => row.recordKind === 'variant' && !getEquipmentVisual(row).type && !getEquipmentConstructionChoices(row).length && !getNtmiSourcePreview(row));
  const counts = { records: rows.length, defaultIllustrations: rows.filter(row => getEquipmentVisual(row).type && getEquipmentVisual(row).confidence === 'source-matched').length,
    sourceBasedIcons: rows.filter(row => getEquipmentIcon(row).confidence === 'source-based').length,
    choiceRows: rows.filter(row => getEquipmentConstructionChoices(row).length).length, choices: rows.flatMap(getEquipmentConstructionChoices).length,
    constructionGaps: gaps.length, gapFamilies: new Set(gaps.map(row => row.familyId)).size, legacyContextRecords: Object.keys(legacySourceContexts).length, sourceContextRecords: Object.keys(current.sourceContexts).length };
  assert.deepEqual(counts, { records: 843, defaultIllustrations: 464, sourceBasedIcons: 465, choiceRows: 36, choices: 74, constructionGaps: 243, gapFamilies: 29, legacyContextRecords: 24, sourceContextRecords: 26 });
  return { legacySourceContexts, counts };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { counts } = await verifyKtpbSourceContextPreservation();
  if (!process.argv.includes('--candidate')) verifyKtpbAmendment();
  console.log(JSON.stringify({ status: process.argv.includes('--candidate') ? 'candidate-evidence-only-independent-approval-required' : 'approved-bounded-ktpb-source-context', ...counts }));
}
