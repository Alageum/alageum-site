// Fail closed on unexpected states; a handoff receipt is never a signature.
export function validateSigningRequest(value, quoteId) {
  if (!value || value.quote_id !== quoteId ||
      !['configuration_required', 'ready', 'requested'].includes(value.status) ||
      typeof value.request_allowed !== 'boolean' ||
      value.request_allowed !== (value.status === 'ready') ||
      value.signature_status !== 'not_verified' || value.external_delivery !== 'not_configured') {
    throw new Error('Invalid quote signing request receipt');
  }
  return value;
}
