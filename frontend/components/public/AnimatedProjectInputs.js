'use client';

import { useEffect, useRef } from 'react';
import E from '@/components/locale/LocaleElement';
import './AnimatedProjectInputs.css';

export default function AnimatedProjectInputs({ inputs }) {
  const ref = useRef(null);
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set();
    const observer = new IntersectionObserver(entries => {
      const entering = entries.filter(entry => entry.isIntersecting && entry.intersectionRatio >= .6);
      entering.forEach((entry, index) => {
        observer.unobserve(entry.target);
        if (media.matches) return;
        const row = entry.target;
        row.classList.add('project-input-entered');
        row.style.setProperty('--input-delay', `${Math.min(index * 110, 220)}ms`);
        const animation = row.animate([
          { opacity: .4, transform: 'translateY(14px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 650, delay: Math.min(index * 110, 220), easing: 'cubic-bezier(.22,1,.36,1)' });
        animations.add(animation);
        animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
      });
    }, { threshold: .6, rootMargin: '0px 0px -48px 0px' });
    for (const row of list.children) observer.observe(row);
    const finish = () => {
      if (media.matches) {
        for (const animation of animations) animation.finish();
      }
    };
    media.addEventListener('change', finish);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', finish);
      for (const animation of animations) animation.cancel();
    };
  }, [inputs]);

  return <E as="ol" ref={ref} className="public-checklist animated-project-inputs">
    {inputs.map((input, index) => <E as="li" key={input}>
      <E as="span" className="project-input-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</E>
      <E as="div" className="project-input-copy">{input}</E>
    </E>)}
  </E>;
}
