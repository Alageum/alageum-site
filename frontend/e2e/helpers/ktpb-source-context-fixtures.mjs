import fixture from '../fixtures/ktpb-public-dtos.json' with { type: 'json' };

export const ktpbIds = Object.freeze(['cat-ktpb-k', 'cat-ktpb-k-v001', 'cat-ktpb-k-v002', 'cat-ktpb-k-v003']);
export const ktpbSourceHref = '/catalog/source?page=56';
export const ktpbSourceImage = '/catalog-source/page-056.webp';
export const ktpbFigureKey = 'substations-p056-figure26-2ktpb-110-4n';
export const ktpbFigureHeading = 'Пример 2КТПБ(К), схема 110-4Н, из каталога';
export const ktpbLegacyGeometry = 'outdoor-switchyard-substation';
export function ktpbPublicDtos(ids = ktpbIds) {
  return ids.map(id => {
    const row = fixture.rows.find(row => row.public_key === id);
    if (!row) throw new Error(`Unreviewed KTPB browser fixture ${id}`);
    return structuredClone(row);
  });
}
export function malformedKtpbDto(original, kind) {
  const row = structuredClone(original);
  if (kind === 'uuid') row.id = '00000000-0000-4000-8000-000000000001';
  else if (kind === 'source') row.provenance.sourceUrl = 'https://example.invalid/unreviewed-source.pdf';
  else if (kind === 'owner-edit') row.specs.technicalSpecs[0].value = '999';
  else throw new Error(`Unreviewed KTPB mutation ${kind}`);
  return row;
}
