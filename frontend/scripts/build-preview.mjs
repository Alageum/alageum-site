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
// The public-only export has no authentication provider or private API.
// Remove both canonical routes and their locale re-exports together.
for (const route of ['b2b', 'ai', 'login', 'admin', 'account', 'register', 'verify-email', 'forgot-password', 'reset-password']) {
 for (const group of ['(site)', '[locale]/(site)']) await rm(join(stage, 'app', group, route), { recursive: true, force: true });
}
// A static file export cannot report the live Next process's liveness.
await rm(join(stage, 'app/healthz'), { recursive: true, force: true });
const layoutPath = join(stage, 'app/layout.js');
const layoutSource = await readFile(layoutPath, 'utf8');
const requestLocale = "  const locale = (await headers()).get('x-alageum-locale') || (await cookies()).get('alageum-locale')?.value || 'ru';\n";
if (!layoutSource.includes(requestLocale)) throw new Error('Unexpected root locale source: review static export adapter');
await writeFile(layoutPath, layoutSource
 .replace("import { headers, cookies } from 'next/headers';\n", '')
 .replace("import { LocaleProvider } from '@/components/locale/LocaleProvider';", "import StaticPreviewDocument from '@/components/StaticPreviewDocument';")
 .replace("import { AuthProvider } from '@/components/AuthProvider';\n", '')
 .replace(requestLocale, '')
 .replace('<html lang={locale} data-scroll-behavior="smooth"><body><LocaleProvider locale={locale}>', '<StaticPreviewDocument>')
 .replace('</LocaleProvider>', '').replace('</body></html>', '</StaticPreviewDocument>')
 .replace('<AuthProvider>', '').replace('</AuthProvider>', ''));
