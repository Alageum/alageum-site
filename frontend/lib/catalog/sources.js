import registry from './sources-manifest.json' with { type: 'json' };

export const catalogSources = Object.freeze(registry.sources);
export const defaultCatalogSourceId = registry.default_source_id;

// An explicit unknown/conflicting identity never falls back to another PDF.
export function getCatalogSource(value = defaultCatalogSourceId) {
  if (typeof value === 'string') return Object.hasOwn(catalogSources, value) ? catalogSources[value] : null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const identities = [['sourceId', 'id'], ['sourceFileId', 'source_file_id'], ['sourceSha256', 'source_sha256'], ['sourceUrl', 'source_url']]
    .filter(([field]) => value[field] !== undefined && value[field] !== null && value[field] !== '');
  if (!identities.length) return null;
  return Object.values(catalogSources).find(source => identities.every(([field, key]) => value[field] === source[key])) || null;
}

export function isSourcePage(value, page) {
  const source = getCatalogSource(value);
  return Boolean(source && Number.isInteger(page) && page >= 1 && page <= source.page_count);
}

export function getSourcePageAsset(path) {
  const asset = typeof path === 'string' && Object.hasOwn(registry.assets, path) ? registry.assets[path] : null;
  return asset?.representation === 'source-scan' ? { ...asset, path, sourceId: asset.source_id, page: asset.source_pages[0] } : null;
}

export function sourcePageUrl(value, page) {
  const source = getCatalogSource(value);
  if (!source || !isSourcePage(source.id, page)) return null;
  return `/catalog/source?${source.id === defaultCatalogSourceId ? '' : `source=${encodeURIComponent(source.id)}&`}page=${page}`;
}

export function sourcePageImage(value, page) {
  const source = getCatalogSource(value);
  if (!source || !isSourcePage(source.id, page)) return null;
  const path = `${source.page_path_prefix}page-${String(page).padStart(3, '0')}.webp`;
  return getSourcePageAsset(path)?.path || null;
}
