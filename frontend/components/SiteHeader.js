"use client";import LocaleElement from "@/components/locale/LocaleElement";

import Image from "@/components/locale/LocaleImage";
import Link from "@/components/locale/LocaleLink";import {
  usePathname } from "@/components/locale/navigation";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import LanguageSwitcher from "@/components/locale/EcosystemNavigation";
import SelectionNavigation from "@/components/catalog/SelectionNavigation";
import { useAuth } from "@/components/AuthProvider";

const corporateSections = [
{
  href: "/catalog/home", label: "Каталог", title: "Технический каталог", note: "Оборудование, характеристики и подборка для проекта.",
  links: [
  ["Трансформаторы", "/catalog?category=transformers", "Параметры и исполнение"],
  ["Распределительные устройства", "/catalog?category=switchgear", "Коммутация и распределение"],
  ["Подстанции", "/catalog?category=substations", "Комплектные решения"]]

},
{
  href: "/solutions", label: "Решения", title: "От задачи к оборудованию", note: "Начните подбор с направления вашего проекта.",
  links: [
  ["Направления решений", "/solutions", "Структура проектного подбора"],
  ["Проекты", "/projects", "Подтверждённые публикации и поставки"],
  ["Подготовить запрос", "/inquiry", "Исходные данные для менеджера"]]

},
{
  href: "/company", label: "Компания", title: "ALAGEUM Electric", note: "Предприятия, компетенции и проверенные публичные материалы.",
  links: [
  ["О компании", "/company", "Производство, инжиниринг и сервис"],
  ["Предприятия", "/manufacturers", "Профили заводов и компетенции"],
  ["Документы", "/documents", "Каталоги и официальные источники"],
  ["Инвесторам", "/investors", "Структура, проекты и публичные материалы"],
      ["История и достижения", "/company/history", "Подтверждённые этапы развития"],
      ["Социальная ответственность", "/company/social", "Участие в жизни регионов"],
  ["Команда", "/company/team", "Руководство группы"],
  ["Карьера", "/careers", "Работа и развитие в Alageum"],
  ["Новости", "/news", "Производство и развитие"]]

},
{
  href: "/contacts", label: "Контакты", title: "Связь по вашему проекту", note: "Официальные каналы связи и подготовка вашего обращения.",
  links: [
  ["Контактная информация", "/contacts", "Телефоны, почта и региональные офисы"],
  ["Подготовить запрос", "/inquiry", "Соберите исходные данные"],
  ["Кабинет клиента", "/workspace", "Покупатель и проверка менеджером"]]

}];


const careerSections = [
{ href: '/careers', label: 'Карьера', title: 'Работа, которая даёт энергию', note: 'Производство, инжиниринг и развитие вместе с Alageum.', links: [['Компания как работодатель', '/careers/about', 'Рабочая среда и направления'], ['Люди и команда', '/careers/team', 'Руководство и производственные команды'], ['Предприятия', '/careers/workplaces', 'География и специализация']] },
{ href: '/careers/vacancies', label: 'Вакансии', title: 'Найдите своё направление', note: 'Профессии из официальных материалов. Актуальность уточняется у HR.', links: [['Все направления', '/careers/vacancies', 'Инженеры, производство и продажи'], ['Оставить резюме', '/careers/apply', 'Подготовка отклика'], ['Как проходит найм', '/careers/process', 'Рекомендуемый порядок знакомства']] },
{ href: '/careers/internships', label: 'Стажировки', title: 'Первый шаг в профессию', note: 'Производственные и офисные направления для студентов.', links: [['Стажировки', '/careers/internships', 'Направления программы'], ['Обучение и развитие', '/careers/learning', 'Возможности и вопросы к HR'], ['Отклик на стажировку', '/careers/apply?type=internship', 'Подготовьте резюме']] },
{ href: '/careers/process', label: 'Кандидатам', title: 'От знакомства до следующего шага', note: 'Практические ответы и подготовка отклика.', links: [['Этапы и вопросы', '/careers/process', 'Что уточнить перед откликом'], ['Мои черновики', '/careers/apply', 'Сохранённое резюме'], ['HR: cv@alageum.com', 'mailto:cv@alageum.com', 'Официальный канал из программы стажировок']] }];

