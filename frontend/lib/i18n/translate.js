import dictionaries from './dictionaries.json';
export function translateText(value, locale = 'ru') {
  if (typeof value !== 'string' || locale === 'ru' || !/[А-Яа-яЁё]/.test(value)) return value;
  const source = value.replace(/\s+/g, ' ').trim();
  const dictionary = dictionaries[locale] || {};
  if (/^(?:ТМ\([А-Я]|КТПН-\d|ЯТП-\d|ПТМ\([А-Я]|Я \d|Ун авто\/)/.test(source)) return source;
  const chapter = source.match(/^(\d+\s*\/\s*)(.+)$/);
  if (chapter) return chapter[1] + translateText(chapter[2], locale);
  const translation = dictionary[source];
  if (translation) return value.replace(source, translation);
  if (source.includes(' · ')) return source.split(' · ').map(part => translateText(part, locale)).join(' · ');
  for (const prefix of ['В подборку', 'Удалить', 'Количество', 'Показать предприятия:', 'О партнёре', 'Связаться с поддержкой по этой странице']) if (source.startsWith(prefix + ' ') && dictionary[prefix]) return dictionary[prefix] + source.slice(prefix.length);
  // Dynamic counters retain their values; source identifiers and free input stay intact.
  const colon = source.indexOf(':');
  if (colon > 0 && dictionary[source.slice(0, colon + 1)]) return dictionary[source.slice(0, colon + 1)] + source.slice(colon + 1);
  return value;
}
