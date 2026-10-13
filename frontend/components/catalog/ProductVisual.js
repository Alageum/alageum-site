'use client';
import DesignSelect from '@/components/ui/DesignSelect';
import LocalResourceAnchor from '@/components/locale/LocalResourceAnchor';

import { useState } from 'react';
import CatalogSourceContext from './source-context/CatalogSourceContext';
import sourceContextAssetProof from '@/lib/catalog/source-context/sourceContextBuildProof';
import { getProtectionExampleEvidence } from '@/lib/catalog/models/protectionExampleRuntime';
import { getEquipmentConstructionChoices, getEquipmentConstructionChoice } from '@/lib/catalog/models/transformerExecutionChoices';
import { getEquipmentIcon } from '@/lib/catalog/models/iconMap';
import { sourcePageUrl } from '@/lib/catalog/sources';
import Image from 'next/image';
import Link from '@/components/locale/LocaleLink';
import ProductIcon from './ProductIcon';
export { default as ProductIcon } from './ProductIcon';
import EquipmentModel from './EquipmentModel';
import { getEquipmentVisual } from '@/lib/catalog/models/visualMap';
import { getProductMedia } from '@/lib/catalog/media';

const visualLabel = (visual) => visual.confidence === 'source-matched'
  ? 'Общая схема конструкции по иллюстрации серии'
  : visual.confidence === 'source-only' ? 'Исходная иллюстрация серии; общая схема не подменяет конструкцию'
  : visual.confidence === 'unverified' ? 'Проверенное изображение конструкции отсутствует'
  : 'Типовая иллюстрация; конструкция конкретного исполнения не подтверждена';


function OriginalImage({ product, media }) {
  return <div className="product-visual">{media.image ? <Image src={media.image} alt={media.alt} width={520} height={440}/> : <div className="product-no-image"><ProductIcon product={product} size={156}/><span>Условная схема типа</span></div>}<span className="catalog-meta">{media.caption}</span>{!!media.sourcePages.length && <div className="catalog-meta">{media.sourcePages.map(page => <Link key={page} href={sourcePageUrl(media.sourceId, page)}>стр. {page}</Link>)}</div>}</div>;
}

function VisualSourcePageLink({ product, page }) {
  const href = sourcePageUrl(product, page);
  return href ? <Link href={href}>стр. {page}</Link> : <span>стр. {page}</span>;
}

export default function ProductVisual({ product }) {
  const [choiceId, setChoiceId] = useState('');
  const protectionExample = getProtectionExampleEvidence(product);
  const choices = getEquipmentConstructionChoices(product);
  const choice = getEquipmentConstructionChoice(product, choiceId);
  const originalVisual = getEquipmentVisual(product);
  const visual = choice ? { ...originalVisual, type: choice.geometryType, fallbackImage: choice.fallbackImage, sourcePages: choice.sourcePages, reason: choice.reason, confidence: 'source-matched' } : originalVisual;
  const icon = getEquipmentIcon(product);
  const previewIcon = choice ? { type: choice.iconType, reason: choice.reason } : icon;
  const media = getProductMedia(product, visual);
  const matchesReviewedImage = !!media.image && media.image === visual.fallbackImage;
  const showReviewedProvenance = !!visual.type || matchesReviewedImage;
  return <div className="product-visual-stack" data-product-visual={visual.sourceFamilyId || product.id} data-construction-choice={choice?.id || undefined}>
    {!!choices.length && <div className="construction-choice"><label className="catalog-field"><span>Конструкция для просмотра</span><DesignSelect aria-label="Конструкция для просмотра" value={choice?.id || ''} onChange={event => setChoiceId(event.target.value)}><option value="">Выберите исполнение по источнику</option>{choices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</DesignSelect></label><p className="catalog-meta">{choice ? `Выбрано: ${choice.label}. Это иллюстрация конструкции, не готовая комплектация или артикул заказа.` : 'В источнике несколько конструкций. Для 3D выберите конкретное исполнение.'}</p></div>}
    {visual.type ? <EquipmentModel key={choice?.id || product.id} type={visual.type} previewIconType={previewIcon.type} previewIconReason={previewIcon.reason}/> : <><OriginalImage product={product} media={media}/><p className="visual-mapping-note">{media.image ? 'Показана выбранная иллюстрация. Общая 3D-схема этой конструкции ещё не подтверждена.' : 'Для этой позиции нужен чертёж производителя. Условный символ не подтверждает конструкцию изделия.'}</p></>}
    {showReviewedProvenance ? <div className="visual-provenance"><strong>{visualLabel(visual)}</strong>{visual.reason && <p>{visual.reason}</p>}{!!visual.sourcePages?.length && <div>{visual.sourcePages.map(page => <VisualSourcePageLink key={page} product={product} page={page}/>)}</div>}</div> : <div className="visual-provenance"><strong>{media.image ? 'Конструкция конкретного исполнения по выбранной иллюстрации не подтверждена' : 'Условный символ не подтверждает конструкцию конкретного исполнения'}</strong>{visual.reason && <p>{visual.reason}</p>}{!!visual.sourcePages?.length && <div>{visual.sourcePages.map(page => <VisualSourcePageLink key={page} product={product} page={page}/>)}</div>}</div>}
    {protectionExample && <div className="visual-provenance" data-protection-example={product.id}>{!protectionExample.geometryType && <p>{protectionExample.reason}</p>}<Link href={protectionExample.sourcePageUrl}>Полная страница 69</Link>{' · '}<LocalResourceAnchor href={protectionExample.sourcePageImage}>Полный исходный чертёж · стр. 69</LocalResourceAnchor></div>}
    <CatalogSourceContext product={product} assetEvidence={sourceContextAssetProof}/>
    {visual.type && media.image && <details className="product-original-illustration"><summary>{media.representation === 'source-scan' ? 'Страница исходного каталога' : 'Исходная иллюстрация'}</summary><OriginalImage product={product} media={media}/></details>}
  </div>;
}
