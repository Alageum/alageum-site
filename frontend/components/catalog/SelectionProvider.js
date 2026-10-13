'use client';

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { products } from '@/lib/catalog/data';
import { normalizeSelection } from '@/lib/catalog/query';

const KEY = 'alageum.catalog.selection.v1';
const EVENT = 'alageum:selection';
let memory = '[]';
let unavailable = false;
const SelectionContext = createContext(null);
function subscribe(callback) {
  window.addEventListener('storage', callback);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener(EVENT, callback); };
}
function snapshot() {
  try { memory = window.localStorage.getItem(KEY) || '[]'; } catch { unavailable = true; }
  return memory;
}
function decode(raw) {
  try { return normalizeSelection(JSON.parse(raw), products); } catch { return []; }
}
function save(next) {
  memory = JSON.stringify(next);
  try { window.localStorage.setItem(KEY, memory); } catch { unavailable = true; }
  window.dispatchEvent(new Event(EVENT));
}
export function SelectionProvider({ children }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '[]');
  const items = useMemo(() => decode(raw), [raw]);
  const value = {
    items, count: items.reduce((sum, item) => sum + item.quantity, 0), storageUnavailable: unavailable,
    add(id) {
      if (!products.some((product) => product.id === id)) return;
      const latest = decode(snapshot());
      const existing = latest.find((item) => item.id === id);
      save(existing ? latest.map((item) => item.id === id ? { ...item, quantity: Math.min(999, item.quantity + 1) } : item) : [...latest, { id, quantity: 1 }]);
    },
    setQuantity(id, quantity) { save(normalizeSelection(decode(snapshot()).map((item) => item.id === id ? { ...item, quantity } : item), products)); },
    remove(id) { save(decode(snapshot()).filter((item) => item.id !== id)); },
    clear() { save([]); },
  };
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}
export const useSelection = () => useContext(SelectionContext);
