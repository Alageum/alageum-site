import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../app/(site)/login/page.js', import.meta.url), 'utf8');

// Source-level regression guard: the page must not ship a preset account.
// Password-manager autofill remains enabled and is controlled by the browser.
test('login email starts empty and keeps username autofill', () => {
  assert.match(source, /const \[email, setEmail\] = useState\((?:""|'')\);/);
  assert.match(source, /value=\{email\}.*type="email" autoComplete="username" required/);
});

test('login password starts empty and keeps current-password autofill', () => {
  assert.match(source, /const \[password, setPassword\] = useState\((?:""|'')\);/);
  assert.match(source, /value=\{password\}.*type="password" autoComplete="current-password" required/);
});
