import { hasQuoteSnapshot, UUID } from './model.js';

export const QUOTE_PRINT_TITLE = 'Запрос коммерческого предложения';
export const QUOTE_PRINT_NOTICE = 'Цены справочные, сохранены на дату запроса. Это не коммерческое предложение продавца, не заказ и не обязательство поставить товар по указанной цене. Наличие, итоговую стоимость и условия поставки необходимо согласовать отдельно.';
export const QUOTE_PRINT_FALLBACK = 'Для печати запроса откройте «Версия для печати» и нажмите «Печать». Доступ и сохранённые данные будут проверены заново.';
const text = value => typeof value === 'string' && value.length ? value : null;

// Read only the persisted RFQ contract. Do not enrich old gaps with live catalogue,
// company-profile or contact data, and never convert decimal strings to Number.
export function quotePrintItem(item) {
  const snapshot = hasQuoteSnapshot(item) ? item.product_snapshot : null;
  const name = text(snapshot?.translations?.ru?.name) || text(snapshot?.translations?.en?.name);
  const price = snapshot?.price_mode === 'fixed'
    ? (text(snapshot.price) ? `${snapshot.price}${text(snapshot.currency) ? ` ${snapshot.currency}` : ' (валюта не сохранена)'}` : 'Не сохранена')
    : snapshot?.price_mode === 'on_request' ? 'По запросу' : 'Не сохранена';
  return {
    id: item.id, productId: text(item.product_id) || 'Не сохранён',
    quantity: text(item.quantity) || 'Не сохранено',
    title: name || text(snapshot?.sku) || text(snapshot?.public_key) || 'Позиция запроса',
    sku: text(snapshot?.sku) || 'Не сохранён', price,
    version: Number.isInteger(snapshot?.version) && snapshot.version >= 0 ? String(snapshot.version) : 'Не сохранена',
    missingSnapshot: !snapshot,
    missingName: !name,
  };
}
export function validPrintableQuote(quote, id) {
  return UUID.test(id) && quote?.id === id && Array.isArray(quote.items) && quote.items.length > 0 && quote.items.length <= 100 &&
    typeof quote.created_at === 'string' && !Number.isNaN(Date.parse(quote.created_at)) &&
    (quote.comment === null || typeof quote.comment === 'string') &&
    quote.items.every(item => UUID.test(item?.id || '') && typeof item.quantity === 'string' && /^\d+(?:\.\d+)?$/.test(item.quantity));
}
export function quotePrintDate(value) {
  // An explicit timezone makes the same stored instant unambiguous in a saved copy.
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
}
export function quotePrintError(error) {
  if (error?.status === 401) return 'Сессия завершилась или изменилась. Войдите снова, чтобы открыть запрос.';
  if (error?.status === 403) return 'Доступ к печати запроса не подтверждён. Требуется актуальное разрешение на чтение запросов.';
  if (error?.status === 404) return 'Запрос не найден или недоступен вашей учётной записи в выбранной организации.';
  return 'Не удалось проверить доступ и загрузить сохранённый запрос. Печать недоступна. Повторите попытку.';
}
