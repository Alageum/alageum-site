import LocalResourceAnchor from '@/components/locale/LocalResourceAnchor';
import { getCatalogSourceContext } from '../../../lib/catalog/source-context/sourceContexts.js';
import styles from './CatalogSourceContext.module.css';
import SourceContextImage from './SourceContextImage.js';

// Isolated server-renderable prototype. No entry-point import or selected-product
// state is added. All attribution and uncertainty remain visible, without controls.
export default function CatalogSourceContext({ product, assetEvidence }) {
  const context = getCatalogSourceContext(product, assetEvidence);
  if (!context) return null;
  const headingId = `source-context-${context.canonicalId}`;
  return (
    <section className={styles.section} aria-labelledby={headingId} data-source-context-for={context.canonicalId}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>Материалы источника</p>
        <h3 id={headingId}>{context.heading}</h3>
        {!context.figures.some(figure => figure.caption === context.intro) && <p className={styles.intro}>{context.intro}</p>}
        <p className={styles.status}>{context.status}</p>
      </div>
      <div className={styles.figures}>
        {context.figures.map(figure => (
          <figure key={figure.key} className={styles.figure} data-source-figure={figure.key}>
            <LocalResourceAnchor className={styles.imageLink} href={figure.sourceHref} target="_blank" rel="noopener noreferrer" aria-label={`${figure.title}. Открыть полную страницу ${figure.sourcePage} в новой вкладке`}>
              <SourceContextImage figure={figure} className={styles.image} />
            </LocalResourceAnchor>
            <figcaption className={styles.caption}>
              <h4>{figure.title}</h4>
              <p>{figure.caption}</p>
              <p className={styles.legendLabel}>Подпись и обозначения на чертеже</p>
              <ul className={styles.legend}>
                {figure.sourceLegend.map(line => <li key={line}>{line}</li>)}
              </ul>
              {figure.exemplarHref && <LocalResourceAnchor className={styles.link} href={figure.exemplarHref} target="_blank" rel="noopener noreferrer">Отдельная запись примера из источника (новая вкладка)</LocalResourceAnchor>}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className={styles.footer}>
        <span>{context.sourceTitle}</span>
        <LocalResourceAnchor className={styles.link} href={context.sourceHref} target="_blank" rel="noopener noreferrer">{context.sourceLinkLabel} (новая вкладка)</LocalResourceAnchor>
      </p>
    </section>
  );
}
