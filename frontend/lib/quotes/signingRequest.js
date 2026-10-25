// Fail closed on unexpected states; handoff is not signature verification.
export function validateSigningRequest(value, quoteId) {
  if (!value || value.quote_id !== quoteId ||
      !['configuration_required', 'preparation_available', 'ready', 'requested'].includes(value.status) ||
      value.prepare_allowed !== (value.status === 'preparation_available') ||
      value.request_allowed !== (value.status === 'ready') ||
      !['not_verified', 'pending_verification', 'verified', 'rejected'].includes(value.signature_status) ||
      (value.signature_status !== 'not_verified' && value.status !== 'requested') ||
      !(value.pdf_sha256 === null || /^[0-9a-f]{64}$/.test(value.pdf_sha256)) ||
      (['ready', 'requested'].includes(value.status) && !value.pdf_sha256) || value.external_delivery !== 'not_configured') {
    throw new Error('Invalid quote signing request receipt');
  }
  return value;
}
