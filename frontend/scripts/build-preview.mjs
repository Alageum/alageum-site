// Isolated public-site export. The normal application keeps backend/dynamic routes.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
// Reject before deleting, copying or replacing anything in the disposable tree.
if (process.env.COMPANY_SOURCE !== undefined && process.env.COMPANY_SOURCE !== 'static') throw new Error('Static preview requires COMPANY_SOURCE unset or static');
const root = process.cwd();
const stage = resolve(root, '.preview-build');
const output = resolve(root, 'preview-dist');
// Both disposable directories are fixed children of this project.
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
for (const entry of ['app', 'components', 'lib', 'public', 'package.json', 'jsconfig.json']) {
 await cp(join(root, entry), join(stage, entry), { recursive: true });
}
for (const route of ['b2b', 'ai', 'login', 'admin']) await rm(join(stage, 'app', '(site)', route), { recursive: true, force: true });
const layoutPath = join(stage, 'app/layout.js');
await writeFile(layoutPath, (await readFile(layoutPath, 'utf8'))
 .replace("import { AuthProvider } from '@/components/AuthProvider';\n", '')
 .replace('<AuthProvider>', '').replace('</AuthProvider>', ''));
const productPage = join(stage, 'app/(site)/catalog/[slug]/page.js');
await writeFile(productPage, (await readFile(productPage, 'utf8')) + '\nexport const dynamicParams = false;\n');
// Only the disposable tree replaces the request-time company resolver.
await writeFile(join(stage, 'app/company/page.js'), `export { default, metadata } from '@/components/public/StaticCompanyPage';\n`);
// The live editorial route stays dynamic. Only this disposable copy gets fixed
// parameters, so future CMS slugs remain available without rebuilding the app.
const editorialPage = join(stage, 'app/pages/[locale]/[slug]/page.js');
await writeFile(editorialPage, (await readFile(editorialPage, 'utf8')) + `
export const dynamicParams = false;
export { previewPageParams as generateStaticParams } from '@/lib/public/pagesPreview';
`);
// Static preview cards have no API-only detail routes. Remove the query hook only
// from the disposable preview copy, so their verified specs are present in HTML
// before hydration. The normal backend-aware component remains unchanged.
const detailsPath = join(stage, 'components/catalog/ProductDetails.js');
const detailsSource = await readFile(detailsPath, 'utf8');
if (!detailsSource.includes('const params = useSearchParams();')) throw new Error('Unexpected product-detail source: review static export adapter');
await writeFile(detailsPath, detailsSource.replace("import { useSearchParams } from 'next/navigation';\n", '').replaceAll('const params = useSearchParams();', 'const params = new URLSearchParams();'));

await mkdir(join(stage, 'scripts'), { recursive: true });
await cp(join(root, 'scripts/verify-source-context-build.mjs'), join(stage, 'scripts/verify-source-context-build.mjs'));
await writeFile(join(stage, 'next.config.mjs'), `import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';\nimport { verifySourceContextBuild } from './scripts/verify-source-context-build.mjs';\nexport default async phase => { if (phase === PHASE_PRODUCTION_BUILD) await verifySourceContextBuild(); return { output: 'export', poweredByHeader: false, reactStrictMode: true, images: { unoptimized: true }, trailingSlash: true, turbopack: { root: ${JSON.stringify(root)} } }; };\n`);
const result = spawnSync(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'build', stage], { cwd: root, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_CATALOG_SOURCE: 'static', PAGES_SOURCE: 'static', PAGES_STATIC_PREVIEW: '1', COMPANY_SOURCE: 'static' } });
if (result.status !== 0) process.exit(result.status || 1);
await rm(output, { recursive: true, force: true });
await cp(join(stage, 'out'), output, { recursive: true });
console.log(`Public preview exported to ${output}`);
