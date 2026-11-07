'use client';

import { useId, useRef, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import styles from './SiteMenuLinks.module.css';

function MenuGroup({label, note, children, onNavigate, mobile}) {
  const id = useId();
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);

  function openMenu(event) {
    const panel = dialog.current;
    if (panel.open) return;

    const trigger = event.currentTarget.getBoundingClientRect();
    panel.showModal();

    if (!mobile) {
      const { width, height } = panel.getBoundingClientRect();
      const { clientWidth, clientHeight } = document.documentElement;
      const gutter = 12;
      const gap = 6;
      const below = trigger.bottom + gap;
      const above = trigger.top - gap - height;
      const top = below + height <= clientHeight - gutter || above < gutter ? below : above;
      panel.style.setProperty('--submenu-left', `${Math.max(gutter, Math.min(trigger.left, clientWidth - width - gutter))}px`);
      panel.style.setProperty('--submenu-top', `${Math.max(gutter, Math.min(top, clientHeight - height - gutter))}px`);
    }
    setOpen(true);
  }

  function closeMenu() {
    dialog.current.close();
  }

  return <>
    <button type="button" className={`${styles.link} ${styles.trigger}`} aria-haspopup="dialog" aria-controls={id} aria-expanded={open} onClick={openMenu} data-site-menu-link>
      <E as="span">{label}</E>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </button>
    <dialog ref={dialog} id={id} data-site-menu-dialog className={styles.dialog} aria-labelledby={`${id}-title`}
      onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === event.currentTarget) closeMenu(); }}>
      <div className={styles.dialogContent}>
        <div className={styles.dialogHeader}>
          <E as="strong" id={`${id}-title`}>{label}</E>
          <E as="button" type="button" onClick={closeMenu} aria-label="Закрыть" className={styles.close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </E>
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
    </dialog>
  </>;
}

export default function SiteMenuLinks({links, onNavigate, mobile = false}) {
  return <div className={mobile ? styles.mobile : styles.tree}>{links.map(([label, href, note, children]) => <div className={styles.group} key={href}>
    {children?.length ? <MenuGroup label={label} note={note} mobile={mobile} onNavigate={onNavigate}>{children}</MenuGroup>
      : <Link href={href} className={styles.link} data-site-menu-link onNavigate={onNavigate}><E as="span">{label}</E>{note && <E as="small">{note}</E>}</Link>}
  </div>)}</div>;
}
