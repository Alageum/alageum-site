import test from 'node:test';
import assert from 'node:assert/strict';
import { stubRenderBoundaries } from './helpers/render-boundaries.mjs';

test('render harness replaces only known presentation-boundary imports, including compact locale imports', () => {
  const source = `'use client';import E from "@/components/locale/LocaleElement";
import Resource from '@/components/locale/LocalResourceAnchor';
import Link from '@/components/locale/LocaleLink';
import Select from '@/components/ui/DesignSelect';
import Protected from '@/lib/catalog/models/visualMap';
const value = <E as="a" href="/catalog/source?page=69" data-source-figure="exact">Original value</E>;`;
  const transformed = stubRenderBoundaries(source);
  assert.match(transformed, /const E = \(\{ as: Tag = 'span', children, \.\.\.props \}\)/);
  for (const [name, tag] of [['Resource', 'a'], ['Link', 'a'], ['Select', 'select']]) assert.ok(transformed.includes(`const ${name} = props => <${tag} {...props}/>;`));
  assert.ok(transformed.includes("import Protected from '@/lib/catalog/models/visualMap';"));
  assert.ok(transformed.includes('href="/catalog/source?page=69" data-source-figure="exact">Original value'));
  assert.equal(stubRenderBoundaries(transformed), transformed);
  assert.equal(stubRenderBoundaries("import Resource from 'file:///workspace/example/frontend/components/locale/LocalResourceAnchor.js';"), 'const Resource = props => <a {...props}/>;');
});

test('unknown modules and all tested catalog logic are left for the real loader to resolve or reject', () => {
  const source = `import Guard from '@/components/catalog/Guard';
import Unknown from '@/components/locale/FutureBoundary';
import { useLocale } from '@/components/locale/LocaleProvider';
export const authorized = product => Guard(product);`;
  assert.equal(stubRenderBoundaries(source), source);
});
