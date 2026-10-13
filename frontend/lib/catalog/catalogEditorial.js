// Optional, source-bound editorial data. Technical source fields and asset guards stay unchanged.
import overlay from './catalogEditorialOverlay.json' with { type: 'json' };
import { recordShapeDigest } from './models/transformer2026Shape.js';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => recordShapeDigest(JSON.stringify(canonical(value)));
const configurationLabels = new WeakMap();

export function attachCatalogEditorial(record) {
  if (record?.source !== 'official') return record;
  const metadata = overlay.records?.[record.id];
  if (!metadata || digest(record) !== metadata.sourceRecordSha256) return record;
  for (const option of metadata.configurationOptions || []) {
    const match = /^configurations\[(\d+)\]$/.exec(option.fieldPath);
    const configuration = match && record.configurations?.[Number(match[1])];
    if (configuration && digest(configuration) === option.originalObjectSha256) configurationLabels.set(configuration, option.displayLabel);
  }
  return { ...record, catalogEditorial: metadata };
}

export const editorialConfigurationLabel = configuration => configuration && configurationLabels.get(configuration);
