'use client';

import { useEffect, useRef, useState } from 'react';
import E from '@/components/locale/LocaleElement';

const contacts = [
  { text: '+7 771 005 22 22', href: 'tel:+77710052222', label: 'Позвонить в отдел продаж: +7 771 005 22 22' },
  { text: 'sales@alageum.com', href: 'mailto:sales@alageum.com', label: 'Написать в отдел продаж: sales@alageum.com' },
];

export default function HeaderContact() {
  const [index, setIndex] = useState(0);
  const linkRef = useRef(null);

  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1600px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer;
    function syncRotation() {
      window.clearInterval(timer);
      if (!wide.matches || reduced.matches || document.hidden) return;
      timer = window.setInterval(() => {
        // Keep the destination stable while someone is about to use the link.
        if (!linkRef.current?.matches(':hover, :focus-within')) {
          setIndex(previous => (previous + 1) % contacts.length);
        }
      }, 2000);
    }
    syncRotation();
    wide.addEventListener('change', syncRotation);
    reduced.addEventListener('change', syncRotation);
    document.addEventListener('visibilitychange', syncRotation);
    return () => {
      window.clearInterval(timer);
      wide.removeEventListener('change', syncRotation);
      reduced.removeEventListener('change', syncRotation);
      document.removeEventListener('visibilitychange', syncRotation);
    };
  }, []);

  const contact = contacts[index];
  return <E as="a" ref={linkRef} href={contact.href} className="site-header-phone" aria-label={contact.label} data-no-translate>
    <span key={index} className="site-header-contact-value">{contact.text}</span>
  </E>;
}
