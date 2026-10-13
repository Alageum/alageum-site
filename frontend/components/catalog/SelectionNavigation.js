'use client';import LocaleElement from "@/components/locale/LocaleElement";
import Link from "@/components/locale/LocaleLink";
import { useSearchParams } from 'next/navigation';
import { isApiCatalog } from '@/lib/catalog/apiData';
import { useSelection } from './SelectionProvider';
import { useApiSelection } from './ApiSelectionProvider';
export default function SelectionNavigation({ onNavigate, selectionCount }) {
  const params = useSearchParams();
  const live = isApiCatalog(params);
  const staticSelection = useSelection(),apiSelection = useApiSelection();
  const count = selectionCount ?? (live ? apiSelection.count : staticSelection.count);
  return <Link href={live ? '/selection?source=api' : '/selection'} className="site-selection-link" onNavigate={onNavigate}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5V3h8v2M5 5h14v16H5zM9 10h6M9 14h6" /></svg><LocaleElement as="span">Подборка</LocaleElement><LocaleElement as="span" className="site-selection-count">{count}</LocaleElement></Link>;
}
