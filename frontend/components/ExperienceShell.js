'use client';
import LegacyLocalization from '@/components/locale/LegacyLocalization';import LocaleElement from "@/components/locale/LocaleElement";import {

  usePathname } from "@/components/locale/navigation";
import { useEffect, useRef } from 'react';
import SiteHeader from '@/components/SiteHeader';
import { ecosystemArea } from '@/components/locale/EcosystemNavigation';
import ContextSupport from '@/components/public/ContextSupport';
import SiteFooter from '@/components/SiteFooter';
import CorporateArrow from '@/components/public/CorporateArrow';

// Route scope keeps technical catalog and printable documents visually stable.
export default function ExperienceShell({ children }) {
  const pathname = usePathname() || '/';
  const technical = (pathname.startsWith('/catalog') && pathname !== '/catalog/home') || pathname.startsWith('/admin/catalog') || pathname.endsWith('/print');
  const utility = ['/client', '/selection', '/inquiry', '/workspace', '/login', '/b2b', '/ai'].some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const shellRef = useRef(null);
  const progressRef = useRef(null);
  const backTopRef = useRef(null);

  useEffect(() => {
    if (technical || !shellRef.current) return;
    const shell = shellRef.current;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const seen = new WeakSet();
    const animations = new Set();
    const waiting = new Set();
    let frame = 0;
    const selector = '.corp-section-heading, .corp-stages li, .corp-group-statement, .corp-project-visual, .corp-equipment-card, .corp-editorial, .corp-mission, .corp-history li, .corp-enterprise-card, .corp-project-card, .site-solution-row, .public-document, .corp-office, .corp-cta, .site-page-cta, .brand-footer-lead, .eco-card, .eco-section h2';
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        // isIntersecting becomes true at the first pixel, even when a higher
        // threshold is configured. Wait for the actual visible fraction.
        if (!entry.isIntersecting || entry.intersectionRatio < .35) continue;
        observer.unobserve(entry.target);
        waiting.delete(entry.target);
        if (media.matches || entry.target.contains(document.activeElement)) continue;
        const animation = entry.target.animate(
          [{ opacity: .25, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 560, easing: 'cubic-bezier(.22,1,.36,1)' }
        );
        animations.add(animation);
        animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
      }
    }, { threshold: .35, rootMargin: '0px 0px -120px 0px' });
    function register() {
      if (media.matches) return;
      for (const element of shell.querySelectorAll(selector)) {
        if (seen.has(element)) continue;
        seen.add(element);
        // The initial viewport stays immediately readable; only newly reached
        // blocks receive an entrance. No content is hidden without JavaScript.
        if (element.getBoundingClientRect().top > window.innerHeight * .9) {
          waiting.add(element);
          observer.observe(element);
        }
      }
    }
    function updateScroll() {
      frame = 0;
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0})`;
      if (backTopRef.current) backTopRef.current.hidden = window.scrollY < window.innerHeight * 1.5;
      shell.dataset.scrolled = window.scrollY > 24 ? 'true' : 'false';
    }
    function onScroll() {if (!frame) frame = window.requestAnimationFrame(updateScroll);}
    function finishMotion() {
      if (media.matches) observer.disconnect();
      for (const animation of animations) animation.finish();
      if (!media.matches) {
        for (const element of waiting) if (element.isConnected) observer.observe(element);
        register();
      }
    }
    function onFocus() {for (const animation of animations) animation.finish();}
    // App Router can stream sections after the shell effect has mounted.
    const mutations = new MutationObserver(() => {register();onScroll();});
    mutations.observe(shell.querySelector('main'), { childList: true, subtree: true });
    const resize = new ResizeObserver(onScroll);
    resize.observe(shell);
    register();updateScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    media.addEventListener('change', finishMotion);
    shell.addEventListener('focusin', onFocus);
    return () => {
      observer.disconnect();mutations.disconnect();resize.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      media.removeEventListener('change', finishMotion);
      shell.removeEventListener('focusin', onFocus);
      for (const animation of animations) animation.cancel();
      delete shell.dataset.scrolled;
    };
  }, [pathname, technical]);

  return <LocaleElement as="div" ref={shellRef} className={technical ? 'technical-experience' : `brand-experience${utility ? ' brand-utility' : ''}`}>
    {!technical && <LocaleElement as="div" ref={progressRef} className="brand-scroll-progress" aria-hidden="true" />}
    <SiteHeader />
    <LocaleElement as="main" id="main-content" className="site-main"><LegacyLocalization />{children}</LocaleElement>
    <SiteFooter />
    {ecosystemArea(pathname) === 'catalog' && <ContextSupport />}
    {!technical && <LocaleElement as="button" ref={backTopRef} hidden type="button" className="brand-back-top" aria-label="Вернуться к началу страницы" onClick={() => {window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });}}><LocaleElement as="span" style={{ display: 'flex', transform: 'rotate(180deg)' }}><CorporateArrow direction="down" /></LocaleElement></LocaleElement>}
  </LocaleElement>;
}
