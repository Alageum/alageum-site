import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sourceContextManifest } from '../lib/catalog/source-context/sourceContexts.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Exercise the actual Next configuration entry point against an isolated current
// deployment snapshot; a hand-written successful proof cannot rescue bad bytes.
test('mandatory production and development config gates replace stale proof only after current bytes pass; preview config installs the same gate', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'alageum-source-context-build-'));
  try {
    const copy = relative => { const dest = path.join(temporary, relative); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(root, relative), dest); };
    for (const relative of ['next.config.mjs', 'scripts/verify-source-context-build.mjs',
      'lib/catalog/source-context/sourceContexts.js', 'lib/catalog/source-context/sourceContextManifest.json',
      'lib/catalog/sources.js', 'lib/catalog/sources-manifest.json', 'lib/catalog/models/transformer2026Shape.js']) copy(relative);
    fs.symlinkSync(fs.realpathSync(path.join(root, 'node_modules')), path.join(temporary, 'node_modules'), 'dir');
    const assets = [...Object.keys(sourceContextManifest.assets), ...Object.values(sourceContextManifest.figures).map(figure => figure.cropPath)];
    for (const asset of assets) copy(`public${asset}`);
    const proof = path.join(temporary, 'lib/catalog/source-context/generatedAssetProof.json');
    const invoke = phase => spawnSync(process.execPath, ['--input-type=module', '-e', `import config from './next.config.mjs'; await config('${phase}');`], { cwd: temporary, encoding: 'utf8' });
    for (const phase of ['phase-production-build', 'phase-development-server']) {
      const result = invoke(phase); assert.equal(result.status, 0, result.stderr); assert.ok(fs.existsSync(proof));
    }
    const valid = fs.readFileSync(proof);
    // The real CLI must stop in configuration, before compiling the app.
    const blockedAsset = path.join(temporary, `public${assets[0]}`), blockedBytes = fs.readFileSync(blockedAsset);
    fs.unlinkSync(blockedAsset);
    const blockedBuild = spawnSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build'], { cwd: temporary, encoding: 'utf8', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
    assert.notEqual(blockedBuild.status, 0); assert.match(blockedBuild.stdout + blockedBuild.stderr, /refuse source-context build proof/);
    assert.equal(fs.existsSync(proof), false); fs.writeFileSync(blockedAsset, blockedBytes);
    for (const asset of assets) {
      const file = path.join(temporary, `public${asset}`), original = fs.readFileSync(file);
      for (const mutation of ['missing', 'same-size-corrupt']) {
        fs.writeFileSync(proof, valid);
        if (mutation === 'missing') fs.unlinkSync(file);
        else { const corrupt = Buffer.from(original); corrupt[0] ^= 1; fs.writeFileSync(file, corrupt); }
        const result = invoke('phase-production-build'); assert.notEqual(result.status, 0, `${asset}/${mutation}`);
        assert.match(result.stderr, /refuse source-context build proof/); assert.equal(fs.existsSync(proof), false);
        fs.writeFileSync(file, original);
      }
    }
    for (const relative of ['lib/catalog/source-context/sourceContextManifest.json', 'lib/catalog/sources-manifest.json']) {
      const file = path.join(temporary, relative), original = fs.readFileSync(file), changed = JSON.parse(original);
      if (relative.includes('sourceContextManifest')) changed.source.title += ' changed';
      else changed.assets[assets[0]].sha256 = '0'.repeat(64);
      fs.writeFileSync(file, JSON.stringify(changed)); fs.writeFileSync(proof, valid);
      assert.notEqual(invoke('phase-production-build').status, 0); assert.equal(fs.existsSync(proof), false); fs.writeFileSync(file, original);
    }
    assert.equal(invoke('phase-production-build').status, 0); assert.deepEqual(fs.readFileSync(proof), valid);
    const preview = fs.readFileSync(path.join(root, 'scripts/build-preview.mjs'), 'utf8');
    assert.ok(preview.includes("cp(join(root, 'scripts/verify-source-context-build.mjs'), join(stage, 'scripts/verify-source-context-build.mjs'))"));
    assert.match(preview, /phase === PHASE_PRODUCTION_BUILD\) await verifySourceContextBuild\(\)/);
    assert.match(fs.readFileSync(path.join(root, 'components/catalog/ProductVisual.js'), 'utf8'), /CatalogSourceContext product=\{product\} assetEvidence=\{sourceContextAssetProof\}/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'scripts/verify-source-context-build.mjs'), 'utf8'), /fetch\(|https?:|blob:|data:/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
