# Browser-locator proof revision

The prior combined successor and all PR45 approvals remain byte-for-byte intact.
This revision addresses one browser-test defect: six role-based alert lookups
also matched the Next route announcer. Each assertion is now scoped to the
existing named federated sign-in region. No expected text, scenario, browser
configuration, application source or test exclusion is changed.

The exact corrected application/test snapshot is recorded in candidate-evidence.json.
Its commit includes the preceding proof snapshot; its 48-file application map
separately identifies only the original bounded application scope. The corrected
spec is not represented as having existed at the earlier source freeze.

The existing current-byte leaf is rebound to this revision's new authority and
fixed evidence. The complete closure retains the 617-path PR45 baseline and the
same 12 predecessor pairs, adds the two unchanged prior combined authority files,
and adds this README, corrected candidate evidence and fixed map. The new 673-path
closure and its new clearance/report are read by the same invocation owner.
The previous approval cannot authorize the changed candidate. Missing or pending
new authority fails closed even while the previous approval remains present.

Only a fresh independent review can approve the new exact manifest, verifier and
fixed map. Historical report or candidate hashes are never silently rewritten.
All existing reader/final-reread semantics and sequential-observation limitations
remain. Real EDS stays unavailable/off by default, live Google is unverified,
eGov is unavailable, and no release/security waiver, publication, deployment or
provider registration is authorized.
