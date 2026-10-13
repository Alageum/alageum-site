import fixture from '../fixtures/ptmm-public-dtos.json' with { type: 'json' };
export const ptmmIds = Object.freeze(['cat-ptm-tded-v002', 'cat-ptm-tded-v005', 'cat-ptm-tded-v008']);
export const ptmmUnitCaveat = 'В исходной строке единица измерения не указана; обозначение „мм“ требует подтверждения.';
export const ptmmSourceHref = '/catalog/source?page=68';
export const dimensionLabels = Object.freeze(['Габаритные размеры В×Ш×Г', 'Габаритные размеры ТДЕ В×Ш×Г']);
export function ptmmPublicDtos(ids = ptmmIds) {
  return ids.map(id => {
    const row = fixture.rows.find(row => row.public_key === id);
    if (!row) throw new Error(`Unreviewed PTMM browser fixture ${id}`);
    return structuredClone(row);
  });
}
export function malformedPtmmDto(original, kind) {
  const row = structuredClone(original);
  if (kind === 'dimension') row.specs.technicalSpecs.find(spec => spec.label === dimensionLabels[0]).value = '111×222×333';
  else if (kind === 'uuid') row.id = '00000000-0000-4000-8000-000000000001';
  else if (kind === 'source') row.provenance.sourceUrl = 'https://example.invalid/unreviewed-source.pdf';
  else throw new Error(`Unreviewed PTMM mutation ${kind}`);
  return row;
}
