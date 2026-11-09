export function normalizeSelection(value, products) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(products.map((product) => product.id));
  const seen = new Set();
  return value
    .filter((item) => item && allowed.has(item.id) && !seen.has(item.id) && seen.add(item.id))
    .map((item) => ({ id: item.id, quantity: Math.min(999, Math.max(1, Math.floor(Number(item.quantity)) || 1)) }));
}
