(() => {
  'use strict';

  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const raf2 = fn => requestAnimationFrame(() => requestAnimationFrame(fn));

  document.documentElement.classList.add('motion-system');

  document.addEventListener('DOMContentLoaded', () => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const menu = q('.mobile-menu-toggle');
    const nav = q('#primary-nav');
    const navTabs = nav ? qa('.nav-tab', nav) : [];
    const navPanels = nav ? qa('[data-nav-panel]', nav) : [];
    const desktop = () => window.innerWidth > 1080;

    /* Navigation focus backdrop — kept outside the fixed header stacking context
       so the header + mega surface stay sharp while the page behind softens. */
    const navFocusBackdrop = document.createElement('div');
    navFocusBackdrop.className = 'nav-focus-backdrop';
    navFocusBackdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(navFocusBackdrop);

    const syncNavFocusLayer = () => {
      const open = Boolean(nav && (nav.classList.contains('mega-open') || nav.classList.contains('is-open')));
      navFocusBackdrop.classList.toggle('is-visible', open);
      document.body.classList.toggle('nav-focus-active', open);
    };

    if (nav) {
      new MutationObserver(syncNavFocusLayer).observe(nav, { attributes:true, attributeFilter:['class'] });
      syncNavFocusLayer();
    }

    /* ------------------------------------------------------------
       Shared sliding indicator — one physical red line moves between
       targets instead of every tab drawing its own underline.
    ------------------------------------------------------------- */
    const buildIndicator = (container, itemSelector, className, inset = 12) => {
      if (!container) return null;
      let indicator = q(`.${className}`, container);
      if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = className;
        indicator.setAttribute('aria-hidden', 'true');
        container.appendChild(indicator);
      }

      let current = null;
      const move = (item, animate = true) => {
        if (!item || !indicator) return;
        current = item;
        const cr = container.getBoundingClientRect();
        const ir = item.getBoundingClientRect();
        const width = Math.max(18, ir.width - inset * 2);
        const x = ir.left - cr.left + container.scrollLeft + inset;
        if (!animate || reducedMotion.matches) indicator.classList.add('no-motion');
        indicator.style.width = `${width}px`;
        indicator.style.transform = `translate3d(${x}px,0,0)`;
        if (!animate || reducedMotion.matches) raf2(() => indicator.classList.remove('no-motion'));
      };
      const sync = (animate = false) => {
        const active = q(`${itemSelector}.active`, container) || q(itemSelector, container);
        if (active) move(active, animate);
      };

      container.addEventListener('scroll', () => current && move(current, false), { passive: true });
      return { move, sync, get current() { return current; } };
    };

    const navTabsWrap = nav ? q('.nav-tabs', nav) : null;
    const navIndicator = buildIndicator(navTabsWrap, '.nav-tab', 'nav-flow-indicator', 12);
    const navActiveIndicator = buildIndicator(navTabsWrap, '.nav-tab', 'nav-active-indicator', 12);
    navTabs.forEach((tab, i) => {
      tab.tabIndex = tab.classList.contains('active') || (!navTabs.some(t => t.classList.contains('active')) && i === 0) ? 0 : -1;
    });

    /* Navigation panels are stacked in one surface so content can crossfade. */
    navPanels.forEach(panel => {
      panel.hidden = false;
      panel.setAttribute('aria-hidden', String(!panel.classList.contains('active')));
      [...panel.children].forEach((child, i) => child.style.setProperty('--motion-i', i));
    });

    let committedNavTab = nav ? (q('.nav-tab.active', nav) || navTabs[0] || null) : null;

    /* Navigation mirrors 07/Tabs: hover is only a preview. The committed
       selection keeps its bold label + lower glow until click/keyboard activation. */
    const showNavPanel = tab => {
      if (!tab) return;
      const key = tab.dataset.navTarget;
      navPanels.forEach(p => {
        const on = p.dataset.navPanel === key;
        p.classList.toggle('active', on);
        p.setAttribute('aria-hidden', String(!on));
      });
    };

    const previewNavTab = (tab, open = true) => {
      if (!tab) return;
      showNavPanel(tab);
      navIndicator?.move(tab, true);
      if (nav) nav.classList.toggle('mega-open', open || !desktop());
    };

    const commitNavTab = (tab, open = true) => {
      if (!tab) return;
      committedNavTab = tab;
      navTabs.forEach(t => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      showNavPanel(tab);
      navActiveIndicator?.move(tab, true);
      navIndicator?.move(tab, true);
      if (nav) nav.classList.toggle('mega-open', open || !desktop());
    };

    const setNavTab = (tab, open = true, commit = false) => {
      if (commit) commitNavTab(tab, open);
      else previewNavTab(tab, open);
    };

    const closeMega = () => {
      if (nav && desktop()) nav.classList.remove('mega-open');
    };

    navTabs.forEach((tab, i) => {
      tab.addEventListener('mouseenter', () => {
        if (desktop()) setNavTab(tab, true, false);
      });
      tab.addEventListener('focus', () => previewNavTab(tab, true));
      tab.addEventListener('click', () => setNavTab(tab, true, true));
      tab.addEventListener('keydown', e => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' '].includes(e.key)) return;
        e.preventDefault();
        let n = i;
        if (e.key === 'ArrowRight') n = (i + 1) % navTabs.length;
        if (e.key === 'ArrowLeft') n = (i - 1 + navTabs.length) % navTabs.length;
        if (e.key === 'Home') n = 0;
        if (e.key === 'End') n = navTabs.length - 1;
        if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
          navTabs[n].focus();
          previewNavTab(navTabs[n], true);
          return;
        }
        commitNavTab(tab, true);
      });
    });

    if (nav) {
      nav.addEventListener('mouseleave', () => {
        if (desktop()) {
          if (committedNavTab) {
            showNavPanel(committedNavTab);
            navIndicator?.move(committedNavTab, true);
          }
          closeMega();
        }
      });
      navTabsWrap?.addEventListener('focusout', e => {
        if (!navTabsWrap.contains(e.relatedTarget) && committedNavTab) {
          showNavPanel(committedNavTab);
          navIndicator?.move(committedNavTab, true);
        }
      });
      qa('.nav-mega-link', nav).forEach(a => a.addEventListener('click', () => {
        qa('.nav-mega-link', nav).forEach(link => link.removeAttribute('aria-current'));
        a.setAttribute('aria-current', 'location');
        const panel = a.closest('[data-nav-panel]');
        const owner = panel ? navTabs.find(t => t.dataset.navTarget === panel.dataset.navPanel) : null;
        if (owner) setNavTab(owner, false, true);
        closeMega();
        if (!desktop() && menu) {
          menu.setAttribute('aria-expanded', 'false');
          menu.setAttribute('aria-label', 'Open navigation');
          nav.classList.remove('is-open');
        }
      }));
    }

    document.addEventListener('pointerdown', e => {
      if (!desktop() || !nav || !nav.classList.contains('mega-open')) return;
      if (nav.contains(e.target) || menu?.contains(e.target)) return;
      closeMega();
    });

    const closeMobile = () => {
      if (!menu || !nav) return;
      menu.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-label', 'Open navigation');
      nav.classList.remove('is-open');
      if (desktop()) closeMega();
    };

    if (menu && nav) {
      menu.addEventListener('click', () => {
        const open = menu.getAttribute('aria-expanded') === 'true';
        menu.setAttribute('aria-expanded', String(!open));
        menu.setAttribute('aria-label', open ? 'Open navigation' : 'Close navigation');
        nav.classList.toggle('is-open', !open);
        if (!open && !desktop()) setNavTab(committedNavTab || q('.nav-tab.active', nav) || navTabs[0], true, false);
      });
    }

    navFocusBackdrop.addEventListener('click', () => {
      if (desktop()) closeMega();
      else closeMobile();
    });

    /* ------------------------------------------------------------
       Content tabs use the same moving underline. Hover previews the
       physical line; click/keyboard commits the selected state.
    ------------------------------------------------------------- */
    const tabSystems = [];
    qa('.tabs').forEach(list => {
      const tabs = qa('.tab', list);
      /* Two independent lines:
         - activeIndicator is the committed, heavier selection marker;
         - previewIndicator is the lighter line that follows hover/focus preview. */
      const previewIndicator = buildIndicator(list, '.tab', 'tab-flow-indicator', 12);
      const dualIndicator = Boolean(list.closest('#selection'));
      const activeIndicator = dualIndicator ? buildIndicator(list, '.tab', 'tab-active-indicator', 12) : null;

      const syncCommitted = (animate = true) => {
        const active = q('.tab.active', list) || tabs[0];
        if (active) activeIndicator?.move(active, animate);
      };
      const restorePreview = (animate = true) => {
        const active = q('.tab.active', list) || tabs[0];
        if (active) previewIndicator?.move(active, animate);
      };
      const select = t => {
        tabs.forEach(x => {
          const on = x === t;
          x.classList.toggle('active', on);
          x.setAttribute('aria-selected', String(on));
          x.tabIndex = on ? 0 : -1;
        });
        activeIndicator?.move(t, true);
        previewIndicator?.move(t, true);
      };

      tabs.forEach((t, i) => {
        t.tabIndex = t.classList.contains('active') ? 0 : -1;
        t.addEventListener('mouseenter', () => previewIndicator?.move(t, true));
        t.addEventListener('focus', () => previewIndicator?.move(t, true));
        t.addEventListener('click', () => select(t));
        t.addEventListener('keydown', e => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' '].includes(e.key)) return;
          e.preventDefault();
          let n = i;
          if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
          if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
          if (e.key === 'Home') n = 0;
          if (e.key === 'End') n = tabs.length - 1;
          tabs[n].focus();
          if (e.key === 'Enter' || e.key === ' ') select(tabs[n]);
        });
      });
      list.addEventListener('mouseleave', () => restorePreview(true));
      list.addEventListener('focusout', e => {
        if (!list.contains(e.relatedTarget)) restorePreview(true);
      });
      tabSystems.push({
        sync(animate = false) {
          syncCommitted(animate);
          restorePreview(animate);
        }
      });
    });

    /* ------------------------------------------------------------
       Selection indicator — state change radiates from the center.
    ------------------------------------------------------------- */
    const pulseBox = b => {
      if (reducedMotion.matches) return;
      b.classList.remove('is-pulsing');
      void b.offsetWidth;
      b.classList.add('is-pulsing');
      b.addEventListener('animationend', () => b.classList.remove('is-pulsing'), { once:true });
    };

    const syncBoxContainer = b => {
      const checked = b.getAttribute('aria-checked') === 'true';
      const row = b.closest('.table tbody tr');
      if (row) {
        row.classList.toggle('selected', checked);
        row.setAttribute('aria-selected', String(checked));
      }
    };

    const toggleBox = b => {
      const checked = b.getAttribute('aria-checked') === 'true';
      const next = !checked;
      b.setAttribute('aria-checked', String(next));
      b.classList.toggle('checked', next);
      syncBoxContainer(b);
      pulseBox(b);
    };

    qa('.box[role="checkbox"]').forEach(b => {
      syncBoxContainer(b);
      b.addEventListener('click', e => {
        e.stopPropagation();
        toggleBox(b);
      });
      b.addEventListener('keydown', e => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          toggleBox(b);
        }
      });
    });

    qa('.check').forEach(c => c.addEventListener('click', e => {
      if (e.target.closest('.box')) return;
      const b = q('.box', c);
      if (b) toggleBox(b);
    }));

    qa('.table tbody tr').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('a,button,input,select,textarea,.box')) return;
        const b = q('.box', row);
        if (b) toggleBox(b);
      });
      row.addEventListener('keydown', e => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.target.closest('.box')) {
          e.preventDefault();
          const b = q('.box', row);
          if (b) toggleBox(b);
        }
      });
    });

    /* ------------------------------------------------------------
       Select — attached surface opens/closes with coordinated motion.
    ------------------------------------------------------------- */
    const closeSelects = (except = null) => qa('.select-wrap.is-open').forEach(w => {
      if (w === except) return;
      w.classList.remove('is-open');
      const b = q('.select-control', w);
      if (b) b.setAttribute('aria-expanded', 'false');
    });

    qa('.select-wrap').forEach((w, selectIndex) => {
      const control = q('.select-control', w);
      const value = q('.select-value', w);
      const options = qa('.select-option', w);
      const menuList = q('.select-menu', w);
      if (!control || !menuList) return;

      if (!control.id) control.id = `select-control-${selectIndex + 1}`;
      if (!menuList.id) menuList.id = `select-listbox-${selectIndex + 1}`;
      control.setAttribute('aria-controls', menuList.id);
      control.setAttribute('aria-expanded', String(w.classList.contains('is-open')));
      menuList.setAttribute('aria-labelledby', control.id);
      options.forEach((o, i) => {
        o.style.setProperty('--option-i', i);
        if (!o.id) o.id = `${menuList.id}-option-${i + 1}`;
      });

      control.addEventListener('click', e => {
        e.stopPropagation();
        const pointerClick = e.detail > 0;
        const open = w.classList.contains('is-open');
        closeSelects(w);
        w.classList.toggle('is-open', !open);
        control.setAttribute('aria-expanded', String(!open));
        if (!open) {
          const selected = q('.select-option[aria-selected="true"]', w) || options[0];
          if (pointerClick) control.blur();
          else window.setTimeout(() => selected?.focus({ preventScroll: true }), 40);
        } else if (pointerClick) {
          control.blur();
        }
      });

      control.addEventListener('keydown', e => {
        if (['ArrowDown', 'Enter', ' '].includes(e.key) && !w.classList.contains('is-open')) {
          e.preventDefault();
          control.click();
        }
      });

      options.forEach((o, i) => {
        o.addEventListener('pointerdown', e => {
          if (e.pointerType) e.preventDefault();
        });
        o.addEventListener('click', e => {
          e.stopPropagation();
          const pointerClick = e.detail > 0;
          options.forEach(x => x.setAttribute('aria-selected', String(x === o)));
          if (value) value.textContent = o.dataset.value || o.textContent.trim();
          w.classList.remove('is-open');
          control.setAttribute('aria-expanded', 'false');
          if (pointerClick) {
            o.blur();
            control.blur();
          } else {
            control.focus({ preventScroll: true });
          }
        });
        o.addEventListener('keydown', e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = e.key === 'ArrowDown' ? (i + 1) % options.length : (i - 1 + options.length) % options.length;
            options[n].focus();
          }
          if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            options[e.key === 'Home' ? 0 : options.length - 1]?.focus();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            w.classList.remove('is-open');
            control.setAttribute('aria-expanded', 'false');
            control.focus();
          }
          if (e.key === 'Tab') {
            w.classList.remove('is-open');
            control.setAttribute('aria-expanded', 'false');
          }
        });
      });
    });

    document.addEventListener('click', () => closeSelects());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeSelects();
        closeMega();
        if (!desktop()) closeMobile();
      }
    });

    qa('.input').forEach(c => {
      if (!c.hasAttribute('tabindex')) c.tabIndex = 0;
      if (!c.hasAttribute('role')) c.setAttribute('role', 'textbox');
      c.addEventListener('focus', () => c.classList.add('focus'));
      c.addEventListener('blur', () => c.classList.remove('focus'));
    });

    /* ------------------------------------------------------------
       Coordinated reveal system — surfaces enter on the same timing
       scale, with small child staggers for collections.
    ------------------------------------------------------------- */
    const revealTargets = [q('.ds-title'), ...qa('.ds-section'), q('.footer')].filter(Boolean);
    revealTargets.forEach(el => el.classList.add('motion-reveal'));

    const staggerSelectors = [
      '.swatches', '.logo-system', '.spacing-row', '.state-row', '.forms-grid',
      '.selection-demo-horizontal', '.selection-button-demo', '.status-demo',
      '.notification-grid', '.spec-grid', '.footer-grid', '.overlay-stage > div'
    ];
    staggerSelectors.forEach(selector => qa(selector).forEach(container => {
      container.classList.add('motion-stagger');
      [...container.children].forEach((child, i) => child.style.setProperty('--motion-i', i));
    }));

    const reveal = el => el.classList.add('is-visible');
    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      revealTargets.forEach(reveal);
      qa('.motion-stagger').forEach(reveal);
    } else {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          reveal(entry.target);
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

      revealTargets.forEach(el => observer.observe(el));
      qa('.motion-stagger').forEach(el => observer.observe(el));
    }

    /* Initial choreography: header first, title immediately after. */
    requestAnimationFrame(() => {
      document.documentElement.classList.add('motion-booted');
      q('.ds-title')?.classList.add('is-visible');
      navActiveIndicator?.sync(false);
      navIndicator?.sync(false);
      tabSystems.forEach(system => system?.sync(false));
    });

    const resyncIndicators = () => {
      navActiveIndicator?.sync(false);
      navIndicator?.sync(false);
      tabSystems.forEach(system => system?.sync(false));
    };
    window.addEventListener('resize', () => {
      if (menu && nav) {
        if (desktop()) {
          nav.classList.remove('is-open');
          menu.setAttribute('aria-expanded', 'false');
          menu.setAttribute('aria-label', 'Open navigation');
          closeMega();
        } else {
          nav.classList.remove('mega-open');
        }
      }
      resyncIndicators();
    });
    window.addEventListener('load', resyncIndicators, { once: true });

    qa('a[href="#"]').forEach(a => a.addEventListener('click', e => e.preventDefault()));
  });
})();
