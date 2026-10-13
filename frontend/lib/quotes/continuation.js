// UI lifetime is narrower than the durable owner/organization receipt scope.
// Check live authority before every continuation, including the interval before
// React unmounts an old flow after a batched same-account re-login.
export function createQuoteContinuation(authScope, isAuthScopeCurrent) {
  let active = true;
  return {
    isCurrent: () => active && Boolean(authScope) && isAuthScopeCurrent(authScope),
    dispose() { active = false; },
  };
}
