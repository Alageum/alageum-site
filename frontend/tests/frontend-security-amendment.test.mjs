import { readKtpbHistoricalBytes } from './helpers/ktpb-source-context-historical-bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  securityReviewDir, securityClearancePath, securityReportPath, securityBaselineCommit, securityBaselineTree,
  securityPredecessors, securityRequiredFiles, securityDigest as digest, readSecurityBytes as readCurrentSecurityBytes,
  verifySecurityDependencyFiles, verifySecurityAmendment, assertSecurityDependencies,
} from '../../scripts/catalog/frontend-security-reviewed-dependencies.mjs';
import { verifyCorrectionAmendment } from '../../scripts/catalog/ptmm-browser-correction-reviewed-dependencies.mjs';
import { verifyPtmmQualificationAmendment } from '../../scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs';
import { verifyVisualPresentationAmendment } from '../../scripts/catalog/visual-presentation-reviewed-dependencies.mjs';
import { verifyBrowserAssertionAmendment } from '../../scripts/catalog/catalog-browser-reviewed-dependencies.mjs';
import { protectionContextClearancePath, verifyProtectionContextDependencyAmendment } from '../../scripts/catalog/protection-context-reviewed-dependencies.mjs';
import { measurementColumnClearancePath, verifyMeasurementColumnDependencyAmendment } from '../../scripts/catalog/measurement-column-reviewed-dependencies.mjs';
import { sourceAssetClearancePath, verifySourceAssetDependencyAmendment } from '../../scripts/catalog/source-asset-reviewed-dependencies.mjs';
const readSecurityBytes = file => readKtpbHistoricalBytes(file, readCurrentSecurityBytes);
const approved = 'approved-bounded-frontend-security', pending = 'pending-independent-review';
const gates = [
  ['security', verifySecurityAmendment], ['correction', verifyCorrectionAmendment],
  ['PTMM', verifyPtmmQualificationAmendment], ['visual', verifyVisualPresentationAmendment],
  ['browser', verifyBrowserAssertionAmendment],
  ['protection', read => verifyProtectionContextDependencyAmendment(JSON.parse(read(protectionContextClearancePath)), read)],
  ['measurement', read => verifyMeasurementColumnDependencyAmendment(JSON.parse(read(measurementColumnClearancePath)), read)],
  ['source', read => verifySourceAssetDependencyAmendment(JSON.parse(read(sourceAssetClearancePath)), read)],
];
const required = securityRequiredFiles();
function fixture() {
  const files = new Map(required.map(file => [file, readSecurityBytes(file)]));
  const requiredPaths = new Set([...required, securityClearancePath, securityReportPath]);
  const clearance = { format: 'alageum-frontend-security-clearance-v1', status: approved,
    baselineCommit: securityBaselineCommit, baselineTree: securityBaselineTree,
    dependencies: { predecessors: {...securityPredecessors}, reviewedFiles: Object.fromEntries([...files].map(([file, bytes])=>[file,digest(bytes)])) },
    reviewReport: securityReportPath };
  const report = { format: 'alageum-frontend-security-independent-review-v1', status: approved,
    baselineCommit: securityBaselineCommit, baselineTree: securityBaselineTree,
    lockSha256: clearance.dependencies.reviewedFiles['frontend/package-lock.json'],
    packageUpdates: { sharp: ['0.35.4','0.35.5'], 'source-map-js': ['1.2.1','1.2.2'], nativeBinaryEntries: 26 },
    sourceUiChanges: 0, recordChanges: 0, geometryMaterialChanges: 0, pageChanges: 0, thresholdChanges: 0,
    workflowChanges: 0, priorApprovalChanges: 0, backendDependencyChanges: 0, auditGateChanges: 0 };
  const attest = () => {
    files.set(securityReportPath, Buffer.from(JSON.stringify({...report, approvedDependenciesSha256: digest(JSON.stringify(clearance.dependencies))})));
    clearance.reviewReportSha256 = digest(files.get(securityReportPath));
    files.set(securityClearancePath, Buffer.from(JSON.stringify(clearance)));
  };
  const read = file => { if (files.has(file)) return files.get(file); assert.ok(!requiredPaths.has(file), `Missing security fixture ${file}`); return readSecurityBytes(file); };
  attest(); return {files, clearance, report, attest, read};
}

test('published PR43 security bytes preserve their approval and complete inherited chain', () => {
  const clearance = JSON.parse(readSecurityBytes(securityClearancePath));
  verifySecurityDependencyFiles(clearance, readSecurityBytes);
  for (const [name, verify] of gates) {
    if (clearance.status === approved) verify(readSecurityBytes);
    else { assert.equal(clearance.status,pending); assert.throws(()=>verify(readSecurityBytes), /independent approval/, name); }
  }
});

test('exact synthetic security approval reaches every inherited gate without writing checkout approval', () => {
  const before = readSecurityBytes(securityClearancePath), f = fixture();
  for (const [, verify] of gates) verify(f.read);
  assertSecurityDependencies(securityPredecessors,f.read);
  for (const file of Object.keys(securityPredecessors)) assert.throws(()=>assertSecurityDependencies({[file]:'wrong-prior'},f.read));
  assert.throws(()=>assertSecurityDependencies({'frontend/e2e/catalog.spec.js':'wrong-prior'},f.read));
  assert.deepEqual(readSecurityBytes(securityClearancePath),before);
});

