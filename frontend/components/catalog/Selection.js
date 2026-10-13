'use client';import LocaleElement from "@/components/locale/LocaleElement";
import { displayProductName, displayExecution } from '@/lib/catalog/presentation';
import { isApiCatalog } from '@/lib/catalog/apiData';
import { LiveSelection } from './LiveCatalog';
import Link from "@/components/locale/LocaleLink";
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { products, productById } from '@/lib/catalog/data';
import { selectionCsv } from '@/lib/catalog/query';
import { useSelection } from './SelectionProvider';
import CatalogNotice from './CatalogNotice';
import ProductIcon from './ProductIcon';
function Quantity({ item, sku, onChange }) {
  const [draft, setDraft] = useState(String(item.quantity));
  return <LocaleElement as="input" type="number" min="1" max="999" step="1" value={draft} aria-label={`Количество ${sku}`} onChange={(event) => setDraft(event.target.value)} onBlur={() => {const value = Math.min(999, Math.max(1, Math.floor(Number(draft)) || 1));setDraft(String(value));onChange(value);}} />;
}
function StaticSelection() {
  const selection = useSelection();
  const [notice, setNotice] = useState('');
  function download() {
    const blob = new Blob([selectionCsv(selection.items, products)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');anchor.href = url;anchor.download = 'alageum-selection.csv';anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('CSV-подборка подготовлена к скачиванию. Это список для обсуждения, не заказ.');
  }
  return <LocaleElement as="div" className="catalog-page"><LocaleElement as="nav" className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/catalog">Каталог</Link><LocaleElement as="span">/</LocaleElement><LocaleElement as="span">Моя подборка</LocaleElement></LocaleElement><LocaleElement as="div" className="catalog-heading compact-heading"><LocaleElement as="div"><LocaleElement as="p" className="catalog-kicker">ВАШ ПРОЕКТ / ЛОКАЛЬНЫЙ СПИСОК</LocaleElement><LocaleElement as="h1">Моя подборка</LocaleElement></LocaleElement><LocaleElement as="p">Сохраните выбранные позиции.<br />Список доступен в этом браузере.</LocaleElement></LocaleElement><CatalogNotice compact source={selection.items.some((item) => productById(item.id)?.source === 'demo') ? 'demo' : 'official'} />{selection.storageUnavailable && <LocaleElement as="p" className="catalog-notice" role="status">Хранилище браузера недоступно. Подборка сохранится только до закрытия этой страницы.</LocaleElement>}
    {!selection.items.length ? <LocaleElement as="div" className="catalog-empty"><LocaleElement as="span" className="empty-icon" aria-hidden="true">+</LocaleElement><LocaleElement as="h2">В подборке пока нет оборудования</LocaleElement><LocaleElement as="p">Добавьте позиции из каталога, чтобы собрать список для обсуждения проекта.</LocaleElement><LocaleElement as="div" className="inline-actions"><Link className="catalog-button" href="/client/projects?from=selection">Сохранить в проект →</Link><Link className="catalog-button primary" href="/catalog">Перейти в каталог →</Link><Link className="catalog-button" href="/inquiry?intent=selection">Запросить помощь с подбором →</Link></LocaleElement></LocaleElement> : <><LocaleElement as="div" className="selection-layout"><LocaleElement as="div" className="selection-items">{selection.items.map((item) => {const product = productById(item.id);return <LocaleElement as="article" className="selection-item" key={item.id}><LocaleElement as="div" className="selection-product"><ProductIcon product={product} size={48} /><LocaleElement as="div"><LocaleElement as="span" className="product-sku">{product.designation || product.sku || product.name}</LocaleElement><Link className="product-name" href={`/catalog/${product.id}`}>{displayProductName(product)}</Link>{displayExecution(product) && <LocaleElement as="span" className="catalog-meta">{displayExecution(product)}</LocaleElement>}<LocaleElement as="span" className="product-kind">{product.source === 'demo' ? 'Синтетический пример' : product.source === 'official' ? 'Публичная серия; исполнение уточняется' : 'Позиция каталога'}</LocaleElement></LocaleElement></LocaleElement><LocaleElement as="label" className="quantity-label"><LocaleElement as="span">Количество, шт.</LocaleElement><Quantity key={`${item.id}-${item.quantity}`} item={item} sku={product.designation || product.sku || product.name} onChange={(value) => selection.setQuantity(item.id, value)} /></LocaleElement><LocaleElement as="button" className="remove-item" onClick={() => {selection.remove(item.id);setNotice(`${product.designation || product.sku || product.name} удалён из подборки`);}} aria-label={`Удалить ${product.designation || product.sku || product.name}`}>×</LocaleElement></LocaleElement>;})}</LocaleElement><LocaleElement as="aside" className="selection-summary"><LocaleElement as="p" className="catalog-kicker">СОСТАВ ПОДБОРКИ</LocaleElement><LocaleElement as="dl"><LocaleElement as="div"><LocaleElement as="dt">Позиций</LocaleElement><LocaleElement as="dd">{selection.items.length}</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="dt">Единиц оборудования</LocaleElement><LocaleElement as="dd">{selection.count}</LocaleElement></LocaleElement></LocaleElement><Link className="catalog-button primary" href="/inquiry?intent=quote">Подготовить запрос <LocaleElement as="span" aria-hidden="true">→</LocaleElement></Link><LocaleElement as="button" className="catalog-button" style={{ marginTop: 10 }} onClick={download}>Скачать список CSV <LocaleElement as="span" aria-hidden="true">↓</LocaleElement></LocaleElement><LocaleElement as="p">Цены и наличие не заданы. Скачивание не отправляет заявку и не оформляет заказ. CSV сохраняет исходные наименования каталога.</LocaleElement></LocaleElement></LocaleElement><LocaleElement as="div" className="catalog-bottom-nav"><Link href="/catalog">← Продолжить подбор</Link><LocaleElement as="span" className="catalog-meta">Количество: от 1 до 999 на позицию</LocaleElement></LocaleElement></>}
    <LocaleElement as="p" role="status" className="catalog-status">{notice}</LocaleElement>
  </LocaleElement>;
}

export default function Selection() {
  const params = useSearchParams();
  return isApiCatalog(params) ? <LiveSelection /> : <StaticSelection />;
}
