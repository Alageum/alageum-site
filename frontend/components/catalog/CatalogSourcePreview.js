'use client';

import Image from 'next/image';
import Link from '@/components/locale/LocaleLink';
import { getNtmiSourcePreview } from '@/lib/catalog/ntmiSourcePreview';
import EquipmentModel from './EquipmentModel';
import styles from './CatalogSourcePreview.module.css';

export default function CatalogSourcePreview({ product, panelId }) {
  const preview = getNtmiSourcePreview(product);
  if (!preview || preview.panelId !== panelId) return null;
  return <section className={styles.preview} data-source-preview={preview.panelId} aria-label={preview.caption}>
    <h4>{preview.caption}</h4>
    <p>{preview.reason}</p>
    <p className="catalog-data-warning">{preview.disclosure}. Готовый артикул заказа не подтверждён.</p>
    <EquipmentModel key={`${preview.canonicalId}:${preview.panelId}`} type={preview.geometryType} previewIconType={preview.iconType} previewIconReason={preview.reason}/>
    <p><Link href={preview.sourceHref}>Открыть чертёж в каталоге: стр. 96</Link></p>
    <details className="product-original-illustration"><summary>Страница исходного каталога · 18.03.2026</summary>
      <Image className={styles.scan} src={preview.sourceImage} alt="Страница 96 каталога 18.03.2026: характеристики НТМИ-6 и НТМИ-10 и общий чертёж НТМИ-6-10" width={1191} height={1684}/>
      <p className="catalog-meta">Страница исходного каталога; не фотография изделия</p>
    </details>
  </section>;
}
