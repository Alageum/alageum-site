import { translateText } from './translate';
export function localizeMetadata(metadata, locale = 'ru') {
  if (!metadata) return {};
  const result = { ...metadata };
  for (const key of ['title','description']) {
    if (typeof result[key] === 'string') result[key] = translateText(result[key], locale);
    else if (result[key] && typeof result[key] === 'object') result[key] = Object.fromEntries(Object.entries(result[key]).map(([name,value])=>[name,typeof value==='string'?translateText(value,locale):value]));
  }
  return result;
}
