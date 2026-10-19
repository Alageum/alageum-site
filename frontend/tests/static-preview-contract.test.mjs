import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { locales } from '../lib/i18n/routing.js';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const previewScript = join(frontend, 'scripts/build-preview.mjs');
const privateRoutes = ['b2b', 'ai', 'login', 'admin', 'account', 'register', 'verify-email', 'forgot-password', 'reset-password'];
const sourceFiles = [
  'app/layout.js', 'app/healthz/route.js', 'app/company/page.js', 'app/[locale]/company/page.js',
  'app/pages/[locale]/[slug]/page.js', 'app/(site)/catalog/[slug]/page.js',
  'components/AuthProvider.js', 'components/catalog/ProductDetails.js',
  'components/public/StaticCompanyPage.js', 'lib/api/companyServer.js',
  'lib/api/pagesServer.js', 'lib/i18n/server.js', 'lib/i18n/translate.js',
  'lib/i18n/dictionaries.json', 'lib/catalog/source-context/sourceContexts.js',
  'lib/catalog/source-context/sourceContextManifest.json',
  'lib/catalog/sources-manifest.json', 'scripts/verify-source-context-build.mjs',
  'package.json', 'jsconfig.json',
];
const text = (root, path) => readFile(join(root, path), 'utf8');

async function put(root, path, source) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), source);
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'alageum-static-preview-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of sourceFiles) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await cp(join(frontend, path), join(root, path));
  }
  await put(root, 'public/source-sentinel.txt', 'unchanged public source bytes');
  for (const route of privateRoutes) {
    for (const group of ['(site)', '[locale]/(site)']) {
      await put(root, `app/${group}/${route}/preview-contract-sentinel.txt`, 'private source retained');
    }
  }
  // Exercise the real staging script without compiling Next or copying public
  // media. Only the CLI is a test double; it records the forced build contract.
  await put(root, 'node_modules/next/dist/bin/next', `
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const stage = process.argv[3];
const names = ['NEXT_PUBLIC_CATALOG_SOURCE', 'PAGES_SOURCE', 'PAGES_STATIC_PREVIEW', 'COMPANY_SOURCE'];
writeFileSync(join(process.cwd(), 'build-invocation.json'), JSON.stringify({
  args: process.argv.slice(2), env: Object.fromEntries(names.map(name => [name, process.env[name]]))
}));
mkdirSync(join(stage, 'out'), { recursive: true });
writeFileSync(join(stage, 'out', 'index.html'), 'fixture export');
`);
  return root;
}

function invoke(root, companySource) {
  const env = { ...process.env, NEXT_PUBLIC_CATALOG_SOURCE: 'api', PAGES_SOURCE: 'api', PAGES_STATIC_PREVIEW: '0' };
  if (companySource === undefined) delete env.COMPANY_SOURCE;
  else env.COMPANY_SOURCE = companySource;
  return spawnSync(process.execPath, [previewScript], { cwd: root, env, encoding: 'utf8', timeout: 20_000 });
}

async function companyModules(stage) {
  const modules = await mkdtemp(join(dirname(stage), 'metadata-contract-'));
  const moduleUrl = async (name, source) => {
    const file = join(modules, `${name}.mjs`);
    await writeFile(file, source);
    return pathToFileURL(file).href;
  };
  // Isolate metadata from the component's JSX dependencies. Keep the actual
  // declaration and execute the generated root and unchanged locale modules.
  const companySource = await text(stage, 'components/public/StaticCompanyPage.js');
  const declaration = companySource.match(/^export const metadata = .*;$/m)?.[0];
  assert.ok(declaration, 'StaticCompanyPage metadata declaration must be present');
  const componentUrl = await moduleUrl('component', `${declaration}\nexport default function StaticCompanyPage() { return null; }`);
  const rootUrl = await moduleUrl('root', (await text(stage, 'app/company/page.js'))
    .replaceAll("'@/components/public/StaticCompanyPage'", JSON.stringify(componentUrl)));
  const dictionaries = JSON.parse(await text(stage, 'lib/i18n/dictionaries.json'));
  const translateUrl = await moduleUrl('translate', (await text(stage, 'lib/i18n/translate.js'))
    .replace("import dictionaries from './dictionaries.json';", `const dictionaries = ${JSON.stringify(dictionaries)};`));
  const serverUrl = await moduleUrl('server', (await text(stage, 'lib/i18n/server.js'))
    .replace("'./translate'", JSON.stringify(translateUrl)));
  const localeUrl = await moduleUrl('locale', (await text(stage, 'app/[locale]/company/page.js'))
    .replace("'@/app/company/page'", JSON.stringify(rootUrl))
    .replace("'@/lib/i18n/server'", JSON.stringify(serverUrl)));
  return {
    root: await import(rootUrl), localized: await import(localeUrl),
    component: await import(componentUrl), localizer: await import(serverUrl), dictionaries,
  };
}

