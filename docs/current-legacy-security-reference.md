# Current legacy reference after certifi security remediation

The archived `legacy-query.json`, `legacy-quote-limit.json`, `legacy-system.json`
and all three original generators remain byte-for-byte unchanged. Their historical
source revisions are not changed and their old executions are not relabeled current.
The preceding current-reference manifest is also retained, with its original source
revision/execution results, as `current-legacy-reference.pre-certifi-20261019.json`
(SHA256 `14cc5a4788a83b8426f5afc6a55855e0ece8b77f6d9f31a5dac2cf9ac8cfac13`).

The new v2 manifest describes a **fresh** execution against the reviewed source map
at published revision `4b723b73515d0b2b4016541892ce69167ecafd7f`. Current uv.lock hash:
`06e080b4fa6191dcfea7e9f2189205c9cec4dc67cd66ec8fee654314ac2f1362`.
Relative to the archived lock, only certifi changes from 2026.7.22 to 2026.10.19
with its distribution URLs/checksums, plus uv lock-format revision 3 → 5.
Previously documented inactive-default-credential sanitization in config.py remains
a separate provenance item. No application source or behavioral runtime dependency
pins are silently accepted as drift.

`verify_current_legacy.py` loads each unchanged original generator in an isolated
child, substitutes only the explicitly pinned current-source map for that fresh run,
retains the generator's exact Python/package/runtime checks, and compares every
non-provenance output to the archived vectors. It additionally checks current
certifi against the exact lock. System now uses the same current-reference wrapper;
its original archived generator still rejects a changed historical lock by design.

Fresh local execution on 2026-10-25:
- query: 185 cases, archived behavioral output equal;
- quote limiter: 12 cases + 9 client-key cases, output equal;
- system: 124 vectors (3 DTO, 12 timestamps, 6 metric steps, 99 rounding, 4 integers),
  output equal.

Commands:
```
python backend-node/tests/reference/verify_current_legacy.py --check
node --test backend-node/tests/current-legacy-reference.test.js
```

CI invokes the current wrapper, not regeneration of historical fixtures. This proves
only the generators' explicitly bounded behavioral scope, not full legacy endpoint
execution, legal approval, security approval, deployment readiness or real signing.
