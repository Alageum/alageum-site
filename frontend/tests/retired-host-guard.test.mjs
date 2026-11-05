import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('Vercel builds only the public Next frontend at either supported project root', async () => {
  const root = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url)));
  const frontend = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)));
  assert.deepEqual(Object.keys(root.services), ['frontend']);
  assert.equal(root.services.frontend.root, 'frontend');
  for (const config of [root.services.frontend, frontend]) {
    assert.equal(config.framework, 'nextjs');
    assert.equal(config.installCommand, 'npm ci');
    assert.equal(config.buildCommand, 'ALAGEUM_PUBLIC_ONLY=1 npm run build');
    assert.equal(config.devCommand, 'ALAGEUM_PUBLIC_ONLY=1 npm run dev');
  }
  assert.deepEqual(root.routes, [{ src: '/(.*)', destination: { service: 'frontend' } }]);
});

for (const relative of ['../../', '../']) {
  test(`deployment uploads exclude secrets and generated files: ${relative}`, async () => {
    const rules = await readFile(new URL(`${relative}.vercelignore`, import.meta.url), 'utf8');
    const fixture = await mkdtemp(join(tmpdir(), 'alageum-vercel-ignore-'));
    try {
      await writeFile(join(fixture, '.gitignore'), rules);
      const init = spawnSync('git', ['init', '--quiet', fixture]);
      assert.equal(init.status, 0);
      const excluded = ['.env', '.env.production', 'frontend/.env.local', 'node_modules/a.js', 'frontend/.next/server.js', '.vercel/project.json', 'data/database.sql'];
      const included = ['vercel.json', 'frontend/vercel.json', 'frontend/package-lock.json', 'frontend/app/page.js', 'frontend/public/logo.svg'];
      const checked = spawnSync('git', ['-C', fixture, '-c', 'core.excludesFile=/dev/null', 'check-ignore', '--no-index', '-z', '--stdin'], { input: [...excluded, ...included].join('\0')+'\0', encoding: 'utf8' });
      assert.equal(checked.status, 0);
      assert.deepEqual(checked.stdout.split('\0').filter(Boolean).sort(), excluded.sort());
    } finally { await rm(fixture, {recursive:true, force:true}); }
  });
}
