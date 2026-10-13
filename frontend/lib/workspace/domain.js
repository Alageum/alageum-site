// This model is intentionally browser-only demo data, never an order or quotation.
export const WORKSPACE_STATUSES = [
  { id: 'draft', label: 'Черновик', short: 'Черновик', description: 'Проверьте данные и запустите локальный демо-сценарий.' },
  { id: 'submitted', label: 'В демо-очереди', short: 'В очереди', description: 'Следующий шаг — переключиться в роль демо-менеджера. Реальная отправка не выполнялась.' },
  { id: 'review', label: 'Демо-проверка', short: 'Проверка', description: 'Этап выбран в этом браузере. Сотрудник компании не получал и не проверял запрос.' },
  { id: 'needs-information', label: 'Нужно уточнение · демо', short: 'Уточнение', description: 'Посмотрите локальный комментарий, дополните запрос и верните его на демо-проверку.' },
  { id: 'quoted', label: 'Демо-ответ готов', short: 'Ответ готов', description: 'Это результат учебного сценария, а не коммерческое предложение, цена или обязательство поставки.' },
];
export const WORKSPACE_LIMITS = { records: 50, items: 50, documents: 20, comments: 100, history: 200 };
const statusIds = new Set(WORKSPACE_STATUSES.map((status) => status.id));
const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const cleanText = (value, max = 200) => typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : '';
const cleanDate = (value, fallback) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
const cleanId = (value) => cleanText(value, 100).replace(/[^a-zA-Z0-9_-]/g, '');
export const getWorkspaceStatus = (id) => WORKSPACE_STATUSES.find((status) => status.id === id) || WORKSPACE_STATUSES[0];
export const documentNames = (value) => Array.isArray(value)
  ? [...new Set(value.filter((name) => typeof name === 'string').map((name) => cleanText(name.split(/[\\/]/).at(-1), 180)).filter(Boolean))].slice(0, WORKSPACE_LIMITS.documents) : [];

export function normalizeInquiry(input, { now = '1970-01-01T00:00:00.000Z', id = 'demo-request' } = {}) {
  if (!plain(input)) return null;
  const createdAt = cleanDate(input.createdAt, now);
  const requestId = cleanId(input.id) || cleanId(id) || 'demo-request';
  const seen = new Set();
  const items = (Array.isArray(input.items) ? input.items : []).filter(plain).flatMap((item) => {
    const itemId = cleanId(item.id);
    if (!itemId || seen.has(itemId)) return [];
    seen.add(itemId);
    const quantity = Math.floor(Number(item.quantity));
    return [{ id: itemId, name: cleanText(item.name, 240) || itemId, sku: cleanText(item.sku, 80), quantity: Number.isFinite(quantity) ? Math.min(999, Math.max(1, quantity)) : 1, source: cleanText(item.source, 100) || 'demo' }];
  }).slice(0, WORKSPACE_LIMITS.items);
  const comments = (Array.isArray(input.comments) ? input.comments : []).filter(plain).flatMap((comment, index) => {
    const text = cleanText(comment.text, 4000);
    return text ? [{ id: cleanId(comment.id) || `${requestId}-comment-${index}`, text, role: comment.role === 'manager' ? 'manager' : 'customer', createdAt: cleanDate(comment.createdAt, createdAt) }] : [];
  }).slice(-WORKSPACE_LIMITS.comments);
  const history = (Array.isArray(input.history) ? input.history : []).filter(plain).map((entry, index) => ({
    id: cleanId(entry.id) || `${requestId}-event-${index}`, text: cleanText(entry.text, 400),
    status: statusIds.has(entry.status) ? entry.status : 'draft', role: entry.role === 'manager' ? 'manager' : 'customer', createdAt: cleanDate(entry.createdAt, createdAt),
  })).filter((entry) => entry.text).slice(-WORKSPACE_LIMITS.history);
  // Explicit allowlist: arbitrary fields, file bytes, credentials and banking fields are dropped.
  return {
    id: requestId, createdAt, updatedAt: cleanDate(input.updatedAt, createdAt),
    subject: cleanText(input.subject, 180) || 'Запрос на оборудование', text: cleanText(input.text, 24000),
    contactName: cleanText(input.contactName, 160), company: cleanText(input.company, 240), email: cleanText(input.email, 200), phone: cleanText(input.phone, 100),
    documents: documentNames(input.documents), items, status: statusIds.has(input.status) ? input.status : 'draft', comments, history,
  };
}

export function decodeInquiries(raw) {
  try {
    const data = JSON.parse(raw || '[]');
    if (!Array.isArray(data)) return { inquiries: [], corrupt: true };
    const ids = new Set();
    const inquiries = data.filter((item) => plain(item) && cleanId(item.id)).flatMap((item) => {
      const record = normalizeInquiry(item);
      if (ids.has(record.id)) return [];
      ids.add(record.id);
      return [record];
    }).slice(0, WORKSPACE_LIMITS.records);
    return { inquiries, corrupt: false };
  } catch { return { inquiries: [], corrupt: true }; }
}

export function applyInquiryPatch(record, patch, { now, eventId = 'demo-event' } = {}) {
  if (!record || !plain(patch)) return record;
  const timestamp = cleanDate(now, record.updatedAt);
  const role = patch.role === 'manager' ? 'manager' : 'customer';
  const allowed = {};
  for (const key of ['subject', 'text', 'contactName', 'company', 'email', 'phone', 'documents', 'items', 'status']) {
    if (Object.hasOwn(patch, key)) allowed[key] = patch[key];
  }
  const next = normalizeInquiry({ ...record, ...allowed, updatedAt: timestamp });
  const commentText = cleanText(patch.comment, 4000);
  if (commentText) next.comments = [...next.comments, { id: `${eventId}-comment`, text: commentText, role, createdAt: timestamp }].slice(-WORKSPACE_LIMITS.comments);
  const statusChanged = record.status !== next.status;
  const detailsChanged = ['subject', 'text', 'contactName', 'company', 'email', 'phone', 'documents', 'items'].some((key) => JSON.stringify(record[key]) !== JSON.stringify(next[key]));
  if (!statusChanged && !detailsChanged && !commentText) return record;
  const text = statusChanged ? `Локальный этап: ${getWorkspaceStatus(next.status).label}` : commentText ? 'Добавлен локальный комментарий' : 'Данные запроса обновлены в браузере';
  next.history = [...next.history, { id: eventId, text, status: next.status, role, createdAt: timestamp }].slice(-WORKSPACE_LIMITS.history);
  return next;
}

export function createDemoInquiry() {
  return {
    subject: 'Учебный проект · Подстанция для нового объекта',
    text: 'Синтетический пример: нужна предварительная проверка комплектации для учебного объекта. Параметры оборудования условные. Для демонстрации менеджер может запросить уточнение, а заказчик — добавить ответ.',
    contactName: 'Демо-заказчик', company: 'Учебная компания · вымышленный пример', email: 'demo@example.invalid', phone: '',
    documents: ['DEMO_техническое_задание.pdf', 'DEMO_карточка_компании.pdf'],
    items: [{ id: 'demo-008', name: 'Демо · комплектная подстанция 630', sku: 'DEMO-008', quantity: 2, source: 'demo' }], status: 'draft',
  };
}
