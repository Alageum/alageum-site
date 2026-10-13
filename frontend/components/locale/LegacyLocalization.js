'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from './LocaleProvider';
import { translateText } from '@/lib/i18n/translate';
import { localizedHref } from '@/lib/i18n/routing';
// Approved technical renderers keep their source bytes and data contracts.
// This boundary localizes presentation-only DOM text, never records, geometry,
// source measurements, IDs, link targets to evidence, or editable form values.
export default function LegacyLocalization() {
  const locale = useLocale(); const router = useRouter();
  useEffect(() => {
    if (locale === 'ru') return;
    const main = document.getElementById('main-content'); if (!main) return;
    let frame = 0;
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(localize); });
    function localize() {
      frame = 0; observer.disconnect();
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement?.closest('[data-no-translate],input,textarea,script,style,code,pre,.product-sku,.numeric-cell')) continue;
        const translated = translateText(node.nodeValue, locale);
        if (translated !== node.nodeValue) node.nodeValue = translated;
      }
      for (const element of main.querySelectorAll('[aria-label],[placeholder],[title],[alt]')) {
        if (element.closest('[data-no-translate]')) continue;
        for (const attribute of ['aria-label','placeholder','title','alt']) { const value = element.getAttribute(attribute); if (value) { const translated = translateText(value, locale); if (translated !== value) element.setAttribute(attribute, translated); } }
      }
      observer.observe(main, { childList: true, characterData: true, subtree: true });
    }
    function navigate(event) {
      const link = event.target.closest?.('a[href]');
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank' || link.hasAttribute('download')) return;
      const href = link.getAttribute('href'); const translated = localizedHref(href, locale);
      if (translated !== href) { event.preventDefault(); router.push(translated); }
    }
    // Let streamed Suspense boundaries finish hydration before touching legacy text.
    const initial = window.setTimeout(localize, 1800); main.addEventListener('click', navigate, true);
    return () => { window.clearTimeout(initial); observer.disconnect(); cancelAnimationFrame(frame); main.removeEventListener('click', navigate, true); };
  }, [locale, router]);
  return null;
}