test('static preview retains root and localized company metadata wiring for both allowed source selectors', async t => {
  const root = await fixture(t);
  for (const selection of [undefined, 'static']) {
    const result = invoke(root, selection);
    assert.equal(result.status, 0, result.stderr);
    const stage = join(root, '.preview-build');
    const modules = await companyModules(stage);
    assert.deepEqual(Object.keys(modules.root).sort(), ['default', 'generateMetadata']);
    assert.equal(modules.root.default, modules.component.default);
    assert.equal(modules.localized.default, modules.component.default);
    const metadata = await modules.root.generateMetadata();
    assert.deepEqual(metadata, modules.component.metadata);
    for (const locale of locales) {
      const localized = await modules.localized.generateMetadata({ params: Promise.resolve({ locale }) });
      assert.deepEqual(localized, modules.localizer.localizeMetadata(metadata, locale));
      assert.equal(localized.title, locale === 'ru' ? metadata.title : modules.dictionaries[locale][metadata.title]);
    }
    assert.equal(await text(stage, 'app/[locale]/company/page.js'), await text(root, 'app/[locale]/company/page.js'));
    assert.doesNotMatch(await text(stage, 'app/company/page.js'), /force-dynamic|loadEditorialPage|companyDelivery/);
    assert.deepEqual(JSON.parse(await text(root, 'build-invocation.json')), {
      args: ['build', stage], env: { NEXT_PUBLIC_CATALOG_SOURCE: 'static', PAGES_SOURCE: 'static', PAGES_STATIC_PREVIEW: '1', COMPANY_SOURCE: 'static' },
    });
    assert.equal(await text(root, 'preview-dist/index.html'), 'fixture export');
  }
});

test('preview adaptations remain disposable and retain source guards and private live routes', async t => {
  const root = await fixture(t);
  const originals = new Map(await Promise.all(sourceFiles.map(async path => [path, await readFile(join(root, path))])));
  const result = invoke(root, 'static');
  assert.equal(result.status, 0, result.stderr);
  const stage = join(root, '.preview-build');
  for (const [path, bytes] of originals) assert.deepEqual(await readFile(join(root, path)), bytes, `Live source changed: ${path}`);
  for (const route of privateRoutes) {
    for (const group of ['(site)', '[locale]/(site)']) {
      const path = `app/${group}/${route}`;
      await assert.rejects(access(join(stage, path)), { code: 'ENOENT' });
      assert.equal(await text(root, `${path}/preview-contract-sentinel.txt`), 'private source retained');
    }
  }
  assert.match(await text(root, 'app/layout.js'), /<AuthProvider>/);
  assert.doesNotMatch(await text(stage, 'app/layout.js'), /AuthProvider/);
  await assert.rejects(access(join(stage, 'app/healthz')), { code: 'ENOENT' });
  assert.match(await text(root, 'app/healthz/route.js'), /export const dynamic = 'force-dynamic'/);
  assert.match(await text(root, 'app/healthz/route.js'), /'Cache-Control': 'no-store'/);
  assert.match(await text(root, 'app/company/page.js'), /export const dynamic = 'force-dynamic'/);
  assert.match(await text(stage, 'app/pages/[locale]/[slug]/page.js'), /previewPageParams as generateStaticParams/);
  assert.match(await text(stage, 'app/(site)/catalog/[slug]/page.js'), /dynamicParams = false/);
  assert.doesNotMatch(await text(stage, 'components/catalog/ProductDetails.js'), /useSearchParams/);
  for (const path of sourceFiles.filter(path => path.startsWith('lib/') || path === 'components/AuthProvider.js' || path === 'scripts/verify-source-context-build.mjs')) {
    assert.deepEqual(await readFile(join(stage, path)), originals.get(path), `Staged guard/source changed: ${path}`);
  }
  assert.equal(await text(stage, 'public/source-sentinel.txt'), 'unchanged public source bytes');
  const config = await text(stage, 'next.config.mjs');
  assert.match(config, /phase === PHASE_PRODUCTION_BUILD\) await verifySourceContextBuild\(\)/);
  assert.match(config, /output: 'export'/);
});

test('non-static company selectors fail before changing the disposable preview or published output', async t => {
  const root = await mkdtemp(join(tmpdir(), 'alageum-static-preview-rejection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['.preview-build', 'preview-dist']) await put(root, `${directory}/sentinel.txt`, `keep ${directory}`);
  for (const selection of ['cms', '', 'CMS', ' static', 'static ', 'api']) {
    const result = invoke(root, selection);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Static preview requires COMPANY_SOURCE unset or static/);
    for (const directory of ['.preview-build', 'preview-dist']) assert.equal(await text(root, `${directory}/sentinel.txt`), `keep ${directory}`);
  }
});
