'use client';
import { useSyncExternalStore } from 'react';
import { SEARCH_HISTORY_KEY, normalizeSearchHistory, rememberSearch } from '@/lib/catalog/searchHistory';
const EVENT='alageum:catalog-search-history';
function subscribe(listener){window.addEventListener('storage',listener);window.addEventListener(EVENT,listener);return()=>{window.removeEventListener('storage',listener);window.removeEventListener(EVENT,listener);};}
function snapshot(){try{return window.localStorage.getItem(SEARCH_HISTORY_KEY)||'[]';}catch{return '[]';}}
export function saveSearch(query){try{rememberSearch(window.localStorage,query);window.dispatchEvent(new Event(EVENT));}catch{/* Optional history. */}}
export default function SearchHistory({onSelect}){
 const raw=useSyncExternalStore(subscribe,snapshot,()=>'[]');let entries=[];try{entries=normalizeSearchHistory(JSON.parse(raw));}catch{/* Corrupted history is ignored. */}
 return entries.length?<div className="parts-quick" aria-label="Недавние поиски"><span>Недавние поиски в этом браузере:</span>{entries.map(query=><button type="button" key={query} onClick={()=>onSelect(query)}>{query}</button>)}<button type="button" onClick={()=>{try{window.localStorage.removeItem(SEARCH_HISTORY_KEY);window.dispatchEvent(new Event(EVENT));}catch{/* Optional history. */}}}>Очистить историю</button></div>:null;
}
