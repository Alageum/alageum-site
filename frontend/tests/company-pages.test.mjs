import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { manufacturers, offices } from '../lib/public/content.js';
import { enterpriseCities, enterpriseContacts, enterprisesInCity, cityPoint, companyHistory, projectStages } from '../lib/public/company.js';
import { kazakhstanPath } from '../lib/public/kazakhstan-map.js';

test('all eight enterprise profiles retain their stable IDs and receive sourced contact details', () => {
  assert.equal(manufacturers.length, 8);
  assert.deepEqual(Object.keys(enterpriseContacts).sort(), manufacturers.map(item => item.id).sort());
  for (const contact of Object.values(enterpriseContacts)) {
    assert.match(contact.tel, /^\+7\d{10}$/); assert.ok(contact.address); assert.ok(contact.label);
    assert.ok(enterpriseCities.some(city => city.title === contact.city));
  }
});
test('city filtering preserves both separate Almaty enterprises', () => {
  assert.equal(enterprisesInCity(manufacturers).length, 8);
  assert.deepEqual(enterprisesInCity(manufacturers, 'Алматы').map(item => item.id), ['aemz', 'elmo']);
  for (const city of enterpriseCities) assert.ok(enterprisesInCity(manufacturers, city.title).length > 0);
  assert.deepEqual(enterprisesInCity(manufacturers, 'Unknown'), []);
});
test('map city centres use attributed bounded geography, not factory coordinates', () => {
  assert.match(kazakhstanPath, /^M[\d.,LZ]+$/);
  assert.equal(enterpriseCities.length, 6);
  for (const city of enterpriseCities) {
    assert.equal(new URL(city.source).hostname, 'www.geonames.org');
    const { x, y } = cityPoint(city); assert.ok(x > 0 && x < 820 && y > 0 && y < 460);
    assert.ok(!Object.hasOwn(city, 'address'));
  }
  assert.match(readFileSync('components/public/EnterpriseDirectory.js','utf8'), /не точные адреса заводов/);
});
test('regional directory contains unique official contacts and no invented manager promises', () => {
  assert.equal(offices.length, 11); assert.equal(new Set(offices.map(item => item.city)).size, 11);
  for (const office of offices) { assert.match(office.email, /@alageum\.com$/); assert.match(office.tel, /^\+7\d{10}$/); }
  assert.equal(offices.find(item => item.city === 'Алматы').tel, '+77710011411');
});
test('corporate history has an official source for every event', () => {
  assert.deepEqual(companyHistory.map(item => item.year), ['1997','1999','2012','2021']);
  for (const item of companyHistory) assert.equal(new URL(item.source).hostname, 'alageum.com');
  assert.equal(projectStages.length, 4);
});
test('corporate pages use local verified assets, keep contact preparation truthful and link to live routes', () => {
  for (const path of ['public/company/ktz-production.webp','public/company/aemz-engineers.webp']) assert.ok(existsSync(path));
  const contact = readFileSync('app/(site)/contacts/page.js','utf8');
  assert.match(contact, /не отправляет заявку на сервер/); assert.match(contact, /почтовую программу/);
  assert.ok(!contact.includes('<form')); assert.ok(!contact.includes('fetch('));
  const home = readFileSync('app/(site)/page.js','utf8');
  assert.match(home, /1997/); assert.match(home, /getCorporatePhoto/); assert.match(home, /manufacturer/);
});
