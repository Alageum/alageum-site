# Dependency audit blocker — 3 October 2026

The current dependency gates are blocked by the public braces advisory
[GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
This report records the check at 06:43 UTC on 3 October 2026. It is not a
production-readiness or exhaustive security assessment.

## Current evidence

The [PR17 Node run](https://github.com/StiveMan1/Alageum_Temp/actions/runs/37103538833)
on commit `e0528a9e35be3891bcd354e611a0dc978e350ab5` reports 29 high and three
moderate affected backend package entries, with no critical entries. Its audit
job is `111147619220`, artifact `11266204333`. All 29 high entries propagate
from the same braces advisory; they are not 29 separate vulnerabilities.

The [general CI run](https://github.com/StiveMan1/Alageum_Temp/actions/runs/37103538782)
reports five high frontend package entries from the same chain. Its frontend
audit failed before lint, unit tests and builds; dependent general/Vercel browser
jobs were skipped. Separate Node functional jobs execute independently, so their
passes must not be described as an entirely successful CI result.

Dependency manifests and lockfiles did not change in the invoice feature.
Earlier retained audits are historical results, not a current clean bill of
health. The advisory was published on 18 September, then reviewed/updated on
2 October 2026; it newly surfaced in these npm audit results.

## Supported fix availability

The advisory affects braces through 3.0.3 and lists no patched release. Fresh
official npm metadata still identifies 3.0.3 as the latest release, published
21 May 2024. The upstream [depth-guard fix PR72](https://github.com/micromatch/braces/pull/72)
is open and unpublished at the time of this check.

There is no compatible published braces update to apply. npm audit's suggested
Strapi 4.26.2 is an incompatible downgrade from the pinned Strapi 5.56.0, and is
not a remediation candidate. The installed Strapi and Next ESLint releases are
already the latest stable versions checked. Latest micromatch and fast-glob
still retain affected dependency paths.

## Installed paths and bounded exposure review

- Backend: one deduplicated braces 3.0.3, marked production and transitive.
  Immediate parents are chokidar 3.6.0 (`~3.0.2`) and micromatch 4.0.8
  (`^3.0.3`). Strapi packages include development/build tooling in their
  dependency graph; the production flag alone does not establish a public
  HTTP input path.
- Frontend: one braces 3.0.3, entirely development-marked, through
  eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch.
  The inspected fast-glob call consumes ESLint `settings.next.rootDir`, which
  this project does not configure.
- The inspected backend chokidar call belongs to the Strapi development watcher
  and consumes local paths/configuration. Strapi's code-upload helper uses
  `micromatch.isMatch`; the installed implementation delegates that operation
  to picomatch. A filename used as a match subject does not establish a route
  into the vulnerable brace-pattern walkers.

No application endpoint accepting attacker-controlled brace patterns was found
in this bounded inspection. This is not proof of non-reachability and does not
clear the advisory or authorize weakening the audit gate.

## Decision and next step

Keep both audit gates and the production startup refusal unchanged. Do not use
`npm audit --force`, a major downgrade, an unpublished fork, a blanket override,
or an advisory exclusion to obtain a green result. Chokidar 4/5
[removes glob support](https://github.com/paulmillr/chokidar#upgrading), and v5 is
also ESM-only; replacing Strapi's pinned chokidar would change supported behavior
while leaving the micromatch paths.

When an official patched braces release or compatible upstream dependency removal
is published, verify its advisory range and supported interfaces first. A patched
3.0.x would fit both present parent ranges, permitting a targeted lockfile update
without a new override. Then run clean installs, both full audits, aggregate
checks and the existing compiled glob/upload/HMR compatibility tests in a
separate dependency checkpoint. No such release exists at this report's check
time, and no dependency changes are made here.
