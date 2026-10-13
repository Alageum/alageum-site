const liveValueOrDash = value => value ?? '—';

// Keep distinct source values in their original order under each label/unit row.
// Formatting stays with the caller because static cells include units and live
// cells put units in the row heading instead.
export function comparisonSpecValue(technicalSpecs, row, formatValue = liveValueOrDash) {
  const values = [...new Set((technicalSpecs || [])
    .filter(spec => spec.label === row.label && spec.unit === row.unit)
    .map(spec => spec.value))];
  return (values.length ? values : [undefined])
    .map(value => formatValue(value, row.unit)).join(' · ');
}
