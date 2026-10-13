// Pure edit helpers keep money as decimal strings through to the server.
export const statusNames = { draft: 'Черновик', published: 'Опубликован', hidden: 'Скрыт' };
export function editorDraft(product, categoryId = '') {
  return {
    public_key: product?.public_key || '', slug: product?.slug || '', sku: product?.sku || '',
    category_id: product?.category_id || categoryId,
    name: product?.translations?.ru?.name || '', description: product?.translations?.ru?.description || '',
    status: product?.status || 'draft', price_mode: product?.price_mode || 'on_request',
    price: product?.price || '', currency: product?.currency || '',
    specs: JSON.stringify(product?.specs || {}, null, 2),
    media: JSON.stringify(product?.media || [], null, 2),
  };
}
export function editorPayload(draft, product) {
  if (!draft.name.trim()) throw new Error('Укажите название товара');
  if (!draft.category_id) throw new Error('Выберите категорию');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.public_key)) throw new Error('ID: латинские строчные буквы, цифры, дефисы');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) throw new Error('Адрес: латинские строчные буквы, цифры, дефисы');
  const currency = draft.currency.trim().toUpperCase() || null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new Error('Валюта: трёхбуквенный код ISO, например KZT или USD');
  if (draft.price_mode === 'fixed' && (!/^\d{1,16}(\.\d{1,2})?$/.test(draft.price) || !currency)) throw new Error('Для фиксированной цены укажите неотрицательную сумму (до 2 знаков после точки) и валюту');
  let specs, media;
  try { specs = JSON.parse(draft.specs); media = JSON.parse(draft.media); } catch { throw new Error('Проверьте JSON характеристик и медиа'); }
  if (!specs || Array.isArray(specs) || typeof specs !== 'object' || !Array.isArray(media)) throw new Error('Характеристики должны быть JSON-объектом, медиа — массивом');
  return {
    ...(product ? { version: product.version } : { public_key: draft.public_key }),
    slug: draft.slug, sku: draft.sku.trim() || null, category_id: draft.category_id,
    translations: { ...product?.translations, ru: { ...product?.translations?.ru, name: draft.name.trim(), description: draft.description.trim() } },
    status: draft.status, price_mode: draft.price_mode,
    price: draft.price_mode === 'fixed' ? draft.price : null, currency, specs, media,
  };
}
export function catalogPrice(product) {
  return product?.price_mode === 'fixed' && product.price !== null && product.price !== undefined
    ? `${product.price} ${product.currency || ''}`.trim() : 'По запросу';
}