const catalogSections = [
{ href: '/catalog/home', label: 'Каталог', title: 'Оборудование для вашего проекта', note: 'Выберите направление или начните с инженерной задачи.', links: [['Каталог продукции', '/catalog', 'Категории и технические параметры'], ['Производители', '/manufacturers', 'Промышленные площадки'], ['Материалы', '/documents', 'Каталоги и источники']] },
{ href: '/catalog', label: 'Продукция', title: 'Технический каталог', note: 'Параметры, исполнения и документы.', links: [['Трансформаторы', '/catalog?category=transformers', 'Преобразование напряжения'], ['Подстанции', '/catalog?category=substations', 'Комплектные решения'], ['Моя подборка', '/selection', 'Позиции для вашего проекта']] },
{ href: '/client/projects', label: 'Проекты', title: 'От подбора до документов', note: 'Локальное рабочее пространство. Черновики сохраняются в этом браузере.', links: [['Мои проекты', '/client/projects', 'Задача и состав оборудования'], ['Запросы и заказы', '/client/orders', 'Этапы локального согласования'], ['Документы', '/client/documents', 'Спецификации и черновики']] },
{ href: '/client', label: 'Кабинет', title: 'Всё по вашему проекту', note: 'Запросы, документы и обращения с сохранением контекста.', links: [['Обзор', '/client', 'Ваше рабочее пространство'], ['Поддержка', '/client/support', 'Вопросы по оборудованию и документам'], ['Профиль компании', '/client/profile', 'Контакты и реквизиты проекта']] }];

function Chevron({ expanded = false }) {
  return <svg className={`site-chevron${expanded ? " is-expanded" : ""}`} width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>;
}

