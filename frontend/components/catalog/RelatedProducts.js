'use client';
import { useMemo } from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { relatedProducts } from '@/lib/catalog/relatedProducts';
import { officialProducts } from '@/lib/catalog/data';
import { displayProductName } from '@/lib/catalog/presentation';
import { getCatalogSpecSummary, compactCatalogSpecValue } from '@/lib/catalog/grouping';
import { ProductThumbnail } from './ProductPhotograph';
import './ProductRecommendations.css';
export default function RelatedProducts({product}){const items=useMemo(()=>relatedProducts(product,officialProducts),[product]);if(!items.length)return null;return <E as="aside" className="related-products" aria-label="Смотрите также"><E as="div" className="related-heading"><E as="span">В ЭТОЙ КАТЕГОРИИ</E><E as="h2">Смотрите также</E></E><div className="related-product-list">{items.map(item=><Link className="related-product" key={item.id} href={`/catalog/${item.id}`}><ProductThumbnail product={item}/><div><E as="strong">{displayProductName(item)}</E>{getCatalogSpecSummary(item).filter(row=>['power','voltage'].includes(row.key)&&row.value!=='—').slice(0,2).map(row=><E as="span" className="related-value" key={row.key}>{compactCatalogSpecValue(row)}</E>)}</div><span className="related-arrow" aria-hidden="true">↗</span></Link>)}</div><E as="p" className="related-note">Другие позиции категории. Изображения иллюстрируют серию. Взаимозаменяемость и комплектность уточняются у производителя.</E><Link className="related-all" href={`/catalog?category=${product.category}`}>Все варианты категории →</Link></E>;}