test('missing or pending security approval and post-success lock mutations fail through every inherited gate', () => {
  const f=fixture(), lock='frontend/package-lock.json', original=f.read(lock);
  for(const [name,verify] of gates) {
    verify(f.read); const bytes=f.files.get(securityClearancePath); f.files.delete(securityClearancePath);
    assert.throws(()=>verify(f.read), /Missing security fixture/, name); f.files.set(securityClearancePath,bytes);
    f.clearance.status=pending;f.attest();assert.throws(()=>verify(f.read), /independent approval/, name);
    f.clearance.status=approved;f.attest();f.files.set(lock,Buffer.concat([original,Buffer.from('\n')]));
    assert.throws(()=>verify(f.read),undefined,name);f.files.set(lock,original);
  }
});

test('wrong identity, predecessor scope, report, and approval fields cannot broaden security authority', () => {
  const file=Object.keys(securityPredecessors)[0];
  const mutations=[
    c=>{c.status=pending;},c=>{c.format='wrong';},c=>{c.baselineCommit='wrong';},c=>{c.baselineTree='wrong';},
    c=>{delete c.dependencies.predecessors[file];},c=>{c.dependencies.predecessors[file]='wrong';},c=>{c.dependencies.predecessors.extra='wrong';},
    c=>{delete c.dependencies.reviewedFiles[file];},c=>{c.dependencies.reviewedFiles.extra='wrong';},c=>{c.reviewReport='other-report';},
  ];
  for(const mutate of mutations){const f=fixture();mutate(f.clearance);f.attest();assert.throws(()=>verifySecurityAmendment(f.read));}
  for(const field of ['status','format','baselineCommit','baselineTree','lockSha256','packageUpdates','sourceUiChanges','recordChanges','geometryMaterialChanges','pageChanges','thresholdChanges','workflowChanges','priorApprovalChanges','backendDependencyChanges','auditGateChanges']){
    const f=fixture();f.report[field]='wrong';f.attest();assert.throws(()=>verifySecurityAmendment(f.read),undefined,field);
  }
  const f=fixture();f.clearance.reviewReportSha256='wrong';f.files.set(securityClearancePath,Buffer.from(JSON.stringify(f.clearance)));assert.throws(()=>verifySecurityAmendment(f.read));
});

test('every reviewed file and report is read again after warm success, and missing files cannot fall back', () => {
  const f=fixture();verifySecurityAmendment(f.read);
  for(const file of [...required,securityReportPath]){
    const bytes=f.read(file);f.files.delete(file);assert.throws(()=>verifySecurityAmendment(f.read), /Missing security fixture/,file);
    f.files.set(file,Buffer.concat([bytes,Buffer.from('\n')]));assert.throws(()=>verifySecurityAmendment(f.read),undefined,file);f.files.set(file,bytes);
  }
  verifySecurityAmendment(f.read);
});

test('re-attested source, UI, CMS, workflow, approval and arbitrary lock changes remain rejected', () => {
  const frozen=['frontend/components/catalog/ProductVisual.js','frontend/lib/catalog/models/protectionExampleGeometry.js',
    'frontend/public/catalog-source/page-068.webp','backend-node/package-lock.json','backend-node/data/compatibility/native-page-editor.json',
    'backend-node/src/domain/catalog.js','.github/workflows/ci.yml','frontend/e2e/catalog.spec.js',
    'docs/catalog-transformers-2026/review/ptmm-browser-correction/clearance.json',
    'docs/catalog-transformers-2026/review/ptmm-browser-correction/independent-review.json',
    'frontend/package-lock.json'];
  for(const file of frozen){const f=fixture();assert.ok(required.includes(file));const bytes=Buffer.concat([f.read(file),Buffer.from('\n')]);f.files.set(file,bytes);f.clearance.dependencies.reviewedFiles[file]=digest(bytes);f.attest();assert.throws(()=>verifySecurityAmendment(f.read),undefined,file);}
});

test('old and new lock or guard byte mixtures cannot acquire a new approval', () => {
  const archive=JSON.parse(readSecurityBytes(`${securityReviewDir}/historical-test-bytes.json`));
  assert.equal(archive.baseCommit,securityBaselineCommit);assert.deepEqual(Object.keys(archive.files).sort(),Object.keys(securityPredecessors).sort());
  for(const [file,expected] of Object.entries(securityPredecessors)){
    const f=fixture(), old=Buffer.from(archive.files[file].text);assert.equal(digest(old),expected);assert.notEqual(digest(f.read(file)),expected);
    f.files.set(file,old);assert.throws(()=>verifySecurityAmendment(f.read),undefined,file);
    f.clearance.dependencies.reviewedFiles[file]=expected;f.attest();assert.throws(()=>verifySecurityAmendment(f.read),undefined,file);
  }
});

test('same-size timestamp-restored disk mutations cannot reuse approval', () => {
  const f=fixture(), directory=fs.mkdtempSync(path.join(os.tmpdir(),'frontend-security-bytes-'));
  try{for(const file of ['frontend/package-lock.json','scripts/catalog/frontend-security-reviewed-dependencies.mjs','scripts/catalog/ptmm-browser-correction-reviewed-dependencies.mjs']){
    const target=path.join(directory,'reviewed'), bytes=f.read(file);fs.writeFileSync(target,bytes);const stamp=fs.statSync(target);
    const read=candidate=>candidate===file?fs.readFileSync(target):f.read(candidate);verifySecurityAmendment(read);
    const changed=Buffer.from(bytes);changed[Math.floor(changed.length/2)]^=1;fs.writeFileSync(target,changed);fs.utimesSync(target,stamp.atime,stamp.mtime);
    assert.equal(fs.statSync(target).size,bytes.length);assert.ok(Math.abs(fs.statSync(target).mtimeMs-stamp.mtimeMs)<1);assert.throws(()=>verifySecurityAmendment(read),undefined,file);
    fs.writeFileSync(target,bytes);fs.utimesSync(target,stamp.atime,stamp.mtime);verifySecurityAmendment(read);
  }}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
