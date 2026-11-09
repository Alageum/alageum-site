'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {usePathname} from '@/components/locale/navigation';
import {useLocale} from '@/components/locale/LocaleProvider';
import {translateText} from '@/lib/i18n/translate';
import styles from './PageOrientation.module.css';

const routeNames = {
  '/': 'Главная', '/company': 'О компании', '/company/team': 'Руководство',
  '/company/social': 'Социальная ответственность', '/manufacturers': 'Предприятия и производство',
  '/solutions': 'Решения', '/projects': 'Проекты', '/contacts': 'Контакты',
  '/news': 'Новости', '/documents': 'Документы', '/materials': 'Архив публикаций', '/data-policy': 'Данные и приватность',
  '/careers': 'Карьера', '/careers/vacancies': 'Вакансии',
  '/careers/internships': 'Стажировки', '/careers/apply': 'Отклик',
  '/catalog': 'Каталог продукции', '/catalog/home': 'Каталог оборудования', '/catalog/directions': 'Каталог',
  '/industries': 'Отрасли', '/investors': 'Инвесторам',
};
const ui = {
  ru: {sections: 'Разделы', label: 'Разделы этой страницы', top: 'К началу страницы', close: 'Закрыть список разделов'},
  en: {sections: 'Sections', label: 'On this page', top: 'Back to page start', close: 'Close section list'},
  kk: {sections: 'Бөлімдер', label: 'Осы беттегі бөлімдер', top: 'Беттің басына', close: 'Бөлімдер тізімін жабу'},
};
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const allowed = path => Object.hasOwn(routeNames, path) || ['/industries/', '/catalog/', '/company/', '/solutions/', '/projects/', '/manufacturers/', '/news/', '/materials/', '/partners/', '/careers/vacancies/'].some(root => path.startsWith(root));

// This lives inside the existing header. It does not create a second site menu
// or move the reader between sections without an explicit link click.
export default function PageOrientation({menuOpen = false}) {
  const pathname = usePathname();
  const locale = useLocale();
  const text = ui[locale] || ui.ru;
  const listId = useId();
  const rootRef = useRef(null);
  const [snapshot, setSnapshot] = useState({path: '', visible: false, title: '', current: '', items: []});
  const [expandedPath, setExpandedPath] = useState(null);
  const contextKey = `${pathname}|${locale}`;
  const open = expandedPath === contextKey && snapshot.visible && !menuOpen;

  useEffect(() => {
    if (!allowed(pathname)) return;
    const main = document.getElementById('main-content');
    if (!main) return;
    let frame = 0;
    let headings = [];
    let pageTitle = '';
    let titleHeading = null;
    let items = [];

    function measure() {
      frame = 0;
      const rail = document.querySelector('.site-header-rail');
      const edge = (rail?.getBoundingClientRect().bottom || 76);
      const visible = Boolean(titleHeading && titleHeading.getBoundingClientRect().bottom < edge && window.scrollY > 120);
      if (!visible) setExpandedPath(previous => previous === null ? previous : null);
      let current = '';
      const readingLine = edge + 38 + Math.min(160, Math.max(0, window.innerHeight - edge - 38) * .25);
      for (const entry of headings) {
        if (entry.node.getBoundingClientRect().top <= readingLine) current = entry.id;
        else break;
      }
      const next = {path: pathname, visible, title: pageTitle, current, items};
      setSnapshot(previous => previous.path === next.path && previous.visible === next.visible && previous.title === next.title && previous.current === next.current && JSON.stringify(previous.items) === JSON.stringify(next.items) ? previous : next);
    }
    function schedule() { if (!frame) frame = window.requestAnimationFrame(measure); }
    function collect() {
      titleHeading = main.querySelector('h1');
      const breadcrumb = main.querySelector('.story-breadcrumb, .site-breadcrumbs');
      pageTitle = routeNames[pathname] ? translateText(routeNames[pathname], locale) : clean(titleHeading?.textContent) || clean(breadcrumb?.lastElementChild?.textContent);
      const used = new Set();
      headings = [...main.querySelectorAll('h2')].filter(node => !node.closest('[hidden], [aria-hidden="true"], dialog, [role="dialog"]') && node.getClientRects().length && clean(node.textContent)).flatMap(node => {
        const section = node.closest('section');
        const target = section || node;
        if (used.has(target)) return [];
        used.add(target);
        const headingText = clean(node.textContent);
        const sectionLabel = clean(section?.querySelector(':scope > .story-section-heading .story-kicker, :scope > .site-eyebrow, :scope > .corp-section-heading .site-eyebrow')?.textContent);
        return [{node: target, id: target.id || node.id || `section-${used.size}`, anchor: target.id || node.id || null, label: /^\d/.test(headingText) && sectionLabel ? sectionLabel : headingText}];
      });
      items = headings.map(({id, anchor, label}) => ({id, anchor, label}));
      schedule();
    }
    const mutations = new MutationObserver(collect);
    mutations.observe(main, {childList: true, subtree: true, characterData: true});
    const resize = new ResizeObserver(schedule);
    resize.observe(main);
    collect();
    window.addEventListener('scroll', schedule, {passive: true});
    window.addEventListener('resize', collect);
    return () => {
      window.cancelAnimationFrame(frame);
      mutations.disconnect(); resize.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', collect);
    };
  }, [pathname, locale]);

  useEffect(() => {
    if (!open) return;
    function outside(event) { if (!rootRef.current?.contains(event.target)) setExpandedPath(null); }
    function escape(event) {
      if (event.key === 'Escape') {
        setExpandedPath(null);
        rootRef.current?.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    const close = () => setExpandedPath(null);
    window.addEventListener('popstate', close);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('popstate', close); };
  }, [open]);

  if (!allowed(pathname) || snapshot.path !== pathname || !snapshot.visible || menuOpen) return null;
  const links = snapshot.items.filter(item => item.anchor);
  const active = snapshot.items.find(item => item.id === snapshot.current);
  return <div className={styles.bar} ref={rootRef} onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget)) setExpandedPath(null);}}>
    <a href="#main-content" className={styles.page} title={`${text.top}: ${snapshot.title}`}>{snapshot.title}</a>
    {active && <><span className={styles.separator} aria-hidden="true">/</span><span className={styles.current} title={active.label}>{active.label}</span></>}
    {links.length > 1 && <details className={styles.outline} open={open}>
      <summary aria-controls={listId} aria-expanded={open} onClick={event => {event.preventDefault(); setExpandedPath(open ? null : contextKey);}}>
        {text.sections}<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
      </summary>
      <nav id={listId} className={styles.list} aria-label={text.label}>
        {links.map(item => <a href={`#${item.anchor}`} key={item.id} aria-current={snapshot.current === item.id ? 'location' : undefined} onClick={() => setExpandedPath(null)}>{item.label}<span aria-hidden="true">↗</span></a>)}
      </nav>
    </details>}
  </div>;
}
