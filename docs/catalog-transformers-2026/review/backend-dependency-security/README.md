# Bounded backend dependency successor

This candidate is based on PR #44 commit
`9dc634a9cc8f1f3341baca3d553703a71cb33d6d`, tree
`2cd6d6ad48632334f3409a2bf43578111cc81164`.

The runtime change is the `@strapi/upload`-scoped `sharp` override from
0.35.4 to 0.35.5. Strapi stays at 5.56.0. The manifest and lockfile match
the dependency bytes reviewed on 2026-10-07. The lock delta contains only
the 27 sharp and native `@img` package records.

The upload regression code and its qualification evidence were rebuilt on
2026-10-08 after the original local candidate became unavailable. This is
a separately identified candidate. An earlier review or test result does
not approve or qualify these rebuilt bytes. Native verification details
and their limitations are recorded under `backend-node/docs/`.

## Proof boundary

- The frozen baseline is the 595-path PR44 closure plus its existing
  clearance, independent review and CMS catalog integration helper.
- Nine explicit predecessor pairs are eligible for the bounded successor.
  Every other inherited path retains its original byte pin.
- The backend leaf reads only current bytes through the existing proof
  invocation owner. It does not call an inherited verifier or substitute
  historical bytes in production.
- The prior frontend-security and KTPB adapters forward only exact declared
  predecessor pairs. Historical approval records and fixed maps stay intact.
- Historical test readers preserve the published PR44 tests separately.
  The backend amendment tests exercise the current combined stack, including
  missing and pending authority, scope changes, mutations and warm rereads.
- Approval binds the complete candidate dependency map and the exact
  independent-review report. A pending report is not approval.

The inherited sequential-observation contract is unchanged. These reads
are not an atomic filesystem snapshot; transient mutation followed by
restoration between observations, and changes after a final path read,
remain outside the guarantee. No cross-invocation cache is introduced.

## Unchanged constraints

Catalog source data, UI, geometry, native Page/Slate adapters, workflow
files, dependency-audit gates and the proof-invocation coordinator are
unchanged. Full dependency audits remain mandatory even when affected
functional checks pass. Production-only audits cannot replace them.

Browser acceptance remains separate from local unit, HTTP and build
verification. No local browser pass is claimed. This evidence does not
authorize a merge, deployment or release.
