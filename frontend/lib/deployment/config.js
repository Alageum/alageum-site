export function deploymentMode(env = process.env) {
  if (env.ALAGEUM_PUBLIC_ONLY !== undefined && !['0', '1'].includes(env.ALAGEUM_PUBLIC_ONLY)) throw new Error('ALAGEUM_PUBLIC_ONLY must be 0 or 1');
  if (env.ALAGEUM_PUBLIC_ONLY !== '1') return 'connected';
  for (const key of ['API_INTERNAL_BASE_URL', 'NEXT_PUBLIC_API_URL']) {
    if (env[key]) throw new Error(`Public-only deployment cannot configure ${key}`);
  }
  if (env.NEXT_PUBLIC_CATALOG_SOURCE && env.NEXT_PUBLIC_CATALOG_SOURCE !== 'static') throw new Error('Public-only deployment requires the bundled public catalogue');
  if (env.COMPANY_SOURCE && env.COMPANY_SOURCE !== 'static') throw new Error('Public-only deployment requires the bundled public company pages');
  if (env.PAGES_STATIC_PREVIEW === '1') throw new Error('Public-only deployment must not publish CMS preview fixtures');
  return 'public-only';
}
