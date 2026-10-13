# Generic quote compatibility proof gates

This checkpoint adds reference verification, not a generic Node endpoint or a
new application schema. The frozen application oracle is PR24 commit
`8f8bd11a942e50686d7f8bbd52e1bb5ba3d9721a`. The Node compatibility route remains
unavailable until the separate design and implementation gates pass.

## Actual legacy application reference

The standalone runner under `backend/tests/reference` executes the actual
FastAPI application and lifespan, real password authentication, authority
dependencies, SQLAlchemy and asyncpg against a newly owned PostgreSQL cluster.
It runs the existing Alembic migration chain and verifies its head. Application
source hashes and installed package versions are checked against the pinned
manifest; no production code is replaced.

The transport is in-process ASGI with declared synthetic peer identities. This
proves application/ORM/database behavior, not a deployed HTTP listener, proxy,
TLS or network decompression. The fixture avoids the ordinary pytest autouse
setup, which recreates tables and clears the limiter between tests. No limiter
reset, fake clock, automatic POST retry or dependency override is used here.

The corpus is bounded by 100 quote endpoint requests and a 180-second case
process deadline after setup. It includes a real quota expiry wait. All data,
accounts, grants and keys belong only to the disposable fixture. Existing
database configuration is excluded; identity/freshness checks precede DDL.
Only sanitized results are retained, never database files or authentication
material. Failure or unverified cleanup cannot count as acceptance.

The hosted job pins Ubuntu 24.04, Python 3.12.14 and PostgreSQL major 16, recording
the actual server version. GitHub's current
[Ubuntu 24.04 runner inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
lists PostgreSQL 16 and cached Python 3.12.14. The job uses those existing tools
without starting system database services. It installs the existing locked
Python requirements and preserves the separate security gates.

The [PR25 reference run](https://github.com/StiveMan1/Alageum_Temp/actions/runs/37136229614)
passed on exact head `29753e21b6767e4aa52a0a255a4f3d247294f44a` with PostgreSQL
16.15: 80 quote requests, four password logins, 72 exact installed package
versions and all 86 pinned source hashes. The expected FK/check/overflow and
audit rejection SQLSTATEs were observed with full rollback. Natural quota expiry
waited 60.763 seconds; child exit, database shutdown and owned fixture removal
were verified before publication. Artifact `11277993506` has SHA-256
`d5405829874c91261fa85c5e125c4067b3fc3e5f1967c84ee4478979745e519a`.

## Protected raw-token proof

Exact integer parameters cannot be reconstructed from an already-rounded
JavaScript Number. The pinned native parser exposes raw text only through a
static `includeUnparsed` option. A supported, reviewed integration must preserve
all unrelated route behavior, the required native middleware, size and prototype
protections, and secret-handling boundaries.

The naive global raw option plus cleanup is insufficient: native empty text
bodies change from an empty string to an object. A separate local diagnostic
tested explicit baseline restoration, removal of raw metadata before other
handlers, and retention only for prospective generic processing. Its final
native comparison passed 394 requests across 197 matching pairs, including all
32 frozen parser vectors, native authentication, CMS editing/publication,
uploads, limits and malformed bodies. Fixture shutdown/removal and unchanged
source/dependency hashes were verified. The initial 330-request checkpoint is
retained separately. Generic POST is still absent: decoded requests reach a
405 routing response because the existing GET route shares its path.

That finite comparison normalizes declared ephemeral identities and response
values; it is not universal byte parity or a business DTO/storage proof. The
diagnostic and its evidence are separate from the legacy-reference source
checkpoint. Independent review found an additional limitation: a numeric helper
called from the first candidate could throw on a native-valid 4,301-digit integer
before routing. That unmeasured case could change the generic routing result to
500. The earlier passing reports remain unchanged and do not close that gap.

The subsequent capture-only v2 candidate removes every validation/helper call
from the boundary middleware. It retains only protected raw text for prospective
generic processing; a separate diagnostic observer catches helper errors without
affecting routing. Its final native run passed 209 matching pairs: 418 socket
requests, 416 completed responses and two deliberate aborts. It preserved the
original 197-case sequence and added 12 ordinary/overwritten integer-limit cases
on generic, auth, CMS and catalog routes. Generic 4,300-digit, 4,301-digit and
overwritten 4,301-digit cases all remained 405; the other route families retained
their 422 outcomes without generic capture or diagnostics. Independent source and
result re-review closed the specific helper exception finding.

Strict path-only native capture remains unavailable through a selected supported
hook. The tested adaptation is global native capture followed immediately by
metadata cleanup and scoped private retention, then cleanup on unwind. No raw
logging or broad request-state retention is approved. Application configuration
has not adopted the candidate. Future generic decoding, error policy, quota/auth
ordering and persistence remain separate integration requirements. No vendor
patch, middleware bypass or generic business route follows from this finite proof.

Both prerequisite gates have passed within those limits. The next bounded stage
is a fresh-store schema and native key/FK proof; generic HTTP creation remains
disabled until that storage proof passes. Native Strapi product-key uniqueness,
FK lifecycle, startup/restart retention,
fresh-store refusal and unchanged catalog/idempotency/read/print behavior remain
mandatory later implementation acceptance checks. Existing dependency-security
failures, audit IP/source limitations and timestamp precision differences remain
explicit; this checkpoint does not approve a production cutover.
