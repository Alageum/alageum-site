export const SALES_EMAIL = 'sales@alageum.com';
export const SALES_PHONE = '+7 771 005 22 22';
export const INQUIRY_INTENTS = [
  { value: 'quote', label: 'Коммерческое предложение' },
  { value: 'selection', label: 'Помощь с подбором оборудования' },
  { value: 'consultation', label: 'Консультация по проекту' },
  { value: 'service', label: 'Сервис и технический вопрос' },
];
export const FIELD_LIMITS = { contactName: 120, company: 180, email: 254, phone: 40, project: 160, location: 180, deadline: 120, description: 4000, solution: 180 };
const first = (value) => Array.isArray(value) ? value[0] : value;
const line = (value) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
export function initialInquiry(query = {}) {
  const intent = line(first(query.intent));
  return { intent: INQUIRY_INTENTS.some((item) => item.value === intent) ? intent : 'quote', solution: line(first(query.solution)).slice(0, FIELD_LIMITS.solution), project: '', location: '', deadline: '', description: '', company: '', contactName: '', email: '', phone: '' };
}
export function normalizeInquiry(values = {}) {
  return { ...initialInquiry(), ...Object.fromEntries(Object.keys(FIELD_LIMITS).map((key) => [key, key === 'description' ? String(values[key] || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : line(values[key])])), intent: INQUIRY_INTENTS.some((item) => item.value === values.intent) ? values.intent : 'quote' };
}
export function validateInquiry(values = {}) {
  const draft = normalizeInquiry(values);
  const errors = {};
  if (draft.contactName.length < 2) errors.contactName = 'Укажите имя контактного лица, минимум 2 символа.';
  if (draft.description.length < 10) errors.description = 'Кратко опишите задачу, минимум 10 символов.';
  if (!draft.email && !draft.phone) errors.email = 'Укажите email или телефон для ответа.';
  if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) errors.email = 'Проверьте email, например name@company.kz.';
  if (draft.phone && (!/^[+\d\s().-]+$/.test(draft.phone) || draft.phone.replace(/\D/g, '').length < 7 || draft.phone.replace(/\D/g, '').length > 15)) errors.phone = 'Укажите телефон с кодом страны, от 7 до 15 цифр.';
  for (const [key, limit] of Object.entries(FIELD_LIMITS)) if (draft[key].length > limit) errors[key] = `Не более ${limit} символов.`;
  return errors;
}
export function inquiryItems(selection, products) {
  const catalog = new Map((Array.isArray(products) ? products : []).map((product) => [product.id, product]));
  const seen = new Set();
  return (Array.isArray(selection) ? selection : []).flatMap((item) => {
    const product = catalog.get(item?.id);
    if (!product || seen.has(item.id)) return [];
    seen.add(item.id);
    return [{ id: product.id, sku: line(product.sku || product.id), name: line(product.name), quantity: Math.min(999, Math.max(1, Math.floor(Number(item.quantity)) || 1)), source: product.source === 'official' ? 'official' : product.source === 'demo' ? 'demo' : 'api' }];
  });
}
export function documentNames(files = []) {
  return [...new Set(Array.from(files).map((file) => line(typeof file === 'string' ? file : file?.name).split(/[\\/]/).at(-1)?.slice(0, 180)).filter(Boolean))].slice(0, 10);
}
export function inquirySubject(values) {
  const draft = normalizeInquiry(values);
  return `Запрос ALAGEUM: ${draft.project || INQUIRY_INTENTS.find((item) => item.value === draft.intent).label}`;
}
export function buildInquiryText(values, items = [], documents = []) {
  const draft = normalizeInquiry(values);
  const intent = INQUIRY_INTENTS.find((item) => item.value === draft.intent).label;
  const lines = [inquirySubject(draft), '', `Цель: ${intent}`];
  for (const [key, label] of [['project', 'Проект'], ['solution', 'Направление'], ['location', 'Место поставки / объекта'], ['deadline', 'Планируемый срок']]) if (draft[key]) lines.push(`${label}: ${draft[key]}`);
  lines.push('', 'ЗАДАЧА', draft.description || 'Описание не указано.', '', 'ОБОРУДОВАНИЕ');
  if (!items.length) lines.push('Нужна помощь с подбором. Конкретные позиции не выбраны.');
  items.forEach((item, index) => lines.push(`${index + 1}. ${item.name} (${item.sku}) — ${item.quantity} шт.${item.source === 'demo' ? ' [СИНТЕТИЧЕСКИЙ ДЕМО-ПРИМЕР, НЕ РЕАЛЬНЫЙ ТОВАР]' : item.source === 'official' ? ' [публичная серия / семейство; исполнение нужно уточнить]' : ''}`));
  const names = documentNames(documents);
  if (names.length) lines.push('', 'ПЛАНИРУЕМЫЕ ДОКУМЕНТЫ (ТОЛЬКО НАЗВАНИЯ)', ...names.map((name) => `- ${name}`), 'Сами файлы не приложены. Приложите их отдельно в почтовой программе, если требуется.');
  lines.push('', 'КОНТАКТ ДЛЯ ОТВЕТА', `Имя: ${draft.contactName || 'Не указано'}`);
  if (draft.company) lines.push(`Компания: ${draft.company}`);
  if (draft.email) lines.push(`Email: ${draft.email}`);
  if (draft.phone) lines.push(`Телефон: ${draft.phone}`);
  lines.push('', 'Просьба уточнить исполнение, технические параметры, стоимость, наличие и сроки поставки.');
  if (items.some((item) => item.source === 'demo')) lines.push('ВНИМАНИЕ: список содержит синтетические тестовые позиции. Они не описывают реальную продукцию ALAGEUM.');
  lines.push('', 'Подготовлено локально на сайте. Этот текст не является заказом, счётом или подтверждением отправки.');
  return lines.join('\n');
}
export function buildEmailDraft(values, text, maxLength = 1800) {
  const subject = encodeURIComponent(inquirySubject(values));
  const base = `mailto:${SALES_EMAIL}?subject=${subject}`;
  const full = `${base}&body=${encodeURIComponent(text)}`;
  return full.length <= maxLength ? { href: full, includesBody: true } : { href: base, includesBody: false };
}
