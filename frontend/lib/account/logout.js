// A logout receipt may outlive its data scope, but never a newer login. The
// transport supplies the post-clear generation only when it cleared its owner.
export function acceptsLogoutReceipt(receipt, generation, session) {
  return receipt?.cleared === true && Number.isSafeInteger(receipt.generation) &&
    receipt.generation === generation && !session?.access_token;
}
