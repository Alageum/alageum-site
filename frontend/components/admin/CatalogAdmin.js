'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { changeAdminVisibility, createAdminProduct, getAdminProduct, listAdminCategories, listAdminProducts, updateAdminProduct } from '@/lib/api/catalogAdmin';
import { catalogPrice, editorDraft, editorPayload, statusNames } from '@/lib/catalog/admin';

const permission = 'catalog.manage';
function errorMessage(error) {
  if (error.status === 403) return 'Нет права платформы на управление каталогом. Обратитесь к владельцу платформы.';
  if (error.code === 'catalog_unique_conflict') return 'Такой артикул, ID или адрес уже занят. Измените значение и повторите.';
  if (error.status === 422) return `Сервер отклонил данные. ${error.details?.map?.(item => `${item.loc?.slice(1).join('.')}: ${item.msg}`).join('; ') || error.message}`;
  return error.message || 'Не удалось выполнить запрос';
}
function ProductEditor({ product, categories, onSaved, onClose }) {
  const [draft, setDraft] = useState(() => editorDraft(product, categories[0]?.id));
  const [initial, setInitial] = useState(() => JSON.stringify(editorDraft(product, categories[0]?.id)));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const dirty = JSON.stringify(draft) !== initial;
  useEffect(() => {
    if (!dirty) return;
    const unload = (event) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event) => {
      const link = event.target.closest?.('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      if (!window.confirm('Есть несохранённые изменения. Покинуть редактор?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  function close() { if (!dirty || window.confirm('Отменить несохранённые изменения?')) onClose(); }
  async function save(event) {
    event.preventDefault();
    if (busyRef.current || conflict) return;
    setError('');
    let payload;
    try { payload = editorPayload(draft, product); } catch (reason) { setError(reason.message); return; }
    busyRef.current = true; setBusy(true);
    try {
      const saved = product ? await updateAdminProduct(product.id, payload) : await createAdminProduct(payload);
      setInitial(JSON.stringify(draft)); onSaved(saved);
    } catch (reason) {
      if (reason.code === 'catalog_version_conflict') { setConflict(true); setError('Товар уже изменён в другой сессии. Ваш черновик оставлен ниже. Скопируйте нужные изменения и загрузите актуальную версию.'); }
      else setError(errorMessage(reason));
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function reload() {
    if (!window.confirm('Загрузить актуальную версию и сбросить ваш несохранённый черновик?')) return;
    setBusy(true);
    try { const fresh = await getAdminProduct(product.id); onSaved(fresh, true); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  return <section className="admin-editor" aria-label="Редактор товара"><div className="admin-editor-title"><div><p className="catalog-kicker">{product ? `ВЕРСИЯ ${product.version}` : 'НОВАЯ ПОЗИЦИЯ'}</p><h2>{product ? 'Редактировать товар' : 'Добавить товар'}</h2></div><button type="button" className="catalog-button" disabled={busy} onClick={close}>Закрыть</button></div>
    <form onSubmit={save} className="admin-product-form"><fieldset disabled={busy}><div className="admin-form-grid">
      <label>Название<input required maxLength={500} value={draft.name} onChange={event => update('name', event.target.value)} /></label>
      <label>Категория<select aria-label="Категория" required value={draft.category_id} onChange={event => update('category_id', event.target.value)}><option value="">Выберите категорию</option>{categories.map(category => <option key={category.id} value={category.id}>{category.translations?.ru?.name || category.slug}{category.is_published ? '' : ' (скрыта)'}</option>)}</select></label>
      <label>Постоянный ID<input required disabled={!!product} maxLength={240} value={draft.public_key} onChange={event => { update('public_key', event.target.value); if (!product && draft.slug === draft.public_key) update('slug', event.target.value); }} placeholder="new-product" /></label>
      <label>Адрес карточки<input required maxLength={240} value={draft.slug} onChange={event => update('slug', event.target.value)} /></label>
      <label>Артикул / обозначение<input maxLength={120} value={draft.sku} onChange={event => update('sku', event.target.value)} /></label>
      <label>Видимость<select aria-label="Видимость" value={draft.status} onChange={event => update('status', event.target.value)}>{Object.entries(statusNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label>Цена<select aria-label="Цена" value={draft.price_mode} onChange={event => update('price_mode', event.target.value)}><option value="on_request">По запросу</option><option value="fixed">Фиксированная цена</option></select></label>
      <label>Валюта ISO<input maxLength={3} value={draft.currency} onChange={event => update('currency', event.target.value.toUpperCase())} placeholder="Выберите валюту" required={draft.price_mode === 'fixed'} /></label>
      {draft.price_mode === 'fixed' && <label>Сумма<input inputMode="decimal" required value={draft.price} onChange={event => update('price', event.target.value)} placeholder="0.00" /></label>}
    </div><label>Описание<textarea rows={4} value={draft.description} onChange={event => update('description', event.target.value)} /></label>
    <details><summary>Характеристики и ссылки на публичные изображения</summary><p className="catalog-meta">Структурированные характеристики сохраняются без потери полей. Медиа: массив объектов с path, kind: image и alt. Разрешены только публичные пути каталога, без загрузки файлов.</p><label>Характеристики (JSON-объект)<textarea spellCheck={false} rows={12} value={draft.specs} onChange={event => update('specs', event.target.value)} /></label><label>Публичные медиа (JSON-массив)<textarea spellCheck={false} rows={5} value={draft.media} onChange={event => update('media', event.target.value)} /></label></details>
    </fieldset>{error && <p className="admin-error" role="alert" aria-label="Ошибка редактора каталога">{error}</p>}{conflict && <button type="button" className="catalog-button" disabled={busy} onClick={reload}>Загрузить актуальную версию</button>}<div className="inline-actions"><button className="catalog-button primary" disabled={busy || conflict}>{busy ? 'Сохранение…' : 'Сохранить в базе'}</button><button type="button" className="catalog-button" disabled={busy} onClick={close}>Отмена</button><span role="status" className="catalog-meta">{dirty ? 'Есть несохранённые изменения' : 'Изменений нет'}</span></div></form>
  </section>;
}

export default function CatalogAdmin() {
  const { profile, loading, hasPermission } = useAuth();
  const allowed = hasPermission(permission);
  const [categories, setCategories] = useState([]);
  const [result, setResult] = useState({ items: [], total: 0, page: 1, page_size: 20 });
  const [query, setQuery] = useState({ page: '1', page_size: '20', q: '', status: '' });
  const [search, setSearch] = useState('');
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState(null);
  const [editorKey, setEditorKey] = useState(0);
  const [busyId, setBusyId] = useState('');
  const visibilityPending = useRef(false);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    if (!allowed) return;
    const request = ++requestId.current;
    setState('loading'); setError('');
    try {
      const [items, categoryPage] = await Promise.all([listAdminProducts(Object.fromEntries(Object.entries(query).filter(([, value]) => value))), listAdminCategories()]);
      if (request !== requestId.current) return;
      setResult(items); setCategories(categoryPage.items); setState('ready');
    } catch (reason) { if (request === requestId.current) { setError(errorMessage(reason)); setState('error'); } }
  }, [allowed, query]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); requestId.current += 1; }; }, [load]);
  function changeQuery(next) {
    requestId.current += 1;
    setState('loading');
    setQuery(next);
  }
  async function visibility(product) {
    if (visibilityPending.current) return;
    const hide = product.status !== 'hidden';
    if (!window.confirm(hide ? 'Скрыть товар из публичного каталога? Данные сохранятся.' : 'Восстановить товар в черновики? Для публикации измените видимость в редакторе.')) return;
    visibilityPending.current = true;
    setBusyId(product.id); setError('');
    try { await changeAdminVisibility(product.id, hide ? 'hide' : 'restore', product.version); setNotice(hide ? 'Товар скрыт. Он больше не доступен в API-каталоге.' : 'Товар восстановлен в черновики.'); await load(); }
    catch (reason) { setError(reason.code === 'catalog_version_conflict' ? 'Товар изменён в другой сессии. Обновите список перед повтором.' : errorMessage(reason)); }
    finally { visibilityPending.current = false; setBusyId(''); }
  }
  if (loading) return <div className="catalog-page" role="status">Проверка доступа…</div>;
  if (!profile) return <div className="catalog-page"><h1>Управление каталогом</h1><p>Войдите в аккаунт администратора каталога.</p><Link className="catalog-button primary" href="/login?next=/admin/catalog">Войти</Link></div>;
  if (!allowed) return <div className="catalog-page"><h1>Нет доступа к управлению каталогом</h1><p>Нужно отдельное право платформы catalog.manage. Администратор организации не получает его автоматически.</p></div>;
  return <div className="catalog-page admin-catalog"><nav className="breadcrumbs"><Link href="/catalog?source=api">Публичный API-каталог</Link><span>/</span><span>Управление</span></nav><div className="catalog-heading compact-heading"><div><p className="catalog-kicker">ПЛАТФОРМА / КАТАЛОГ</p><h1>Товары и цены</h1></div><button className="catalog-button primary" disabled={!!editor || state !== 'ready'} onClick={() => { setEditor({ product: null }); setEditorKey(key => key + 1); }}>Добавить товар +</button></div><p className="admin-boundary">Изменения сохраняются на сервере. Скрытие сохраняет запись и историю. Валюта задаётся явно; без цены позиция показывается «По запросу».</p>
    {notice && <p role="status" className="catalog-notice">{notice}</p>}{error && <p role="alert" className="admin-error" aria-label="Ошибка управления каталогом">{error}</p>}
    {editor ? <ProductEditor key={editorKey} product={editor.product} categories={categories} onClose={() => setEditor(null)} onSaved={(product, reopen) => { setNotice(reopen ? 'Загружена актуальная версия.' : 'Товар сохранён в базе.'); setEditor(reopen ? { product } : null); setEditorKey(key => key + 1); void load(); }} /> : <>
      <form className="admin-toolbar" onSubmit={event => { event.preventDefault(); changeQuery(previous => ({ ...previous, page: '1', q: search.trim() })); }}><label>Поиск<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Название, ID, артикул" maxLength={200}/></label><label>Видимость<select aria-label="Видимость" value={query.status} onChange={event => changeQuery(previous => ({ ...previous, status: event.target.value, page: '1' }))}><option value="">Все записи</option>{Object.entries(statusNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="catalog-button">Найти</button><button className="catalog-button" type="button" onClick={() => void load()}>Обновить</button></form>
      {state === 'loading' ? <p role="status">Загрузка каталога…</p> : state === 'error' ? <button className="catalog-button" onClick={() => void load()}>Повторить загрузку</button> : <><div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Товар</th><th>Цена</th><th>Видимость</th><th>Действия</th></tr></thead><tbody>{result.items.map(product => <tr key={product.id}><td><strong>{product.translations?.ru?.name || product.slug}</strong><small className="product-sku">{product.sku || product.public_key}</small><small className="catalog-meta">Версия {product.version}</small></td><td>{catalogPrice(product)}</td><td>{statusNames[product.status]}</td><td><div className="row-actions"><button className="catalog-button compact" disabled={!!busyId} onClick={() => { setEditor({ product }); setEditorKey(key => key + 1); }}>Изменить</button><button className="text-button" disabled={!!busyId} onClick={() => void visibility(product)}>{busyId === product.id ? 'Сохранение…' : product.status === 'hidden' ? 'Восстановить' : 'Скрыть'}</button></div></td></tr>)}</tbody></table></div>{!result.items.length && <p>Товары не найдены.</p>}<div className="catalog-pagination"><span>Всего: {result.total}</span><button className="catalog-button" disabled={result.page <= 1} onClick={() => changeQuery(previous => ({ ...previous, page: String(result.page - 1) }))}>← Назад</button><span>Страница {result.page}</span><button className="catalog-button" disabled={result.page * result.page_size >= result.total} onClick={() => changeQuery(previous => ({ ...previous, page: String(result.page + 1) }))}>Далее →</button></div></>}
    </>}
  </div>;
}
