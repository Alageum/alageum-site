'use client';
import { useTranslate } from '@/components/locale/LocaleProvider';
import E from '@/components/locale/LocaleElement';
import EquipmentIcon from './EquipmentIcon';
import { getEquipmentIcon, iconConfidenceLabel } from '@/lib/catalog/models/iconMap';

/** Always an inline SVG: tiny scanned source drawings never stand in for an icon. */
export default function ProductIcon({ product, size = 56 }) {
  const tx = useTranslate();
  const icon = getEquipmentIcon(product);
  if (icon.type === null) return <E as="span" className="product-shared-symbol" data-product-icon={product.id} data-icon-confidence="source-only" title={icon.reason}><E as="svg" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={icon.reason} fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 7h22l9 9v41H17zM39 7v11h9M23 27h18M23 35h18M23 43h12"/></E></E>;
  const description = `${tx(iconConfidenceLabel(icon))}. ${tx(icon.reason || '')}`;
  return <E as="span" className="product-shared-symbol" data-product-icon={product.id} data-icon-confidence={icon.confidence} data-icon-type={icon.type} title={description}>
    <EquipmentIcon type={icon.type} size={size} title={description}/>
    {icon.confidence === 'typical' && <E as="span" className="product-icon-approximation" aria-hidden="true">≈</E>}
  </E>;
}
