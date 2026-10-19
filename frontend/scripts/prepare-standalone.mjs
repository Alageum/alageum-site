// Package the public assets that Next deliberately omits from standalone traces.
// The generated server and traced dependencies come from `next build` itself.
import { cp, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function prepareStandalone(root) {
  const output = join(root, '.next', 'standalone');
  const manifest = JSON.parse(await readFile(join(root, '.next', 'required-server-files.json'), 'utf8'));
  if (manifest.config?.output !== 'standalone') throw new Error('Build the standalone Next application before packaging');
  if (!(await stat(join(output, 'server.js'))).isFile()) throw new Error('Standalone server.js is missing');
  // Never copy the repository root, environment files or the backend into the
  // public web root. Only these two reviewed public asset trees are added.
  await cp(join(root, 'public'), join(output, 'public'), { recursive: true });
  await cp(join(root, '.next', 'static'), join(output, '.next', 'static'), { recursive: true });
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await prepareStandalone(fileURLToPath(new URL('../', import.meta.url)));
  console.log(`Standalone frontend prepared at ${output}`);
}
