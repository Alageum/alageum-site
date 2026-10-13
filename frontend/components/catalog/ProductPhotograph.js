import Image from 'next/image';
import LocalResourceAnchor from '@/components/locale/LocalResourceAnchor';
import { getProductPhotograph } from '@/lib/catalog/photography';
import ProductIcon from './ProductIcon';
import styles from './ProductPhotograph.module.css';

export function ProductThumbnail({ product }) {
  const photo = getProductPhotograph(product);
  if (!photo) return <div className="product-thumb shared-type-icon"><ProductIcon product={product} size={56}/></div>;
  return <figure className={styles.thumbnail} data-product-photograph={photo.id}>
    <Image src={photo.path} alt={photo.alt} width={120} height={90} sizes="96px" style={{ objectFit: photo.fit || 'cover', objectPosition: photo.objectPosition || 'center' }}/>
    <figcaption>{photo.shortCaption}</figcaption>
  </figure>;
}

export default function ProductPhotograph({ product }) {
  const photo = getProductPhotograph(product);
  if (!photo) return null;
  return <figure className={styles.figure} data-product-photograph={photo.id}>
    <div className={styles.frame}><Image src={photo.path} alt={photo.alt} width={photo.width} height={photo.height} sizes="(max-width: 620px) calc(100vw - 32px), (max-width: 1100px) 45vw, 560px" style={{ objectFit: photo.fit || 'contain', objectPosition: photo.objectPosition || 'center' }}/></div>
    <figcaption><span className={styles.label}>{photo.shortCaption}</span><strong>{photo.caption}</strong><p>{photo.disclaimer}</p><LocalResourceAnchor href={photo.sourcePage} target="_blank" rel="noopener noreferrer">Источник фотографии</LocalResourceAnchor></figcaption>
  </figure>;
}
