import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSourceContextAssetVerifier } from '../lib/catalog/source-context/sourceContexts.js';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sourceContextProofPath = path.join(frontend, 'lib/catalog/source-context/generatedAssetProof.json');

// This runs from Next configuration on every build and development start. Each
// invocation checks current bytes anew; no checked-in/manual proof is accepted.
// Deploy the emitted code, proof and public assets as one immutable build unit.
export async function verifySourceContextBuild() {
  const temporary = `${sourceContextProofPath}.pending`;
  await rm(sourceContextProofPath, { force: true });
  await rm(temporary, { force: true });
  const proof = await createSourceContextAssetVerifier(asset => readFile(path.join(frontend, 'public', asset))).verify();
  if (!proof) throw new Error('Source bytes/registry/manifest changed or are missing; refuse source-context build proof');
  await writeFile(temporary, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, sourceContextProofPath);
  return proof;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(`Verified ${(await verifySourceContextBuild()).assets.length} source assets`);
}
