export function catalogFacet(page, label) {
  return page.getByRole('region', { name: 'Расширенные фильтры', exact: true })
    .locator('details').filter({ has: page.locator('summary').getByText(label, { exact: true }) });
}

export async function openCatalogFacet(page, label) {
  const facet = catalogFacet(page, label);
  if (await facet.getAttribute('open') === null) await facet.locator('summary').click();
  return facet;
}

export function catalogFacetOption(facet, value) {
  return facet.locator('label').filter({ has: facet.page().getByText(value, { exact: true }) })
    .getByRole('checkbox');
}

export async function setCatalogFacet(page, label, values) {
  const facet = await openCatalogFacet(page, label);
  await facet.getByRole('button', { name: 'Очистить', exact: true }).click();
  for (const value of values) await catalogFacetOption(facet, value).check();
  await facet.getByRole('button', { name: 'Применить', exact: true }).click();
}
