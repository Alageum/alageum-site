// Retrieve all pages without silently presenting the first page as the full list.
// Every response remains subject to the normal session/tenant invalidation guard.
export async function collectPages(load, validPage, { maxPages = 100 } = {}) {
  const items = [], seen = new Set();
  for (let number = 1; number <= maxPages; number++) {
    const page = await load(number);
    if (!validPage(page, number)) throw new Error('invalid_page');
    for (const item of page.items) {
      if (seen.has(item.id)) throw new Error('repeated_page');
      seen.add(item.id); items.push(item);
    }
    if (number * page.page_size >= page.total) return items;
    if (page.items.length === 0) throw new Error('incomplete_page');
  }
  throw new Error('page_limit');
}
export const pagePath = (path, page) => page === 1 ? path : `${path}${path.includes('?') ? '&' : '?'}page=${page}`;
