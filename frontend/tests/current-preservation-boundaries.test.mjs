import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyProtectionContextPreservation, verifyProtectionContextIntegration } from '../../scripts/check-protection-context-integration.mjs';
import { verifyMeasurementColumnPreservation, verifyMeasurementColumnCompletion } from '../../scripts/check-measurement-column-completion.mjs';
import { verifySourceAssetPreservation, verifySourceAssetCompletion } from '../../scripts/check-source-asset-completion.mjs';

test('historical technical and release entry points cannot opt into current DTO projection through arguments',async()=>{
 // All these historical entry points must still reject the current DTO shape.
 // Candidate mode concerns release review only; it cannot bypass preservation.
 for(const fn of [verifyProtectionContextPreservation,verifyProtectionContextIntegration,verifyMeasurementColumnPreservation,verifyMeasurementColumnCompletion,verifySourceAssetPreservation,verifySourceAssetCompletion]){
  await assert.rejects(fn({currentDtoExtension:true,current:true,candidate:true}),/Changed client\/quote consumer tmg-400/);
 }
});
test('historical CLI branches still call historical integration, never the current-only wrappers',async()=>{
 for(const [file,entry] of [['protection-context-integration','verifyProtectionContextIntegration'],['measurement-column-completion','verifyMeasurementColumnCompletion'],['source-asset-completion','verifySourceAssetCompletion']]){
  const source=await readFile(new URL(`../../scripts/check-${file}.mjs`,import.meta.url),'utf8');
  const cli=source.slice(source.lastIndexOf('if (process.argv[1]'));
  assert.ok(cli.includes(`await ${entry}(`));assert.doesNotMatch(cli,/verifyCurrent|currentDtoExtension/);
 }
});

test('loading a historical checker never initializes the new current-only proof module',async()=>{
 const { spawnSync }=await import('node:child_process');
 const checker=new URL('../../scripts/check-protection-context-integration.mjs',import.meta.url).href;
 const child=spawnSync(process.execPath,['--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import { registerHooks } from 'node:module';
  registerHooks({resolve(specifier,context,nextResolve){
   if(specifier.endsWith('/current-client-dto-contract.mjs'))throw Error('CURRENT_PROOF_LOAD_BLOCKED');
   return nextResolve(specifier,context);
  }});
  const checker=await import(${JSON.stringify(checker)});
  assert.equal(typeof checker.verifyProtectionContextPreservation,'function');
  await assert.rejects(checker.verifyCurrentProtectionContextPreservation(),/CURRENT_PROOF_LOAD_BLOCKED/);
 `],{encoding:'utf8',timeout:15000});
 assert.equal(child.status,0,child.stderr||child.error?.message);
});