// A pre-rendered client pathname is available without request headers/cookies.
// Derive the document language and provider together, including initial HTML.
await writeFile(join(stage, 'components/StaticPreviewDocument.js'), `'use client';
import { usePathname } from 'next/navigation';
import { LocaleProvider } from '@/components/locale/LocaleProvider';
import { localeFromPath } from '@/lib/i18n/routing';
const notices = {
 ru: 'Статический предпросмотр: новости и страницы взяты из сохранённого снимка, CMS и личный кабинет не подключены.',
 kk: 'Статикалық алдын ала қарау: жаңалықтар мен беттер сақталған нұсқадан алынған, CMS және жеке кабинет қосылмаған.',
 en: 'Static preview: news and pages are a bundled snapshot. CMS and account services are not connected.',
};
export default function StaticPreviewDocument({ children }) {
 const locale = localeFromPath(usePathname() || '/');
 return <html lang={locale} data-scroll-behavior="smooth"><body><LocaleProvider locale={locale}><p className="eco-notice" data-static-preview="">{notices[locale]}</p>{children}</LocaleProvider></body></html>;
}
`);
const productPage = join(stage, 'app/(site)/catalog/[slug]/page.js');
await writeFile(productPage, (await readFile(productPage, 'utf8')) + '\nexport const dynamicParams = false;\n');
// Enumerate only bundled records. Never add these restrictions to the live CMS
// route, where newly published slugs must work without another frontend build.
const previewParams = {
 'careers/[slug]': "return [...Object.keys(careerPages), 'workplaces', 'team', 'process'].map(slug => ({ slug }));",
 'careers/vacancies/[id]': 'return jobs.map(({ id }) => ({ id }));',
 'company/[section]': "return [...Object.keys(pages), 'history'].map(section => ({ section }));",
 'client/[section]': "return ['projects', 'orders', 'documents', 'support', 'profile'].map(section => ({ section }));",
 'news/[slug]': 'return previewNews.map(({ id }) => ({ slug: id }));',
};
for (const [route, body] of Object.entries(previewParams)) {
 const path = join(stage, 'app/(site)', route, 'page.js');
 const source = await readFile(path, 'utf8');
 if (/generateStaticParams|export const dynamicParams/.test(source)) throw new Error(`Unexpected route exports: review static adapter for ${route}`);
 const imports = route === 'news/[slug]' ? "import { news as previewNews } from '@/lib/ecosystem/news';\n" : '';
 await writeFile(path, `${source}\n${imports}export const dynamicParams = false;\nexport function generateStaticParams() { ${body} }\n`);
}
// Locale wrappers do not inherit route exports from a re-exported component.
const staticRoutes = [...Object.keys(previewParams), 'catalog/[slug]', 'manufacturers/[slug]', 'materials/[slug]', 'partners/[slug]', 'projects/[slug]', 'solutions/[slug]'];
for (const route of staticRoutes) {
 for (const group of ['(site)', '[locale]/(site)']) {
  const path = join(stage, 'app', group, route, 'page.js');
  let source = await readFile(path, 'utf8');
  if (!source.includes('export const dynamicParams')) source += '\nexport const dynamicParams = false;\n';
  if (!source.includes('generateStaticParams')) source += `export { generateStaticParams } from '@/app/(site)/${route}/page';\n`;
  await writeFile(path, source);
 }
}
const localeLayoutPath = join(stage, 'app/[locale]/layout.js');
await writeFile(localeLayoutPath, (await readFile(localeLayoutPath, 'utf8')) + `
export const dynamicParams = false;
export function generateStaticParams() { return ['ru', 'kk', 'en'].map(locale => ({ locale })); }
`);
// Browser-created IDs cannot be enumerated by output:export. Do not manufacture
// fake IDs or offer a create action whose destination would always be a 404.
for (const group of ['(site)', '[locale]/(site)']) {
 for (const route of ['client/projects/[id]', 'client/documents/[id]']) await rm(join(stage, 'app', group, route), { recursive: true, force: true });
}
await readFile(join(stage, 'components/ecosystem/ClientWorkspace.js'), 'utf8');
await writeFile(join(stage, 'components/ecosystem/ClientWorkspace.js'), `'use client';
import LocaleElement from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { useLocale } from '@/components/locale/LocaleProvider';
const copy = {
 ru: { title: 'Статический предпросмотр', body: 'Проекты, документы и кабинет доступны в приложении Next.js. В этой статической копии они отключены; данные не отправляются компании.', catalog: 'Открыть каталог', contacts: 'Контакты компании' },
 kk: { title: 'Статикалық алдын ала қарау', body: 'Жобалар, құжаттар және жеке кабинет Next.js қолданбасында қолжетімді. Бұл статикалық көшірмеде олар өшірілген; деректер компанияға жіберілмейді.', catalog: 'Каталогты ашу', contacts: 'Компанияның байланыс деректері' },
 en: { title: 'Static preview', body: 'Projects, documents and account services are available in the Next.js application. They are disabled in this static copy; no data is sent to the company.', catalog: 'Open catalogue', contacts: 'Company contacts' },
};
export default function ClientWorkspace() {
 const text = copy[useLocale()] || copy.ru;
 return <LocaleElement as="section" className="site-container site-info-page"><h1>{text.title}</h1><p>{text.body}</p><Link href="/catalog">{text.catalog}</Link><Link href="/contacts">{text.contacts}</Link></LocaleElement>;
}
`);
// Static hosts cannot execute the live /workspace redirect. The unavailable
// page must not advertise local drafts that this static copy cannot create.
for (const route of ['app/(site)/workspace/page.js', 'app/service-unavailable/page.js']) {
 const path = join(stage, route);
 await readFile(path, 'utf8');
 await writeFile(path, `export { default } from '@/components/ecosystem/ClientWorkspace';
export const metadata = { title: 'Статический предпросмотр кабинета' };
`);
}
// Only the disposable tree replaces the request-time company resolver.
// Preserve the metadata function consumed by the unchanged locale wrapper.
// Next forbids exporting both metadata and generateMetadata from one route.
await writeFile(join(stage, 'app/company/page.js'), `import StaticCompanyPage, { metadata as staticMetadata } from '@/components/public/StaticCompanyPage';
export default StaticCompanyPage;
export async function generateMetadata() { return staticMetadata; }
`);
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
await writeFile(join(stage, 'next.config.mjs'), `import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';\nimport { verifySourceContextBuild } from './scripts/verify-source-context-build.mjs';\nexport default async phase => { if (phase === PHASE_PRODUCTION_BUILD) await verifySourceContextBuild(); return { output: 'export', poweredByHeader: false, reactStrictMode: true, experimental: { cpus: 2 }, env: { NEXT_PUBLIC_SITE_MODE: 'public-only' }, images: { unoptimized: true }, trailingSlash: true, turbopack: { root: ${JSON.stringify(root)} } }; };\n`);
const result = spawnSync(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'build', stage], { cwd: root, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_CATALOG_SOURCE: 'static', NEWS_SOURCE: 'static', PAGES_SOURCE: 'static', PAGES_STATIC_PREVIEW: '1', COMPANY_SOURCE: 'static' } });
if (result.status !== 0) process.exit(result.status || 1);
await rm(output, { recursive: true, force: true });
await cp(join(stage, 'out'), output, { recursive: true });
console.log(`Public preview exported to ${output}`);
