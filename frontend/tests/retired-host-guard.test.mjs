import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// Offline contract checks, not a Vercel deployment test. The minimal shape was
// checked against https://openapi.vercel.sh/vercel.json on 2026-10-19.
// Documentation: https://vercel.com/docs/project-configuration/vercel-json and
// https://vercel.com/docs/deployments/vercel-ignore (gitignore-style allowlists).
const schemaUrl = 'https://openapi.vercel.sh/vercel.json';
const refusal = 'Vercel deployment is disabled. Use the self-hosted deployment guide.';
const stopCommand = `printf '%s\\n' '${refusal}' >&2; exit 1`;
const roots = [
  ['repository root', new URL('../../', import.meta.url)],
  ['frontend root', new URL('../', import.meta.url)],
];

for (const [name, root] of roots) {
  test(`${name}: retired-host config uses only supported deny-only fields`, async () => {
    const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
    assert.deepEqual(Object.keys(config).sort(), [
      '$schema', 'buildCommand', 'framework', 'installCommand', 'routes',
    ]);
    assert.equal(config.$schema, schemaUrl);
    assert.equal(config.framework, null, 'override the linked project framework preset');
    for (const key of ['installCommand', 'buildCommand']) {
      assert.equal(typeof config[key], 'string');
      assert.ok(config[key].length <= 256, `${key} fits the official schema limit`);
      assert.equal(config[key], stopCommand);
    }
    // No services, functions, builds, rewrites, source/log visibility switches,
    // or unsupported metadata may turn this safety file into deployment wiring.
    assert.deepEqual(config.routes, [{ src: '/(.*)', status: 404 }]);
  });

  test(`${name}: both install and build stop without dependencies or application code`, async () => {
    const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
    const fixture = await mkdtemp(join(tmpdir(), 'alageum-retired-host-command-'));
    try {
      for (const key of ['installCommand', 'buildCommand']) {
        // Assert before executing: a changed config must never run arbitrary
        // install/build code as a side effect of this regression test.
        assert.equal(config[key], stopCommand);
        const result = spawnSync('/bin/sh', ['-c', config[key]], {
          cwd: fixture,
          env: { PATH: '/usr/bin:/bin' },
          encoding: 'utf8',
          timeout: 2000,
        });
        assert.ifError(result.error);
        assert.equal(result.status, 1, `${key} must explicitly refuse deployment`);
        assert.equal(result.signal, null);
        assert.equal(result.stdout, '');
        assert.equal(result.stderr, `${refusal}\n`);
        assert.deepEqual(await readdir(fixture), [], 'no build or install output is created');
      }
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  test(`${name}: the terminal deny route covers public, private, API and asset paths`, async () => {
    const { routes } = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
    assert.deepEqual(routes, [{ src: '/(.*)', status: 404 }]);
    const matcher = new RegExp(`^(?:${routes[0].src})$`);
    for (const path of [
      '/', '/catalog', '/ru/account', '/en/login', '/api/v1/auth/browser-login',
      '/healthz', '/.env', '/vercel.json', '/_next/static/chunk.js',
      '/documents/private.pdf', '/%61ccount', '/account%2Fsettings',
    ]) {
      assert.ok(matcher.test(path), `deny route covers ${path}`);
    }
    // No destination, filesystem handler, method filter or continue flag exists:
    // the route is terminal and applies regardless of the request method.
  });

  test(`${name}: ignore allowlist excludes source, secrets and output under gitignore semantics`, async () => {
    const rules = await readFile(new URL('.vercelignore', root), 'utf8');
    assert.deepEqual(rules.split(/\r?\n/).map(line => line.trim())
      .filter(line => line && !line.startsWith('#')), ['/*', '!/vercel.json']);
    const fixture = await mkdtemp(join(tmpdir(), 'alageum-retired-host-ignore-'));
    const env = {
      PATH: process.env.PATH,
      HOME: fixture,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
    };
    try {
      // Exercise the documented ignore-pattern semantics with local Git only.
      // This does not install/call Vercel CLI or test its upload implementation.
      const init = spawnSync('git', ['-c', 'init.defaultBranch=guard-test', 'init', '--quiet', fixture], {
        env, encoding: 'utf8', timeout: 2000,
      });
      assert.ifError(init.error);
      assert.equal(init.status, 0, init.stderr);
      await writeFile(join(fixture, '.gitignore'), rules);
      await writeFile(join(fixture, 'vercel.json'), '{}');
      const excluded = [
        '.gitignore', '.vercelignore', '.env', '.env.production', '.env.local',
        'package.json', 'package-lock.json', 'next.config.mjs', 'README.md',
        'app/page.js', 'public/logo.svg', 'node_modules/example/index.js',
        '.next/standalone/server.js', '.next/static/chunk.js', 'out/index.html',
        '.vercel/output/config.json', '.vercel/output/functions/auth.func/index.js',
        'backend/.env', 'backend/app/main.py', 'frontend/.env',
        'frontend/vercel.json', 'frontend/app/page.js', 'nested/vercel.json',
        'uploads/private.pdf', 'data/database.sql', '.github/workflows/deploy.yml',
        'vercel.json.backup',
      ];
      const checked = spawnSync('git', ['-C', fixture, '-c', 'core.excludesFile=/dev/null',
        'check-ignore', '--no-index', '-z', '--stdin'], {
        env,
        input: ['vercel.json', ...excluded].join('\0') + '\0',
        encoding: 'utf8',
        timeout: 2000,
      });
      assert.ifError(checked.error);
      assert.equal(checked.status, 0, checked.stderr);
      assert.deepEqual(checked.stdout.split('\0').filter(Boolean).sort(), excluded.sort());
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
}

test('repository and frontend guard configurations cannot drift', async () => {
  const configs = await Promise.all(roots.map(([, root]) => readFile(new URL('vercel.json', root), 'utf8')));
  assert.equal(configs[0], configs[1]);
});
