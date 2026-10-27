import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signingBrowserSession, signingSessionId, nextSigningSessionId } from '../e2e-signing/session-fixture.js';
import { getSession, getSessionGeneration } from '../lib/api/sessionTransport.js';
test('signing fixture restores only public browser marker and changes generation on new login', () => {
  const previousWindow = globalThis.window, previousStorage = globalThis.sessionStorage;
  const org = '10000000-0000-4000-8000-000000000001';
  let stored = JSON.stringify({ access_token: 'obsolete', refresh_token: 'obsolete', organization_id: org });
  globalThis.window = {}; globalThis.sessionStorage = { getItem: () => stored };
  try {
    assert.deepEqual(getSession(), {}, 'obsolete stored bearer fixtures must stay rejected');
    stored = JSON.stringify(signingBrowserSession(org));
    assert.deepEqual(getSession(), { access_token: `browser:${signingSessionId}`, browser_session: signingSessionId, organization_id: org });
    assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), ['browser_session', 'organization_id']);
    const generation = getSessionGeneration();
    stored = JSON.stringify({ ...signingBrowserSession(org), browser_session: nextSigningSessionId });
    assert.ok(getSessionGeneration() > generation);
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previousStorage;
  }
});
