import Link from 'next/link';
import { getPtmmDimensionQualification } from '@/lib/catalog/ptmmDimensionQualification';

export default function CatalogSpecValue({ product, row, value = row.value }) {
  const qualification = getPtmmDimensionQualification(product, row);
  if (!qualification) return value;
  return <span data-ptmm-dimension-context={product.id}>
    <span>{qualification.sourceLabel}: {value}.</span>{' '}
    <strong>{qualification.note}</strong>{' '}
    <Link href={qualification.sourceHref} className="source-page-link">Стр. 68</Link>
  </span>;
}
