# Current generic quote acceptance (not the frozen reference)

`run_current_generic_quote.py` selects a separately authenticated current input
manifest, then invokes the **unchanged** original private-cluster runner and
94-request scenario. It changes only that runner's explicit manifest data;
application, cases, limiter, clock, ORM and cleanup functions are not replaced.
The historical runner, manifest and workflow remain unchanged and can still
reject this different current tree. This gate grants no historical approval,
release approval, deployment proof or Node/Strapi endpoint parity.

All 86 original manifest input digests were matched to authentic historical
revision `8f8bd11a942e50686d7f8bbd52e1bb5ba3d9721a`. Exactly five successor
byte edges are pinned separately:

- `backend/alembic.ini`: remove the built-in database URL (no restored password).
- `backend/app/core/config.py`: remove the development secret default.
- `backend/requirements.lock` and `requirements-dev.lock`: only certifi
  `2026.7.22` → `2026.10.19`.
- `backend/uv.lock`: the matching certifi artifact URLs, hashes, sizes and upload
  times, and lock revision 3 → 5. No other package is changed.

The new runner pins the new manifest digest and authenticates original manifest,
runner and cases bytes **before import**. Every one of the 86 current inputs is
verified. Unknown/missing app Python files and Alembic migrations refuse; the
migration inventory remains exactly seven files. Symlinked executable inputs
refuse. Unmanifested `.so`, `.pyd`, `.pyc`, `.pyo` and `__pycache__` artifacts
in app/Alembic refuse as well; run from a fresh source checkout (not a previously
executed application workspace). Runtime still requires Python 3.12, its unchanged 4,300-digit guard and
all 72 installed distribution versions, with certifi as the only package delta.
These checks authenticate this finite source closure, not the entire OS runtime.

```sh
python backend/tests/reference/run_current_generic_quote.py --verify-only
python backend/tests/reference/test_current_generic_quote.py
# In an unprivileged, provisioned Python 3.12 environment:
python -m pip install -r backend/requirements-dev.lock
python backend/tests/reference/run_current_generic_quote.py \
  --postgres-bin /usr/lib/postgresql/16/bin \
  --output /new/path/current-generic-quote-report.json
```

The stdlib checks do **not** run endpoints. Dedicated
`.github/workflows/current-generic-quote.yml` runs the existing actual ASGI app,
ORM and freshly migrated PostgreSQL 16, preserving bounded setup/cases/cleanup,
no inherited database configuration, no reused service or real data, least-
privilege runtime role, sanitized evidence and cleanup-required success.
See the original README for the exact finite scenario and isolation boundaries.

Reports carry `verification_scope: current-generic-ASGI-ORM-PostgreSQL`,
`reference_revision` (historical source identity), `historical_approval: false`,
the current manifest digest, complete current input/version map and five edges.
They deliberately omit `frozen_revision`. Only a successful runtime report is
current endpoint evidence; a source check is not an acceptance pass.
