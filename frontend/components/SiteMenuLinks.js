'use client';

import { useEffect, useId, useRef, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { catalogDirectionHref } from '@/lib/public/catalog-directions';
import styles from './SiteMenuLinks.module.css';

const catalogLeftHrefs = new Set([
  'power-transformers',
  'autotransformers',
  'furnace-transformers',
  'reactors',
  'oil-dry-transformers',
  'instrument-transformers',
].map(catalogDirectionHref));

function MenuGroup({label, note, children, onNavigate, mobile}) {
  const id = useId();
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const hoverTimer = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  function openPopover() {
    clearTimeout(hoverTimer.current);
    const panel = panelRef.current;
    if (panel.matches(':popover-open')) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    panel.showPopover();
    const { width, height } = panel.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    const gutter = 12;
    const gap = 4;
    // Open beside the group so the other trigger remains available.
    const beside = trigger.left - width - gap;
    const left = beside >= gutter ? beside : trigger.left;
    const top = beside >= gutter ? trigger.top - panel.querySelector('a').offsetTop : trigger.bottom + gap;
    panel.style.setProperty('--submenu-left', `${Math.max(gutter, Math.min(left, clientWidth - width - gutter))}px`);
    panel.style.setProperty('--submenu-top', `${Math.max(gutter, Math.min(top, clientHeight - height - gutter))}px`);
  }

  function closeMenu() {
    const panel = panelRef.current;
    if (mobile) panel.close();
    else if (panel.matches(':popover-open')) panel.hidePopover();
  }

  function activate(event) {
    if (mobile) {
      panelRef.current.showModal();
      setOpen(true);
      return;
    }
    openPopover();
    if (event.detail === 0) panelRef.current.querySelector('a')?.focus();
  }

  const Panel = mobile ? 'dialog' : 'div';
  const panelProps = mobile ? {
    'data-site-menu-dialog': '',
    onClose: () => setOpen(false),
    onClick: (event) => { if (event.target === event.currentTarget) closeMenu(); },
  } : {
    popover: 'auto',
    'data-site-menu-popover': '',
    role: 'group',
    onToggle: (event) => setOpen(event.currentTarget.matches(':popover-open')),
  };

  return <div
    onPointerEnter={mobile ? undefined : (event) => {
      if (event.pointerType !== 'mouse') return;
      clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(openPopover, 120);
    }}
    onPointerLeave={mobile ? undefined : (event) => {
      if (event.pointerType !== 'mouse') return;
      clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => {
        if (!panelRef.current.contains(document.activeElement)) closeMenu();
      }, 180);
    }}
    onBlur={mobile ? undefined : (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
    }}
    onKeyDown={mobile ? undefined : (event) => {
      if (event.key !== 'Escape' || !panelRef.current.matches(':popover-open')) return;
      event.preventDefault();
      event.stopPropagation();
      triggerRef.current.focus();
      closeMenu();
    }}>
    <button ref={triggerRef} type="button" className={`${styles.link} ${styles.trigger}`} aria-haspopup={mobile ? 'dialog' : undefined} aria-controls={id} aria-expanded={open} onClick={activate} data-site-menu-link>
      <E as="span">{label}</E>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </button>
    <Panel ref={panelRef} id={id} className={styles.dialog} aria-labelledby={`${id}-title`} {...panelProps}>
      <div className={styles.dialogContent}>
        <div className={styles.dialogHeader}>
          <E as="strong" id={`${id}-title`}>{label}</E>
          {mobile && <E as="button" type="button" onClick={closeMenu} aria-label="Закрыть" className={styles.close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </E>}
        </div>
        {note && <E as="p" className={styles.note}>{note}</E>}
        <ul className={styles.children}>
          {children.map(([childLabel, childHref]) => (
            <li key={childHref}>
              <Link href={childHref} onNavigate={onNavigate}>
                <E as="span">{childLabel}</E>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M3 8h9m-4-4 4 4-4 4" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  </div>;
}

export default function SiteMenuLinks({links, onNavigate, mobile = false, catalog = false}) {
  function renderLinks(items) {
    return items.map(([label, href, note, children]) => <div className={styles.group} key={href}>
      {children?.length ? <MenuGroup label={label} note={note} mobile={mobile} onNavigate={onNavigate}>{children}</MenuGroup>
        : <Link href={href} className={styles.link} data-site-menu-link onNavigate={onNavigate}><E as="span">{label}</E>{note && <E as="small">{note}</E>}</Link>}
    </div>);
  }

  if (catalog && !mobile) {
    return <div className={`${styles.tree} ${styles.catalogTree}`}>
      <div className={styles.catalogColumn}>{renderLinks(links.filter(([, href]) => catalogLeftHrefs.has(href)))}</div>
      <div className={styles.catalogColumn}>{renderLinks(links.filter(([, href]) => !catalogLeftHrefs.has(href)))}</div>
    </div>;
  }

  return <div className={mobile ? styles.mobile : styles.tree}>{renderLinks(links)}</div>;
}
