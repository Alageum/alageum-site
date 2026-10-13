// Only original database IDs are sent. Public keys remain display/navigation IDs.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const QUOTE_LIMIT = 100;
export function quoteScope(profile) {
  return profile?.user?.id && profile?.organization?.id ? `${profile.organization.id}:${profile.user.id}` : null;
}
export function selectionFingerprint(items) {
  return JSON.stringify(items.map(item => ({ id: item.id, product_id: item.databaseId || null, quantity: item.quantity })).sort((a, b) => a.id.localeCompare(b.id)));
}
export function quotePayload(items, comment = '') {
  if (!items.length) throw new Error('Добавьте хотя бы одну позицию из актуального каталога.');
  if (items.length > QUOTE_LIMIT) throw new Error(`В одном запросе может быть не более ${QUOTE_LIMIT} позиций.`);
  const seen = new Set();
  const lines = items.map(item => {
    if (!UUID.test(item.databaseId || '')) throw new Error('В подборке есть устаревшая позиция. Удалите её и добавьте заново из актуального каталога.');
    if (seen.has(item.databaseId)) throw new Error('Одна позиция добавлена несколько раз. Проверьте подборку.');
    seen.add(item.databaseId);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) throw new Error('Количество должно быть целым числом от 1 до 999.');
    return { product_id: item.databaseId, quantity: item.quantity };
  }).sort((a, b) => a.product_id.localeCompare(b.product_id));
  if (comment.length > 4000) throw new Error('Сообщение должно содержать не более 4000 символов.');
  return { comment: comment.trim() || null, items: lines };
}
export function canReuseAttempt(attempt, items, comment) {
  return Boolean(attempt && UUID.test(attempt.key || '') && attempt.selection === selectionFingerprint(items) && attempt.comment === comment);
}
export function decodeDraft(raw) {
  if (!raw || raw === '{}') return { comment: '', attempt: null, corrupt: false };
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.comment !== 'string' || value.comment.length > 4000) throw new Error('Invalid draft');
    const attempt = value.attempt || null;
    if (attempt && (!UUID.test(attempt.key || '') || typeof attempt.selection !== 'string' || typeof attempt.comment !== 'string' || !Array.isArray(attempt.payload?.items) || (attempt.quoteId && !UUID.test(attempt.quoteId)))) throw new Error('Invalid attempt');
    if (attempt) {
      const original = JSON.parse(attempt.selection);
      if (!Array.isArray(original)) throw new Error('Invalid selection');
      const canonical = quotePayload(original.map(item => ({ id: item.id, databaseId: item.product_id, quantity: item.quantity })), attempt.comment);
      if (JSON.stringify(attempt.payload) !== JSON.stringify(canonical)) throw new Error('Stored payload does not match reviewed selection');
    }
    return { comment: value.comment, attempt, corrupt: false };
  } catch { return { comment: '', attempt: null, corrupt: true }; }
}
export function quoteError(error) {
  if (error.status === 401) return 'Сессия завершилась. Войдите снова: подборка и сохранённый черновик останутся в этой вкладке.';
  if (error.status === 403) return 'У вашей учётной записи нет доступа к этому действию.';
  if (error.status === 404) return 'Запрос не найден или недоступен вашей учётной записи.';
  if (error.code === 'quote_product_unavailable') return 'Одна из выбранных позиций больше не опубликована. Обновите каталог и исправьте подборку. Запрос не создан.';
  if (error.code === 'idempotency_conflict') return 'Сохранённая попытка не совпадает с данными на сервере. Откройте мои запросы перед новой отправкой.';
  if (error.status === 429) return 'Слишком много попыток. Подождите немного и повторите с теми же данными.';
  if (error.status === 422) return 'Проверьте выбранные товары, количество и сообщение. Сервер не принял запрос.';
  if (!error.status || error.status >= 500) return 'Не удалось подтвердить сохранение. Запрос мог сохраниться. Повторите без изменений: та же попытка не создаст дубликат.';
  return error.message || 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}
export function hasQuoteSnapshot(item) {
  const snapshot = item?.product_snapshot;
  return Boolean(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && Object.keys(snapshot).length);
}
export const quoteTitle = item => item?.product_snapshot?.translations?.ru?.name || item?.product_snapshot?.translations?.en?.name || item?.product_snapshot?.sku || item?.product_snapshot?.public_key || 'Позиция запроса';
export function quoteDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Дата не указана';
}
export const quoteStatus = status => status === 'submitted' ? 'Сохранён' : status;
