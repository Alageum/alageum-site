'use client';
import { useTranslate } from '@/components/locale/LocaleProvider';
import E from '@/components/locale/LocaleElement';
import LocalResourceAnchor from '@/components/locale/LocalResourceAnchor';
import { getCatalogSourceContext } from '../../../lib/catalog/source-context/sourceContexts.js';
import styles from './CatalogSourceContext.module.css';
import SourceContextImage from './SourceContextImage.js';

// Source-bound context has no selected-product state or execution controls.
// Translation changes presentation only; reviewed figures and attribution stay intact.
export default function CatalogSourceContext({ product, assetEvidence }) {
  const tx = useTranslate();
  const context = getCatalogSourceContext(product, assetEvidence);
  if (!context) return null;
  const headingId = `source-context-${context.canonicalId}`;
  return (
    <section className={styles.section} aria-labelledby={headingId} data-source-context-for={context.canonicalId}>
      <div className={styles.header}>
        <E as="p" className={styles.eyebrow}>Материалы источника</E>
        <E as="h3" id={headingId}>{context.heading}</E>
        {!context.figures.some(figure => figure.caption === context.intro) && <E as="p" className={styles.intro}>{context.intro}</E>}
        <E as="p" className={styles.status}>{context.status}</E>
      </div>
      <div className={styles.figures}>
        {context.figures.map(figure => (
          <figure key={figure.key} className={styles.figure} data-source-figure={figure.key}>
            <LocalResourceAnchor className={styles.imageLink} href={figure.sourceHref} target="_blank" rel="noopener noreferrer" aria-label={figure.title}>
              <SourceContextImage translate={tx} figure={figure} className={styles.image} />
            </LocalResourceAnchor>
            <figcaption className={styles.caption}>
              <E as="h4">{figure.title}</E>
              <E as="p">{figure.caption}</E>
              <E as="p" className={styles.legendLabel}>Подпись и обозначения на чертеже</E>
              <ul className={styles.legend}>
                {figure.sourceLegend.map(line => <E as="li" key={line}>{line}</E>)}
              </ul>
              {figure.exemplarHref && <LocalResourceAnchor className={styles.link} href={figure.exemplarHref} target="_blank" rel="noopener noreferrer">Отдельная запись примера из источника (новая вкладка)</LocalResourceAnchor>}
            </figcaption>
          </figure>
        ))}
      </div>
      <E as="p" className={styles.footer}>
        <E as="span">{context.sourceTitle}</E>
        <LocalResourceAnchor className={styles.link} href={context.sourceHref} target="_blank" rel="noopener noreferrer">{context.sourceLinkLabel} (новая вкладка)</LocalResourceAnchor>
      </E>
    </section>
  );
}
