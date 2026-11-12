// Imported only by server-rendered archive pages. Long article bodies must not
// become part of the shared browser dictionary used by catalog and forms.
import shared from './dictionaries.json';
import archive from './archive-dictionaries.json';
import { translateText } from './translate';
const dictionaries = Object.fromEntries(Object.keys(shared).map(locale => [locale, { ...shared[locale], ...archive[locale] }]));
export function translateArchiveText(value, locale = 'ru') {
  return translateText(value, locale, dictionaries[locale]);
}