export default function SiteHeader({ selectionCount }) {
  const pathname = usePathname();
  const area = pathname.startsWith('/careers') ? 'careers' : ['/catalog', '/client', '/b2b', '/selection', '/inquiry', '/login'].some((root) => pathname === root || pathname.startsWith(`${root}/`)) ? 'catalog' : 'company';
  const sections = area === 'careers' ? careerSections : area === 'catalog' ? catalogSections : corporateSections;
  const { hasPermission } = useAuth();
  const headerRef = useRef(null);
  const toggleRef = useRef(null);
  const navRefs = useRef([]);
  const lastTrigger = useRef(null);
  const suppressFocusPreview = useRef(false);
  const pendingSubmenuFocus = useRef(false);
  const [menu, setMenu] = useState({ pathname, preview: null, desktop: false, mobile: false, group: null });
  const navPath = ['/manufacturers', '/documents'].some((prefix) => pathname.startsWith(prefix)) ? '/company' : pathname.startsWith('/projects') ? '/solutions' : pathname.startsWith('/inquiry') || pathname.startsWith('/client') ? '/contacts' : pathname;
  const exactIndex = sections.findIndex(section => navPath === section.href);
  const currentIndex = exactIndex >= 0 ? exactIndex : sections.reduce((found,section,index) => navPath.startsWith(`${section.href}/`) && section.href.length > (sections[found]?.href.length || 0) ? index : found,-1);
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
      headerRef.current?.querySelector('.site-mega-link')?.focus();
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
      if (event.key !== "Escape") return;
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
      <LocaleElement as="header" className="site-header" ref={headerRef} onMouseLeave={() => {if (desktopOpen) closeMenus();}} onBlur={(event) => {if (!event.currentTarget.contains(event.relatedTarget)) closeMenus();}}>
        <LocaleElement as="div" className="site-header-rail">
          <Link href="/" className="site-brand" aria-label="ALAGEUM Electric — главная" onNavigate={() => closeMenus()}>
            <Image src="/brand/logo-lettering-01-red.svg" alt="ALAGEUM Electric" width={148} height={45} priority className="site-brand-image" />
          </Link>
          <LocaleElement as="nav" className="site-desktop-nav" aria-label="Основная навигация">
            <LocaleElement as="div" className="site-nav-rail">
              {sections.map((section, index) =>
              <Link key={section.href} href={section.href} ref={(element) => {navRefs.current[index] = element;}} className={`site-nav-link${currentIndex === index ? " is-current" : ""}`} aria-current={currentIndex === index ? "page" : undefined} aria-expanded={desktopOpen && previewIndex === index} aria-controls="site-mega-navigation" onMouseEnter={() => previewSection(index)} onFocus={() => {
                if (suppressFocusPreview.current) {suppressFocusPreview.current = false;return;}
                previewSection(index);
              }} onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  pendingSubmenuFocus.current = true;
                  previewSection(index);
                }
              }} onNavigate={() => closeMenus()}>
                  {section.label}<Chevron />
                </Link>
              )}
              <LocaleElement as="span" className="site-nav-indicator site-nav-indicator-committed" aria-hidden="true" style={{ "--nav-index": Math.max(currentIndex, 0), opacity: currentIndex < 0 ? 0 : 1 }} />
              <LocaleElement as="span" className="site-nav-indicator site-nav-indicator-preview" aria-hidden="true" style={{ "--nav-index": Math.max(previewIndex, 0), opacity: previewIndex < 0 ? 0 : 1 }} />
            </LocaleElement>
            <LocaleElement as="div" id="site-mega-navigation" className={`site-mega-navigation${desktopOpen ? " is-open" : ""}`} inert={!desktopOpen}>
              {activeSection &&
              <LocaleElement as="div" className="site-mega-inner" key={activeSection.href}>
                  <LocaleElement as="div" className="site-mega-intro"><LocaleElement as="span" className="site-eyebrow">{activeSection.label}</LocaleElement><LocaleElement as="strong">{activeSection.title}</LocaleElement><LocaleElement as="p">{activeSection.note}</LocaleElement></LocaleElement>
                  {activeSection.links.map(([label, href, note]) => <Link key={href} href={href} className="site-mega-link" onNavigate={() => closeMenus()}><LocaleElement as="span">{label}</LocaleElement><LocaleElement as="small" className="site-metadata">{note}</LocaleElement></Link>)}
                </LocaleElement>
              }
            </LocaleElement>
          </LocaleElement>
          <LocaleElement as="div" className="site-header-actions">
            <div className="site-header-language"><LanguageSwitcher /></div>
            {area !== 'company' && <Link href={area === 'careers' ? '/careers/apply' : '/client/projects'} className="brand-header-contact" onNavigate={() => closeMenus()}>{area === 'careers' ? 'Оставить резюме' : 'Создать проект'} <LocaleElement as="span" aria-hidden="true">↗</LocaleElement></Link>}
            <Link href="/client" className="site-language site-metadata" onNavigate={() => closeMenus()}>Кабинет клиента</Link>
            {hasPermission('catalog.manage') && <Link href="/admin/catalog" className="site-selection-link">Управление каталогом</Link>}
            {area === 'catalog' && <Suspense fallback={<Link href="/selection" className="site-selection-link">Подборка</Link>}><SelectionNavigation selectionCount={selectionCount} onNavigate={() => closeMenus()} /></Suspense>}
            <LocaleElement as="button" ref={toggleRef} type="button" className="site-menu-toggle" aria-label={mobileOpen ? "Закрыть навигацию" : "Открыть навигацию"} aria-expanded={mobileOpen} aria-controls="site-mobile-navigation" onClick={() => {
              lastTrigger.current = toggleRef.current;
              setMenu({ pathname, preview: null, desktop: false, mobile: !mobileOpen, group: currentIndex >= 0 ? currentIndex : 0 });
            }}><LocaleElement as="span" /><LocaleElement as="span" /><LocaleElement as="span" /></LocaleElement>
          </LocaleElement>
        </LocaleElement>
        <LocaleElement as="nav" className={`site-mobile-navigation${mobileOpen ? " is-open" : ""}`} id="site-mobile-navigation" aria-label="Мобильная навигация" inert={!mobileOpen}>
          {sections.map((section, index) =>
          <LocaleElement as="div" className="site-mobile-group" key={section.href}>
              <LocaleElement as="div" className="site-mobile-group-heading">
                <Link href={section.href} aria-current={currentIndex === index ? "page" : undefined} onNavigate={() => closeMenus()}>{section.label}</Link>
                <LocaleElement as="button" type="button" aria-label={`${menu.group === index ? "Свернуть" : "Развернуть"} раздел «${section.label}»`} aria-controls={`site-mobile-group-${index}`} aria-expanded={menu.group === index} onClick={() => setMenu((previous) => ({ ...previous, group: previous.group === index ? null : index }))}><Chevron expanded={menu.group === index} /></LocaleElement>
              </LocaleElement>
              <LocaleElement as="div" id={`site-mobile-group-${index}`} className="site-mobile-group-links" hidden={menu.group !== index}>{section.links.map(([label, href]) => <Link key={href} href={href} onNavigate={() => closeMenus()}>{label}</Link>)}</LocaleElement>
            </LocaleElement>
          )}
          <LanguageSwitcher />
          <LocaleElement as="p" className="site-metadata site-mobile-note">Тестовая версия сайта · RU</LocaleElement>
        </LocaleElement>
      </LocaleElement>
    </>);

}
