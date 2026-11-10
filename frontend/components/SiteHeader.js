"use client";import LocaleElement from "@/components/locale/LocaleElement";

import Image from "@/components/locale/LocaleImage";
import Link from "@/components/locale/LocaleLink";import {
  usePathname } from "@/components/locale/navigation";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import LanguageSwitcher from "@/components/locale/EcosystemNavigation";
import SelectionNavigation from "@/components/catalog/SelectionNavigation";
import { useAuth } from "@/components/AuthProvider";

import './public/company/company-architecture.css';
import HeaderContact from '@/components/HeaderContact';
import QuickFeedback from '@/components/public/QuickFeedback';
import PageOrientation from '@/components/PageOrientation';
import SiteMenuLinks from '@/components/SiteMenuLinks';
import menuStyles from '@/components/SiteMenuLinks.module.css';
import {siteNavigation} from '@/lib/public/site-navigation';
import { careerSections, careerSectionIndex } from "@/components/careers/navigation";

import { isPublicOnly } from '@/lib/deployment/publicMode';

const corporateSections = siteNavigation;

const catalogSections = [
{ href: '/catalog/home', label: 'Каталог', title: 'Оборудование для вашего проекта', note: 'Выберите направление или начните с инженерной задачи.', links: [['Каталог продукции', '/catalog', 'Категории и технические параметры'], ['Производители', '/manufacturers', 'Промышленные площадки'], ['Материалы', '/documents', 'Каталоги и источники']] },
{ href: '/catalog', label: 'Продукция', title: 'Технический каталог', note: 'Параметры, исполнения и документы.', links: [['Трансформаторы', '/catalog?category=transformers', 'Преобразование напряжения'], ['Подстанции', '/catalog?category=substations', 'Комплектные решения'], ['Моя подборка', '/selection', 'Позиции для вашего проекта']] },
{ href: '/client/projects', label: 'Проекты', title: 'От подбора до документов', note: 'Локальное рабочее пространство. Черновики сохраняются в этом браузере.', links: [['Мои проекты', '/client/projects', 'Задача и состав оборудования'], ['Запросы и заказы', '/client/orders', 'Этапы локального согласования'], ['Документы', '/client/documents', 'Спецификации и черновики']] },
{ href: '/account', label: 'Кабинет', title: 'Личный кабинет', note: 'Аккаунт и подтверждённый доступ к данным вашей компании.', links: [['Мой аккаунт', '/account', 'Профиль и заявки на доступ'], ['Кабинет компании', '/b2b', 'Данные в рамках выданных прав'], ['Локальные черновики', '/client', 'Сохранены только в этом браузере']] }];

function Chevron({ expanded = false }) {
  return <svg className={`site-chevron${expanded ? " is-expanded" : ""}`} width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>;
}

