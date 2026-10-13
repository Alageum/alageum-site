'use client';
import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { normalizeApiSelection } from '@/lib/catalog/apiData';
const KEY = 'alageum.catalog.api-selection.v1', EVENT = 'alageum:api-selection';
let memory = '[]', unavailable = false;
const Context = createContext(null);
function subscribe(callback) { window.addEventListener('storage',callback); window.addEventListener(EVENT,callback); return () => { window.removeEventListener('storage',callback); window.removeEventListener(EVENT,callback); }; }
function snapshot() { try { memory = localStorage.getItem(KEY)||'[]'; } catch { unavailable=true; } return memory; }
function decode(raw) { try { return normalizeApiSelection(JSON.parse(raw)); } catch { return []; } }
function save(items) { memory=JSON.stringify(normalizeApiSelection(items)); try { localStorage.setItem(KEY,memory); } catch { unavailable=true; } window.dispatchEvent(new Event(EVENT)); }
export function ApiSelectionProvider({children}) {
 const raw=useSyncExternalStore(subscribe,snapshot,()=>'[]');
 const items=useMemo(()=>decode(raw),[raw]);
 const value={items,count:items.reduce((sum,item)=>sum+item.quantity,0),storageUnavailable:unavailable,
  add(id,databaseId) { const latest=decode(snapshot()),existing=latest.find(item=>item.id===id); save(existing?latest.map(item=>item.id===id?{...item,databaseId,quantity:item.quantity+1}:item):[...latest,{id,databaseId,quantity:1}]); },
  remove(id) { save(decode(snapshot()).filter(item=>item.id!==id)); },
  setQuantity(id,quantity) { save(decode(snapshot()).map(item=>item.id===id?{...item,quantity}:item)); },
 };
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useApiSelection=()=>useContext(Context);
