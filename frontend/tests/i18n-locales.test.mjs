import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { locales, localeFromPath, stripLocale, localizedHref } from '../lib/i18n/routing.js';
const dictionaries = JSON.parse(readFileSync(new URL('../lib/i18n/dictionaries.json', import.meta.url)));
const careers = JSON.parse(readFileSync(new URL('../components/careers/translations.json', import.meta.url)));
test('five locales preserve page, query and fragment when switching language', () => {
  assert.deepEqual(locales, ['ru', 'kk', 'en', 'zh', 'uz']);
  for (const locale of locales) {
    const href = localizedHref('/zh/catalog/directions/lv-power-cabinets?source=api#products', locale);
    assert.equal(localeFromPath(href), locale);
    assert.equal(stripLocale(href), '/catalog/directions/lv-power-cabinets?source=api#products');
  }
  assert.equal(localizedHref('/api/feedback', 'zh'), '/api/feedback');
  assert.equal(localizedHref('/media/catalog.pdf', 'uz'), '/media/catalog.pdf');
  assert.equal(localeFromPath('/uzbekistan'), 'ru');
});
test('non-Russian locales have complete shared and career dictionaries', () => {
  for (const locale of locales.filter(locale => locale !== 'ru')) {
    for (const key of Object.keys(dictionaries.en)) assert.ok(dictionaries[locale][key]?.trim(), `${locale}: ${key}`);
    for (const [key, values] of Object.entries(careers)) assert.ok(values[locale]?.trim(), `${locale} career: ${key}`);
  }
});

test('technical designations stay unchanged while surrounding interface text translates', async () => {
  const source = readFileSync(new URL('../lib/i18n/translate.js', import.meta.url), 'utf8')
    .replace("'./dictionaries.json'", `'${new URL('../lib/i18n/dictionaries.json', import.meta.url).href}' with { type: 'json' }`);
  const { translateText } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  for (const locale of ['en', 'kk', 'zh', 'uz']) {
    assert.equal(translateText('2БКТП-2500/10-0,4 УХЛ1', locale), '2БКТП-2500/10-0,4 УХЛ1');
    assert.equal(translateText('АОДЦТН-167000/500', locale), 'АОДЦТН-167000/500');
    assert.notEqual(translateText('Каталог оборудования', locale), 'Каталог оборудования');
    assert.equal(translateText('Проектируем: подробнее', locale), `${translateText('Проектируем', locale)}: ${translateText('Подробнее', locale)}`);
  }
});

test('code-prefixed prose and mixed technical labels translate without changing identifiers or numbers', async () => {
  const source = readFileSync(new URL('../lib/i18n/translate.js', import.meta.url), 'utf8')
    .replace("'./dictionaries.json'", `'${new URL('../lib/i18n/dictionaries.json', import.meta.url).href}' with { type: 'json' }`);
  const { translateText } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const prose = 'ТМГ-630/10 предназначен для распределительных сетей.';
  const joined = 'ТМГ-630/10 и ТМГ-400/10';
  const dictionary = { [prose]: 'ТМГ-630/10 is intended for distribution networks.', [joined]: 'ТМГ-630/10 and ТМГ-400/10', 'ВН:': 'HV:' };
  assert.equal(translateText(prose, 'en', dictionary), dictionary[prose]);
  assert.equal(translateText(joined, 'en', dictionary), dictionary[joined]);
  assert.equal(translateText('ВН: 330/√3 кВ', 'en', dictionary), 'HV: 330/√3 kV');
  assert.equal(translateText('ТМГ-630/10', 'en', dictionary), 'ТМГ-630/10');
  assert.equal(translateText('10/0,4 кВ', 'en'), '10/0,4 kV');
});

test('model designations embedded in paragraphs keep their source spelling', async () => {
  const source = readFileSync(new URL('../lib/i18n/translate.js', import.meta.url), 'utf8')
    .replace("'./dictionaries.json'", `'${new URL('../lib/i18n/dictionaries.json', import.meta.url).href}' with { type: 'json' }`);
  const { translateText } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const input = 'Поставлены трансформаторы ЭОЦН 35000/35-89У3 для печи РТП-2.';
  const dictionary = { [input]: 'EOTSN 35000/35-89U3 transformers were supplied for the RTP-2 furnace.' };
  assert.equal(translateText(input, 'en', dictionary), 'ЭОЦН 35000/35-89У3 transformers were supplied for the РТП-2 furnace.');
});

test('voltage expressions are not mistaken for numbered section headings', async () => {
  const source = readFileSync(new URL('../lib/i18n/translate.js', import.meta.url), 'utf8')
    .replace("'./dictionaries.json'", `'${new URL('../lib/i18n/dictionaries.json', import.meta.url).href}' with { type: 'json' }`);
  const { translateText } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const voltage = '380/220 В; номинальное напряжение главных цепей 400 В';
  assert.equal(translateText(voltage, 'en'), '380/220 V; rated voltage of the main circuits: 400 V');
  assert.equal(translateText('01 / Каталог', 'en'), '01 / ' + translateText('Каталог', 'en'));
});

test('preserving a code does not consume adjacent Chinese prose', async () => {
  const source = readFileSync(new URL('../lib/i18n/translate.js', import.meta.url), 'utf8')
    .replace("'./dictionaries.json'", `'${new URL('../lib/i18n/dictionaries.json', import.meta.url).href}' with { type: 'json' }`);
  const { translateText } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const input = 'На печи РТП-2 установлены два трансформатора.';
  assert.equal(translateText(input, 'zh', { [input]: '在RTP-2矿热炉上安装了两台变压器。' }), '在РТП-2矿热炉上安装了两台变压器。');
});
