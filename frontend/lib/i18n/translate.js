import dictionaries from './dictionaries.json';
function localizedUnits(value, locale) {
  if (!['en', 'zh', 'uz'].includes(locale)) return value;
  return value.replace(/(^|[\s\d/,;:(])(кВА|МВА|кВт|кВ|Вт|мм|кг)(?=$|[\s,.;)/])/g, (_, prefix, unit) => prefix + ({кВА:'kVA',МВА:'MVA',кВт:'kW',кВ:'kV',Вт:'W',мм:'mm',кг:'kg'}[unit]));
}
// Keep source model and standard identifiers inside translated prose as well.
function preserveDesignations(source, translation) {
  const pattern = /[A-ZА-ЯЁ]{2,}(?:\([A-ZА-ЯЁ]+\))?[- /]?\d[A-Za-zА-Яа-яЁё\d.,/()÷√×+–-]*/gu;
  const originals = new Map();
  for (const match of source.matchAll(pattern)) {
    const code = match[0].replace(/[.,]+$/, '');
    if (!/[А-ЯЁ]/.test(code) || /^(?:ТОО|АО|ООН) /.test(code)) continue;
    const signature = code.replace(/\D/g, '');
    if (!originals.has(signature)) originals.set(signature, code);
    else if (originals.get(signature) !== code) originals.set(signature, null);
  }
  if (!originals.size) return translation;
  return translation.replace(pattern, match => {
    const code = match.replace(/[.,]+$/, '');
    const original = originals.get(code.replace(/\D/g, ''));
    return original ? original + match.slice(code.length) : match;
  });
}
export function translateText(value, locale = 'ru', dictionaryOverride) {
  if (typeof value !== 'string' || locale === 'ru') return value;
  const source = value.replace(/\s+/g, ' ').trim();
  const dictionary = dictionaryOverride || dictionaries[locale] || {};
  // Product designations are identifiers, not prose to transliterate.
  if (/^(?:\d*[A-ZА-ЯЁ]{2,})[-(/][\d√]/.test(source) && !/[а-яё]/.test(source.replace(/(?:кВА|МВА|кВ|кВт|мм|кг)/g, ''))) return value;
  if (/^(?:ТМ\([А-Я]|ПТМ\([А-Я]|Я \d|Ун авто\/)/.test(source) && !/[а-яё]/.test(source.replace('Ун авто', 'УН'))) return source;
  const chapter = source.match(/^(\d+\s+\/\s+)(.+)$/);
  if (chapter) return chapter[1] + translateText(chapter[2], locale, dictionaryOverride);
  const translation = dictionary[source];
  if (translation) return value.replace(source, localizedUnits(preserveDesignations(source, translation), locale));
  if (source.endsWith(': подробнее') && dictionary['Подробнее']) return translateText(source.slice(0, -11), locale, dictionaryOverride) + ': ' + dictionary['Подробнее'];
  if (source.includes(' · ')) return source.split(' · ').map(part => translateText(part, locale, dictionaryOverride)).join(' · ');
  for (const prefix of ['В подборку', 'Удалить', 'Количество', 'Показать предприятия:', 'О партнёре', 'Связаться с поддержкой по этой странице']) if (source.startsWith(prefix + ' ') && dictionary[prefix]) return dictionary[prefix] + ' ' + translateText(source.slice(prefix.length + 1), locale, dictionaryOverride);
  // Dynamic counters retain their values; source identifiers and free input stay intact.
  const colon = source.indexOf(':');
  if (colon > 0 && dictionary[source.slice(0, colon + 1)]) return dictionary[source.slice(0, colon + 1)] + ' ' + translateText(source.slice(colon + 1).trim(), locale, dictionaryOverride);
  return localizedUnits(value, locale);
}
