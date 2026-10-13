import FamilyProductVisual from './FamilyProductVisual';
import ProductPhotograph from './ProductPhotograph';

// Editorial photography is additive. The reviewed technical selector, evidence,
// 3D and source-page components remain unchanged and retain their own guards.
export default function ProductPhotoVisual({ product, records }) {
  return <div className="product-visual-stack"><ProductPhotograph product={product}/><FamilyProductVisual product={product} records={records}/></div>;
}
