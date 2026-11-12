import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeMaterial, compareMaterials } from '../lib/public/material-localization.js';
import { materialMatches } from '../lib/public/material-search.js';

const source = {
  id: 'ru-katalog-example', title: 'Трансформаторы', copyright: 'Архив компании', published: '2025-04-12',
  attachments: [{ title: 'Паспорт', url: '/documents/original.pdf' }],
  blocks: [
    { type: 'paragraph', text: 'Описание' },
    { type: 'heading', text: 'Характеристики' },
    { type: 'list', items: ['Применение', 'ТМГ-630/10'] },
    { type: 'table', rows: [['Мощность', '630'], ['Напряжение', '10/0,4']] },
    { type: 'image', alt: 'Производство', src: '/content/factory.jpg', source: 'https://example.test/source' },
  ],
};
const translations = { Трансформаторы: 'Transformers', 'Архив компании': 'Company archive', Описание: 'Description',
  Характеристики: 'Specifications', Применение: 'Application', Мощность: 'Power', Напряжение: 'Voltage', Производство: 'Production' };
const tx = value => translations[value] || value;

test('archive translates every rendered text shape without changing evidence and source records', () => {
  const snapshot = structuredClone(source);
  const result = localizeMaterial(source, tx);
  assert.equal(result.title, 'Transformers');
  assert.equal(result.copyright, 'Company archive');
  assert.equal(result.blocks[0].text, 'Description');
  assert.equal(result.blocks[1].text, 'Specifications');
  assert.deepEqual(result.blocks[2].items, ['Application', 'ТМГ-630/10']);
  assert.deepEqual(result.blocks[3].rows, [['Power', '630'], ['Voltage', '10/0,4']]);
  assert.deepEqual(result.blocks[4], { ...source.blocks[4], alt: 'Production' });
  assert.equal(result.id, source.id);
  assert.equal(result.published, source.published);
  assert.deepEqual(result.attachments, source.attachments);
  assert.deepEqual(source, snapshot);
});

test('archive retains reverse chronology and sorts equal-date translated titles in the selected locale', () => {
  const older = { title: 'Трансформаторы', published: '2024-01-01' };
  assert.ok(compareMaterials(source, older, 'en', tx) < 0);
  const a = { title: 'Яблоко', published: '2025-01-01' };
  const b = { title: 'Арбуз', published: '2025-01-01' };
  const english = value => ({ Яблоко: 'Apple', Арбуз: 'Watermelon' })[value];
  assert.ok(compareMaterials(a, b, 'en', english) < 0);
  assert.ok(compareMaterials(a, b, 'ru', value => value) > 0);
});

test('archive search supports translated titles and Chinese/Uzbek category names without modifying the source', () => {
  const article = { id: 'ru-novosti-example', title: 'Трансформаторы', url: 'https://alageum.com/ru/novosti/example' };
  assert.ok(materialMatches(article, 'yangiliklar', 'Transformatorlar'));
  assert.ok(materialMatches(article, '新闻', '变压器'));
  assert.ok(materialMatches(article, '变压器', '变压器'));
  assert.equal(article.title, 'Трансформаторы');
});
