import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSigningRequest } from '../lib/quotes/signingRequest.js';
const id = '11111111-1111-4111-8111-111111111111', hash = 'a'.repeat(64);
const receipt = { quote_id: id, status: 'configuration_required', prepare_allowed: false, request_allowed: false, pdf_sha256: null, signature_status: 'not_verified', external_delivery: 'not_configured' };
test('handoff receipts cannot invent signed, delivered, or ready state', () => {
  assert.equal(validateSigningRequest(receipt, id), receipt);
  for (const patch of [{ status: 'signed' }, { signature_status: 'verified' }, { external_delivery: 'sent' }, { quote_id: 'other' }, { request_allowed: true }, { status: 'ready' }, { prepare_allowed: true }]) {
    assert.throws(() => validateSigningRequest({ ...receipt, ...patch }, id));
  }
  assert.doesNotThrow(() => validateSigningRequest({ ...receipt, status: 'preparation_available', prepare_allowed: true }, id));
  assert.doesNotThrow(() => validateSigningRequest({ ...receipt, status: 'ready', request_allowed: true, pdf_sha256: hash }, id));
  assert.doesNotThrow(() => validateSigningRequest({ ...receipt, status: 'requested', pdf_sha256: hash }, id));
  assert.doesNotThrow(() => validateSigningRequest({ ...receipt, status: 'requested', pdf_sha256: hash, signature_status: 'verified' }, id));
});
