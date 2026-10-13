import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const tokens = JSON.parse(read('../Design/design-tokens.json'));

test('approved shared palette agrees with the existing design reference', () => {
  for (const [key, expected] of [['red', '#CE1727'], ['red-hover', '#B71322']]) assert.equal(tokens.color.brand[key].$value, expected);
  assert.equal(tokens.color.neutral.ink.$value, '#1D1D1B');
  const global = read('app/site-shell.css').toLowerCase().replaceAll(' ', '');
  for (const value of ['--brand-red:#ce1727', '--ink:#1d1d1b', '--line:#c6c6c6']) assert.ok(global.includes(value));
  const panel = read('../Design/index.html');
  for (const value of ['#CE1727', '#1D1D1B', '#C6C6C6', 'id="corporate-surfaces"']) assert.ok(panel.includes(value));
  for (const old of ['#CE1528', '#181A1C', '#D9DDE1']) assert.ok(!panel.includes(old));
});
test('corporate composition is explicit and does not opt engineering routes in', () => {
  for (const route of ['page.js','contacts/page.js','documents/page.js','data-policy/page.js','manufacturers/page.js','manufacturers/[slug]/page.js','projects/page.js','projects/[slug]/page.js','solutions/page.js','solutions/[slug]/page.js']) assert.match(read(`app/(site)/${route}`), /<CorporatePage/);
  for (const route of ['catalog/page.js','catalog/[slug]/page.js','catalog/compare/page.js','inquiry/page.js','selection/page.js','workspace/page.js','login/page.js','admin/catalog/page.js']) assert.doesNotMatch(read(`app/(site)/${route}`), /CorporatePage|corp-investor/);
  assert.match(read('components/public/CorporatePage.js'), /corp-investor/);
  assert.doesNotMatch(read('app/investor-pages.css'), /(?:^|\n)(?:body|:root|\.catalog|\.site-header)\s*[{,]/);
});
test('all dated project claims and privacy copy remain source-backed, not promotional', () => {
  const privacy = read('app/(site)/data-policy/page.js');
  assert.match(privacy, /не отправляются менеджеру/);
  assert.match(privacy, /Не вводите реальные банковские/);
  assert.match(read('app/(site)/projects/[slug]/page.js'), /item.note/);
  assert.match(read('app/(site)/projects/page.js'), /getProjectPhoto/);
  assert.match(read('components/public/EnterpriseDirectory.js'), /getManufacturerPhoto/);
});
test('brand buttons and normal muted copy retain AA contrast on their surfaces', () => {
  const l = hex => { const c=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722; };
  const contrast=(a,b)=>(Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05);
  for(const [foreground,background] of [['CE1727','FFFFFF'],['B71322','FFFFFF'],['1D1D1B','F2F3F4'],['676D73','F2F3F4'],['5B636A','EFF1F3']]) assert.ok(contrast(foreground,background)>=4.5, `${foreground} on ${background}`);
});
