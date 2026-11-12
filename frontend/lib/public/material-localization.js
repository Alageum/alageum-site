// Translate display copy without mutating the archived source, identifiers,
// attachment URLs, publication dates, table dimensions or numeric values.
export function localizeMaterial(material, translate) {
  const text = value => typeof value === 'string' ? translate(value) : value;
  return {
    ...material,
    title: text(material.title),
    copyright: text(material.copyright),
    blocks: material.blocks.map(block => {
      if (block.type === 'image') return { ...block, alt: text(block.alt) };
      if (block.type === 'list') return { ...block, items: block.items.map(text) };
      if (block.type === 'table') return { ...block, rows: block.rows.map(row => row.map(text)) };
      return { ...block, text: text(block.text) };
    }),
  };
}

export function compareMaterials(a, b, locale, translate) {
  return (b.published || '').localeCompare(a.published || '') ||
    translate(a.title).localeCompare(translate(b.title), locale, { numeric: true });
}
