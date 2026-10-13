'use client';import LocaleElement from "@/components/locale/LocaleElement";
import { useSearchParams } from 'next/navigation';import { usePathname } from "@/components/locale/navigation";
import Link from '@/components/locale/LocaleLink';
import { useTranslate } from '@/components/locale/LocaleProvider';
import { Suspense } from 'react';
function Support() {
  const path = usePathname();const params = useSearchParams();const tx = useTranslate();
  const context = `${path}${params.size ? `?${params}` : ''}`;
  return <Link className="context-support" href={`/client/support?context=${encodeURIComponent(context)}`} aria-label="Связаться с поддержкой по этой странице"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 12H2v6h4v-6H4Zm16 0h2v6h-4v-6h2Zm0 6c0 3-3 4-6 4" /></svg><LocaleElement as="span">{tx('Поддержка')}</LocaleElement></Link>;
}
export default function ContextSupport() {return <Suspense><Support /></Suspense>;}
