'use client';

import { useMemo, useState } from 'react';
import LocaleElement from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { categories, officialProducts } from '@/lib/catalog/data';
import { filterProducts } from '@/lib/catalog/query';

export default function SelectionAssistant() {
  const [category, setCategory] = useState('transformers');
  const [query, setQuery] = useState('');
  const found = useMemo(() => filterProducts(officialProducts, { category, q: query }).length, [category, query]);
  const href = `/catalog?category=${category}${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''}`;

  return <section className="site-container selection-assistant">
    <header>
      <LocaleElement as="p" className="site-eyebrow">ALAGEUM ELECTRIC / ПОМОЩНИК ПОДБОРА</LocaleElement>
      <LocaleElement as="h1">Найдите оборудование по параметрам</LocaleElement>
      <LocaleElement as="p">Выберите категорию и введите обозначение, мощность или напряжение. Перед заказом согласуйте исполнение с производителем.</LocaleElement>
    </header>
    <div className="eco-form">
      <LocaleElement as="label">Категория оборудования
        <LocaleElement as="select" value={category} onChange={event => setCategory(event.target.value)}>
          {categories.map(item => <LocaleElement as="option" key={item.id} value={item.id}>{item.name}</LocaleElement>)}
        </LocaleElement>
      </LocaleElement>
      <LocaleElement as="label">Параметры или обозначение
        <LocaleElement as="input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Например: 630 кВА, 10 кВ или ТМГ" />
      </LocaleElement>
      <div className="selection-assistant-result">
        <LocaleElement as="p" role="status">Найдено позиций: <strong>{found}</strong></LocaleElement>
        <div className="site-actions">
          <Link className="site-button site-button-primary" href={href}>Открыть подходящие позиции →</Link>
          <Link className="site-text-link" href="/inquiry?intent=consultation">Запросить помощь с подбором →</Link>
        </div>
      </div>
    </div>
  </section>;
}