export default function SiteHeader({ selectionCount }) {
  const pathname = usePathname();
  const area = pathname.startsWith('/careers') ? 'careers' : ['/catalog', '/client', '/b2b', '/selection', '/inquiry', '/login', '/account', '/register', '/verify-email', '/forgot-password', '/reset-password'].some((root) => pathname === root || pathname.startsWith(`${root}/`)) ? 'catalog' : 'company';
  const workspace = ['/client','/b2b','/selection','/inquiry','/login','/account','/register','/verify-email','/forgot-password','/reset-password'].some(root => pathname === root || pathname.startsWith(`${root}/`));
  const configuredSections = area === 'careers' ? careerSections : workspace ? catalogSections : corporateSections;
  const sections = isPublicOnly() ? configuredSections.map(section => ({
    ...section,
    ...(section.href === '/account' ? { href: '/service-unavailable', label: 'Кабинет недоступен', title: 'Личный кабинет временно недоступен', note: 'Публичный каталог и локальные черновики работают без входа.' } : {}),
    links: section.links.map(([label, href, note, children]) => ['/account', '/b2b'].includes(href) ? [label, '/service-unavailable', 'Временно недоступно. Данные не отправляются.'] : [label, href, note, children]),
  })) : configuredSections;
  const { hasPermission, profile } = useAuth();
  const publicOnly = isPublicOnly();
  const canManageCatalog = !publicOnly && hasPermission('catalog.manage');
  const accountHref = publicOnly ? '/service-unavailable' : profile ? '/account' : '/login?next=%2Faccount';
  const accountLabel = publicOnly ? 'Кабинет недоступен' : profile ? 'Личный кабинет' : 'Войти';
  const headerRef = useRef(null);
  const toggleRef = useRef(null);
  const navRefs = useRef([]);
  const lastTrigger = useRef(null);
  const suppressFocusPreview = useRef(false);
  const pendingSubmenuFocus = useRef(false);
  const [menu, setMenu] = useState({ pathname, preview: null, desktop: false, mobile: false, group: null });
  const navPath = configuredSections === corporateSections
    ? pathname.startsWith('/catalog') ? '/catalog/directions' : pathname.startsWith('/industries') || pathname.startsWith('/solutions') || pathname.startsWith('/projects') ? '/industries' : pathname.startsWith('/manufacturers') ? '/manufacturers' : pathname.startsWith('/investors') ? '/investors' : pathname === '/documents' ? '/documents' : ['/company','/news','/materials','/partners','/contacts','/data-policy'].some(root => pathname === root || pathname.startsWith(`${root}/`)) ? '/company' : pathname
    : ['/account', '/b2b', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password'].some(root => pathname === root || pathname.startsWith(`${root}/`)) ? '/account' : pathname.startsWith('/inquiry') || pathname.startsWith('/client') ? '/contacts' : pathname;
  const exactIndex = sections.findIndex(section => navPath === section.href);
  const currentIndex = area === "careers" ? careerSectionIndex(pathname) : exactIndex >= 0 ? exactIndex : sections.reduce((found,section,index) => navPath.startsWith(`${section.href}/`) && section.href.length > (sections[found]?.href.length || 0) ? index : found,-1);
  const onCurrentPath = menu.pathname === pathname;
  const desktopOpen = onCurrentPath && menu.desktop;
  const mobileOpen = onCurrentPath && menu.mobile;
  const previewIndex = desktopOpen && menu.preview !== null ? menu.preview : currentIndex;
  const activeSection = sections[previewIndex];
  const anyOpen = desktopOpen || mobileOpen;

  // Focus only after React has committed the submenu and removed its inert state.
  useLayoutEffect(() => {
    if (desktopOpen && pendingSubmenuFocus.current) {
      pendingSubmenuFocus.current = false;
      headerRef.current?.querySelector('.site-mega-link, [data-site-menu-link]')?.focus();
    }
  }, [desktopOpen, menu]);

  function closeMenus(restoreFocus = false) {
    setMenu({ pathname, preview: null, desktop: false, mobile: false, group: null });
    if (restoreFocus) lastTrigger.current?.focus();
  }

  function previewSection(index) {
    lastTrigger.current = navRefs.current[index];
    setMenu((previous) => ({ ...previous, pathname, preview: index, desktop: true }));
  }

  useEffect(() => {
    if (!anyOpen) return;
    function onKeyDown(event) {
      if (event.key !== "Escape" || headerRef.current?.querySelector('[data-site-menu-dialog][open]')) return;
      event.preventDefault();
      setMenu({ pathname, preview: null, desktop: false, mobile: false, group: null });
      if (lastTrigger.current && document.activeElement !== lastTrigger.current) {
        suppressFocusPreview.current = true;
        lastTrigger.current.focus();
      }
    }
    function onPointerDown(event) {
      if (!headerRef.current?.contains(event.target)) {
        setMenu({ pathname, preview: null, desktop: false, mobile: false, group: null });
      }
    }
    function onResize() {
      setMenu({ pathname, preview: null, desktop: false, mobile: false, group: null });
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
    };
  }, [anyOpen, pathname]);

  return (
    <>
      <LocaleElement as="a" className="site-skip-link" href="#main-content">Перейти к содержанию</LocaleElement>
      <LocaleElement as="div" className={`site-nav-backdrop${anyOpen ? " is-visible" : ""}`} aria-hidden="true" onClick={() => closeMenus()} />
      <LocaleElement as="header" className="site-header" ref={headerRef}
        onMouseLeave={(event) => {
          if (desktopOpen && !event.currentTarget.querySelector('[data-site-menu-dialog][open]')) closeMenus();
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.querySelector('[data-site-menu-dialog][open]')) closeMenus();
        }}>
        <LocaleElement as="div" className={`site-header-rail${configuredSections === corporateSections ? " site-header-rail-corporate" : ""}`}>
          <Link href="/" className="site-brand" aria-label="ALAGEUM Electric — главная" onNavigate={() => closeMenus()}>
            <Image src="/brand/logo-header-red.svg" alt="ALAGEUM Electric" width={164} height={38} priority className="site-brand-image" />
          </Link>
          <LocaleElement as="nav" className="site-desktop-nav" aria-label="Основная навигация">
            <LocaleElement as="div" className="site-nav-rail">
              {sections.map((section, index) =>
              <Link key={section.href} href={section.href === '/catalog/directions' ? '/catalog' : section.href} ref={(element) => {navRefs.current[index] = element;}} className={`site-nav-link${currentIndex === index ? " is-current" : ""}`} aria-current={currentIndex === index ? "page" : undefined} aria-expanded={section.links.length ? desktopOpen && previewIndex === index : undefined} aria-controls={section.links.length ? "site-mega-navigation" : undefined} onMouseEnter={() => {if(section.links.length)previewSection(index);else closeMenus();}} onFocus={() => {
                if (!section.links.length) {closeMenus();return;}
                if (suppressFocusPreview.current) {suppressFocusPreview.current = false;return;}
                previewSection(index);
              }} onKeyDown={(event) => {
                if (event.key === "ArrowDown" && section.links.length) {
                  event.preventDefault();
                  pendingSubmenuFocus.current = true;
                  previewSection(index);
                }
              }} onNavigate={() => closeMenus()}>
                  {section.label}{section.links.length > 0 && <Chevron />}
                </Link>
              )}
              <LocaleElement as="span" className="site-nav-indicator site-nav-indicator-committed" aria-hidden="true" style={{ "--nav-index": Math.max(currentIndex, 0), opacity: currentIndex < 0 ? 0 : 1 }} />
              <LocaleElement as="span" className="site-nav-indicator site-nav-indicator-preview" aria-hidden="true" style={{ "--nav-index": Math.max(previewIndex, 0), opacity: previewIndex < 0 ? 0 : 1 }} />
            </LocaleElement>
            {area !== "careers" && <LocaleElement as="div" id="site-mega-navigation" className={`site-mega-navigation${desktopOpen ? " is-open" : ""}`} inert={!desktopOpen}>
              {activeSection &&
              <LocaleElement as="div" className={`site-mega-inner ${menuStyles.panel}`} key={activeSection.href}>
                  <LocaleElement as="div" className="site-mega-intro"><LocaleElement as="strong">{activeSection.title}</LocaleElement><LocaleElement as="p">{activeSection.note}</LocaleElement>{activeSection.resources&&<div className="company-menu-resources">{activeSection.resources.map(([label,href])=><Link key={href} href={href} onNavigate={()=>closeMenus()}>{label} ↗</Link>)}</div>}</LocaleElement>
                  {desktopOpen && <SiteMenuLinks links={activeSection.links} onNavigate={() => closeMenus()}/>}
                </LocaleElement>
              }
            </LocaleElement>}
          </LocaleElement>
          <LocaleElement as="div" className="site-header-actions">
            <div className="site-header-language"><LanguageSwitcher /></div>
            {area === 'company' && <HeaderContact />}
            {area === 'company' && <QuickFeedback onOpen={() => closeMenus()} />}
            {area !== 'company' && <Link href={area === 'careers' ? '/careers/apply' : '/client/projects'} className={`brand-header-contact${area === 'careers' ? ' career-resume-link' : ''}`} onNavigate={() => closeMenus()}>{area === 'careers' ? 'Оставить резюме' : 'Создать проект'} <LocaleElement as="span" aria-hidden="true">↗</LocaleElement></Link>}
            <Link href={accountHref} className="site-account-link" aria-label={accountLabel} title={accountLabel} onNavigate={() => closeMenus()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /></svg>
              <LocaleElement as="span">{accountLabel}</LocaleElement>
            </Link>
            {canManageCatalog && <Link href="/admin/catalog" className="site-selection-link site-admin-link" onNavigate={() => closeMenus()}>Управление каталогом</Link>}
            {area === 'catalog' && <Suspense fallback={<Link href="/selection" className="site-selection-link">Подборка</Link>}><SelectionNavigation selectionCount={selectionCount} onNavigate={() => closeMenus()} /></Suspense>}
            <LocaleElement as="button" ref={toggleRef} type="button" className="site-menu-toggle" aria-label={mobileOpen ? "Закрыть навигацию" : "Открыть навигацию"} aria-expanded={mobileOpen} aria-controls="site-mobile-navigation" onClick={() => {
              lastTrigger.current = toggleRef.current;
              setMenu({ pathname, preview: null, desktop: false, mobile: !mobileOpen, group: currentIndex >= 0 ? currentIndex : 0 });
            }}><LocaleElement as="span" /><LocaleElement as="span" /><LocaleElement as="span" /></LocaleElement>
          </LocaleElement>
        </LocaleElement>
        <PageOrientation menuOpen={anyOpen}/>
        <LocaleElement as="nav" className={`site-mobile-navigation${mobileOpen ? " is-open" : ""}`} id="site-mobile-navigation" aria-label="Мобильная навигация" inert={!mobileOpen}>
          {sections.map((section, index) => {
            const catalogDisclosure = section.href === '/catalog/directions' && section.links.length > 0;
            const groupOpen = menu.group === index;
            const groupId = `site-mobile-group-${index}`;
            const toggleGroup = () => setMenu((previous) => ({ ...previous, group: previous.group === index ? null : index }));
            return <LocaleElement as="div" className="site-mobile-group" key={section.href}>
              <LocaleElement as="div" className="site-mobile-group-heading">
                {catalogDisclosure ? (
                  <LocaleElement as="button" type="button" className={menuStyles.mobileSectionTrigger} aria-controls={groupId} aria-expanded={groupOpen} onClick={toggleGroup}>
                    <LocaleElement as="span">{section.label}</LocaleElement><Chevron expanded={groupOpen} />
                  </LocaleElement>
                ) : <>
                  <Link href={section.href} aria-current={currentIndex === index ? "page" : undefined} onNavigate={() => closeMenus()}>{section.label}</Link>
                  {section.links.length > 0 && <LocaleElement as="button" type="button" aria-label={`${groupOpen ? "Свернуть" : "Развернуть"} раздел «${section.label}»`} aria-controls={groupId} aria-expanded={groupOpen} onClick={toggleGroup}><Chevron expanded={groupOpen} /></LocaleElement>}
                </>}
              </LocaleElement>
              {(section.links.length > 0 || section.resources?.length > 0) && <LocaleElement as="div" id={groupId} className="site-mobile-group-links" hidden={!groupOpen}>
                {section.resources && <div className="company-menu-resources">{section.resources.map(([label,href]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} onNavigate={() => closeMenus()}>{label}</Link>)}</div>}
                {groupOpen && <SiteMenuLinks links={section.links} mobile onNavigate={() => closeMenus()}/>}
              </LocaleElement>}
            </LocaleElement>;
          })}
          {canManageCatalog && <div className="site-mobile-group"><div className="site-mobile-group-heading">
            <Link href="/admin/catalog" onNavigate={() => closeMenus()}>Управление каталогом</Link>
          </div></div>}
          <LanguageSwitcher />
          <LocaleElement as="p" className="site-metadata site-mobile-note">Тестовая версия сайта</LocaleElement>
        </LocaleElement>
      </LocaleElement>
    </>);

}
