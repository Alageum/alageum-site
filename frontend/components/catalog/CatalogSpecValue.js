import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { getPtmmDimensionQualification } from '@/lib/catalog/ptmmDimensionQualification';

export default function CatalogSpecValue({ product, row, value = row.value }) {
  const qualification = getPtmmDimensionQualification(product, row);
  if (!qualification) return <E>{value}</E>;
  return <span data-ptmm-dimension-context={product.id}>
    <span><E>{qualification.sourceLabel}</E>: <E>{value}</E>.</span>{' '}
    <E as="strong">{qualification.note}</E>{' '}
    <Link href={qualification.sourceHref} className="source-page-link">Стр. 68</Link>
  </span>;
}
