'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { isApiCatalog, liveHref } from '@/lib/catalog/apiData';
import { officialProducts } from '@/lib/catalog/data';
import { loadApiCatalog } from '@/lib/catalog/source';
import { useSelection } from './SelectionProvider';
import { useApiSelection } from './ApiSelectionProvider';

export default function useCatalogSource() {
  const params = useSearchParams();
  const live = isApiCatalog(params);
  const [remote, setRemote] = useState({ status: 'loading', items: [], error: '' });
  const [attempt, setAttempt] = useState(0);
  const localSelection = useSelection(), apiSelection = useApiSelection();
  useEffect(() => {
    if (!live) return;
    let active = true;
    loadApiCatalog().then(items => { if (active) setRemote({ status: 'ready', items, error: '' }); })
      .catch(error => { if (active) setRemote({ status: 'error', items: [], error: error.message }); });
    return () => { active = false; };
  }, [live, attempt]);
  return {
    live, ...(live ? remote : { status: 'ready', items: officialProducts, error: '' }),
    selection: live ? apiSelection : localSelection,
    add: product => live ? apiSelection.add(product.id, product.databaseId) : localSelection.add(product.id),
    productHref: id => live ? liveHref(id) : `/catalog/${encodeURIComponent(id)}`,
    catalogHref: query => `/catalog?${new URLSearchParams({ ...(live ? { source: 'api' } : {}), ...query })}`,
    retry: () => { setRemote({ status: 'loading', items: [], error: '' }); setAttempt(value => value + 1); },
  };
}
