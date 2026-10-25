import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSigningRequest } from '../lib/quotes/signingRequest.js';
const id = '11111111-1111-4111-8111-111111111111';
const receipt = { quote_id: id, status: 'configuration_required', request_allowed: false, signature_status: 'not_verified', external_delivery: 'not_configured' };
test('handoff receipts cannot invent signed, delivered, or ready state', () => {
  assert.equal(validateSigningRequest(receipt, id), receipt);
  for (const patch of [{ status: 'signed' }, { signature_status: 'verified' }, { external_delivery: 'sent' }, { quote_id: 'other' }, { request_allowed: true }, { status: 'ready' }]) {
    assert.throws(() => validateSigningRequest({ ...receipt, ...patch }, id));
  }
  assert.doesNotThrow(() => validateSigningRequest({ ...receipt, status: 'ready', request_allowed: true }, id));
  assert.doesNotThrow(() => validateSigningRequest({ ...receipt, status: 'requested' }, id));
});
