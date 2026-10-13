'use client';import LocaleElement from "@/components/locale/LocaleElement";
import Link from "@/components/locale/LocaleLink";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';import {
  useRouter } from "@/components/locale/navigation";
import { useAuth } from '@/components/AuthProvider';
import { useApiSelection } from '@/components/catalog/ApiSelectionProvider';
import { loadApiCatalog } from '@/lib/catalog/source';
import { liveHref } from '@/lib/catalog/apiData';
import { catalogPrice } from '@/lib/catalog/admin';
import { createQuote } from '@/lib/api/quotes';
import { canReuseAttempt, QUOTE_LIMIT, quoteError, quoteScope } from '@/lib/quotes/model';
import { completeQuoteAttempt, prepareQuoteAttempt, resetQuoteDraft, saveQuoteComment, useQuoteDraft } from '@/lib/quotes/store';
import { createQuoteContinuation } from '@/lib/quotes/continuation';

export default function LiveInquiry() {
  const { authScope } = useAuth();
  // Every login starts an independent UI flow, even for the same owner/tenant.
  // The old request can still record its original scoped receipt in the background.
  return <LiveInquiryFlow key={authScope || 'anonymous'} />;
}

function LiveInquiryFlow() {
  const { profile, loading, hasPermission, authScope, isAuthScopeCurrent } = useAuth(),router = useRouter(),selection = useApiSelection();
  const scope = quoteScope(profile),draft = useQuoteDraft(scope);
  const [catalog, setCatalog] = useState({ status: 'loading', items: [] });
  const [revision, setRevision] = useState(0),[error, setError] = useState(''),[pending, setPending] = useState(false);
  const submitting = useRef(false),errorBox = useRef(null),activeFlow = useRef(null);
  useLayoutEffect(() => {
    const flow = createQuoteContinuation(authScope, isAuthScopeCurrent);
    activeFlow.current = flow;
    return () => {flow.dispose();if (activeFlow.current === flow) activeFlow.current = null;};
  }, [authScope, isAuthScopeCurrent]);
  useEffect(() => {
    let active = true;
    loadApiCatalog().then((items) => {if (active) setCatalog({ status: 'ready', items });}).
    catch(() => {if (active) setCatalog({ status: 'error', items: [] });});
    return () => {active = false;};
  }, [revision]);
  useEffect(() => {if (error) errorBox.current?.focus();}, [error]);
  const reusable = canReuseAttempt(draft.attempt, selection.items, draft.comment);
  const completed = reusable && draft.attempt.quoteId;
  const unavailable = selection.items.filter((item) => !catalog.items.some((product) => product.id === item.id && product.databaseId === item.databaseId));
  function refresh() {setCatalog({ status: 'loading', items: [] });setRevision((value) => value + 1);}
  function updateComment(value) {
    setError('');
    try {saveQuoteComment(scope, value);} catch (reason) {setError(reason.message);}
  }
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || !scope || completed) return;
    if (selection.storageUnavailable) {setError('Разрешите хранилище браузера перед отправкой: подборка должна сохраниться при перезагрузке.');return;}
    const flow = activeFlow.current;
    const isCurrent = () => Boolean(flow && activeFlow.current === flow && flow.isCurrent());
    if (!isCurrent()) return;
    submitting.current = true;setPending(true);setError('');
    let attempt;
    try {
      attempt = prepareQuoteAttempt(scope, selection.items);
      if (attempt.quoteId) {router.push(`/b2b/quotes/${attempt.quoteId}`);return;}
      const originalScope = scope,originalKey = attempt.key;
      const quote = await createQuote(attempt.payload, originalKey, (quoteId) => {
        // Record an acknowledged UUID only in its original owner/tenant/key.
        // A newer attempt is protected by completeQuoteAttempt's key check.
        completeQuoteAttempt(originalScope, originalKey, quoteId);
      });
      // Leaving this form or changing account does not cancel a server commit.
      // Save the original attempt above, but never hijack a newer navigation.
      if (isCurrent()) router.replace(`/b2b/quotes/${quote.id}`);
    } catch (reason) {if (isCurrent()) setError(attempt ? quoteError(reason) : reason.message);} finally
    {if (isCurrent()) {submitting.current = false;setPending(false);}}
  }
  return <LocaleElement as="div" className="catalog-page inquiry-page live-inquiry">
    <LocaleElement as="nav" className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/selection?source=api">Подборка</Link><LocaleElement as="span">/</LocaleElement><LocaleElement as="span">Запрос КП</LocaleElement></LocaleElement>
    <LocaleElement as="div" className="catalog-heading compact-heading"><LocaleElement as="div"><LocaleElement as="p" className="catalog-kicker">АКТУАЛЬНЫЙ КАТАЛОГ</LocaleElement><LocaleElement as="h1">Запрос коммерческого предложения</LocaleElement></LocaleElement><Link className="catalog-button" href="/b2b/quotes">Мои запросы →</Link></LocaleElement>
    <LocaleElement as="p" className="inquiry-note">Запрос сохранится в базе и будет доступен в вашем B2B кабинете. Отправка менеджеру и CRM пока не подключена. Заказ и оплата не оформляются.</LocaleElement>
    {loading ? <LocaleElement as="p" role="status">Проверка сессии…</LocaleElement> : !profile ? <LocaleElement as="div" className="card quote-login"><LocaleElement as="h2">Войдите, чтобы отправить запрос</LocaleElement><LocaleElement as="p">Состав и количество позиций сохранятся при входе. После входа проверьте подборку и добавьте сообщение.</LocaleElement><Link className="button" href="/login?next=%2Finquiry%3Fsource%3Dapi">Войти и продолжить</Link></LocaleElement> : <LocaleElement as="p" className="catalog-meta">Организация: {profile.organization.name} · {profile.user.email}</LocaleElement>}
    {selection.storageUnavailable && <LocaleElement as="p" role="alert">Подборка хранится только в памяти: хранилище браузера недоступно. Не закрывайте страницу.</LocaleElement>}
    {completed ? <LocaleElement as="div" className="card" role="status"><LocaleElement as="h2">Запрос сохранён</LocaleElement><LocaleElement as="p">Повторная отправка этой подборки не нужна.</LocaleElement><Link className="button" href={`/b2b/quotes/${completed}`}>Открыть сохранённый запрос</Link><LocaleElement as="div" className="inquiry-actions"><LocaleElement as="button" className="catalog-button" type="button" onClick={() => {try {resetQuoteDraft(scope);setError('');} catch (reason) {setError(reason.message);}}}>Подготовить новый запрос с этой подборкой</LocaleElement></LocaleElement><LocaleElement as="p">Новая отправка создаст отдельный запрос с теми же позициями.</LocaleElement>{error && <LocaleElement as="p" className="inquiry-error" role="alert">{error}</LocaleElement>}<LocaleElement as="p"><Link href="/selection?source=api">Изменить подборку для нового запроса →</Link></LocaleElement></LocaleElement> : <LocaleElement as="form" onSubmit={submit} aria-busy={pending}>
      <LocaleElement as="fieldset" className="inquiry-section" disabled={pending}><LocaleElement as="legend"><LocaleElement as="span">01</LocaleElement>Проверьте оборудование</LocaleElement>
        <LocaleElement as="p">От 1 до 999 единиц каждой позиции, до {QUOTE_LIMIT} позиций в запросе. Каталожные цены справочные; наличие и условия поставки уточняются отдельно.</LocaleElement>
        {catalog.status === 'loading' && <LocaleElement as="p" role="status">Загрузка актуальных позиций…</LocaleElement>}
        {catalog.status === 'error' && <LocaleElement as="div" className="inquiry-error-summary" role="alert"><LocaleElement as="p">Не удалось загрузить актуальный каталог. Новую отправку можно выполнить после проверки позиций.</LocaleElement><LocaleElement as="button" className="catalog-button" type="button" onClick={refresh}>Обновить каталог</LocaleElement></LocaleElement>}
        {selection.items.length === 0 ? <LocaleElement as="div" className="inquiry-empty"><LocaleElement as="p">В подборке пока нет оборудования.</LocaleElement><Link className="catalog-button" href="/catalog?source=api">Выбрать оборудование →</Link></LocaleElement> : <LocaleElement as="div" className="inquiry-equipment">{selection.items.map((item) => {
            const product = catalog.items.find((product) => product.id === item.id && product.databaseId === item.databaseId);
            return <LocaleElement as="div" className="inquiry-item" key={item.id}><LocaleElement as="div"><LocaleElement as="strong">{product ? <Link href={liveHref(product.id)}>{product.name}</Link> : item.id}</LocaleElement><LocaleElement as="small">{product ? `${product.sku || 'Без артикула'} · ${catalogPrice(product)}` : !item.databaseId ? 'Старая подборка: удалите позицию и добавьте её заново из актуального каталога.' : catalog.status === 'ready' ? 'Позиция больше не опубликована. Удалите её или выберите замену.' : 'Проверяем актуальность позиции'}</LocaleElement></LocaleElement><LocaleElement as="label" className="inquiry-quantity">Количество<LocaleElement as="input" type="number" min="1" max="999" step="1" aria-label={`Количество ${product?.sku || item.id}`} value={item.quantity} onChange={(event) => {setError('');selection.setQuantity(item.id, event.target.value);}} /></LocaleElement><LocaleElement as="button" type="button" className="remove-item" aria-label={`Удалить ${product?.sku || item.id}`} onClick={() => {setError('');selection.remove(item.id);}}>×</LocaleElement></LocaleElement>;
          })}</LocaleElement>}
        <LocaleElement as="div" className="inquiry-actions"><Link className="catalog-button" href="/selection?source=api">Изменить подборку →</Link><LocaleElement as="button" className="catalog-button" type="button" onClick={refresh}>Обновить каталог</LocaleElement></LocaleElement>
        {catalog.status === 'ready' && unavailable.length > 0 && !reusable && <LocaleElement as="p" className="inquiry-error" role="alert">Уберите недоступные или устаревшие позиции перед отправкой. Ничего не будет исключено автоматически.</LocaleElement>}
        {selection.items.length > QUOTE_LIMIT && <LocaleElement as="p" className="inquiry-error" role="alert">В подборке больше {QUOTE_LIMIT} позиций. Разделите её на несколько запросов.</LocaleElement>}
      </LocaleElement>
      {profile && <>
        <LocaleElement as="fieldset" className="inquiry-section" disabled={pending || draft.corrupt || draft.storageUnavailable}><LocaleElement as="legend"><LocaleElement as="span">02</LocaleElement>Сообщение к запросу</LocaleElement><LocaleElement as="label" className="inquiry-field">Сообщение (необязательно)<LocaleElement as="textarea" maxLength={4000} value={draft.comment} onChange={(event) => updateComment(event.target.value)} placeholder="Требования к комплектации, сроки или вопросы по оборудованию" aria-describedby="quote-comment-help" /></LocaleElement><LocaleElement as="p" id="quote-comment-help" className="inquiry-help">До 4000 символов. Черновик сообщения хранится в этой вкладке для вашей учётной записи.</LocaleElement></LocaleElement>
        {!hasPermission('quote.create') && <LocaleElement as="p" role="alert">У вашей учётной записи нет разрешения на создание запросов КП.</LocaleElement>}
        {draft.storageUnavailable && <LocaleElement as="p" role="alert">Для безопасной отправки нужно разрешить хранилище браузера. Попытка должна сохраниться до отправки на сервер.</LocaleElement>}
        {draft.corrupt && <LocaleElement as="div" role="alert"><LocaleElement as="p">Черновик в этой вкладке повреждён. Сначала проверьте мои запросы: предыдущая попытка могла сохраниться.</LocaleElement><LocaleElement as="button" className="catalog-button" type="button" onClick={() => {try {resetQuoteDraft(scope);setError('');} catch (reason) {setError(reason.message);}}}>Сбросить повреждённый черновик</LocaleElement></LocaleElement>}
        {draft.attempt && <LocaleElement as="p" className="inquiry-note">Есть сохранённая попытка отправки. Повтор без изменений использует тот же номер попытки. Отправка изменённого сообщения или подборки создаст новый запрос; предыдущий мог уже сохраниться. <Link href="/b2b/quotes">Проверить мои запросы</Link></LocaleElement>}
      </>}
      {error && <LocaleElement as="div" ref={errorBox} tabIndex={-1} className="inquiry-error-summary" role="alert" aria-label="Ошибка запроса КП">{error}</LocaleElement>}
      {profile && <LocaleElement as="div" className="inquiry-submit"><LocaleElement as="button" className="catalog-button primary" type="submit" disabled={pending || selection.storageUnavailable || !hasPermission('quote.create') || draft.corrupt || draft.storageUnavailable || !selection.items.length || selection.items.length > QUOTE_LIMIT || !reusable && (catalog.status !== 'ready' || unavailable.length > 0)}>{pending ? 'Сохранение запроса…' : reusable ? 'Повторить сохранение' : 'Сохранить запрос КП'}</LocaleElement><LocaleElement as="p">Подтверждение появится после ответа сервера. После сохранения откроется карточка запроса.</LocaleElement></LocaleElement>}
    </LocaleElement>}
  </LocaleElement>;
}
