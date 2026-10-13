# Reviewed catalog media authoring

The native catalog editor now has **Product media**. It can edit alternative text,
remove or reorder existing attachments, attach the exact record's reviewed image,
or restore that reviewed array. Saving is still the existing versioned native
PUT/PATCH; there is no independent media write endpoint or public API field.
New products and the 24 imported records without reviewed media have no image
choice. Ordinary cited source pages are read-only references, not a photo picker.

## Evidence and representation

`node scripts/generate-catalog-media.mjs` derives associations from the effective
238 immutable import records and the unchanged `getEquipmentVisual` review.
`--check` verifies the generated backend manifest, compact frontend projection
and mirrored bytes against those authoritative sources. It does not infer
relationships from category, name or editable provenance. The native service
matches each stored `source_data` using a recursively key-sorted SHA-256, so
PostgreSQL JSONB key order does not affect the association. Editing ordinary
fields leaves the original choices intact. An unimported record cannot gain
choices by borrowing an imported public key or copying editable provenance.

The special `cat-bktp-modular-v001` import contains the family crop from page 39,
whereas its reviewed single-transformer representation is the scan of page 38.
The database import and source evidence stay unchanged. Public rendering chooses
the reviewed scan only while the saved media array exactly equals the original
import, in order, with the same path/kind and alt-presence/value, and the existing
transport UUID equals that exact imported record's deterministic UUID. New v1
rows borrowing its public key cannot receive the reviewed display default.
Object-key order is irrelevant. An explicit empty array stays empty; already edited/custom arrays
remain authoritative. In CMS the original page-39 row is a read-only legacy
attachment until the editor explicitly restores page 38 or removes it. This
prevents an alt-only edit from unexpectedly switching the public image back.

Reviewed source scans are visibly labeled as scans and link to their actual
page. Crops retain the series/not-a-specific-product-photograph warning. Editable
accessibility text is used only for the image alt attribute. Missing/null alt
uses an honest default; explicit empty alt is preserved. The exact existing
SVG icon and construction maps are untouched. Actual selected-image source
links are independent of the construction review, including custom page-39 media.

## Native authority and legacy attachments

Native additions and alt changes require this exact immutable record's reviewed
image association. Existing safe media outside that association can be retained,
removed or reordered, with path/kind and absent/null/empty alt preserved; it
cannot be newly attached or have its alt changed. Duplicate counts cannot grow.
The generic v1 safe-global-asset contract is unchanged. Existing file safety,
50-entry count, 1,000-character alt bound and strict entry-shape validation still
apply. No remote URLs, traversal, unreviewed scans, brand choices, uploads or new
storage/auth mechanisms are introduced.

The native manager/session/role checks are reacquired inside the product lock,
version and atomic audit transaction. Choices and previews also recheck fresh
native authority in a transaction. B2B credentials do not grant native access.
Save failures retain the draft; Hide/Restore are disabled while media is dirty.
Untouched media is omitted, preserving exact existing source/specification,
translation, provenance and identity values. Saved RFQ snapshots retain their
existing contract, which excludes media and provenance.

## Authenticated previews and release packaging

- `GET /alageum-catalog/products/:id/media-options` returns derived read-only
  choices and current/imported/reviewed context
- `GET /alageum-catalog/products/:id/media-preview/:entryId` maps a scoped opaque
  SHA-256 identifier to fixed packaged bytes; it does not accept a path or URL
- Every preview validates canonical allowlist membership, expected raster MIME,
  regular-file status, size, digest and WebP signature. Missing/mismatched bytes
  fail closed with 404. Responses use `image/webp`, `nosniff`, and
  `Cache-Control: private, no-store`
- Pinned Strapi 5.56.0 supports authenticated Blob GETs. The editor passes the
  captured token as a header, never in a URL, avoids 401 replay, and aborts/ignores
  stale reads while revoking object URLs on replacement/unmount. The existing
  CSP permits `blob:` images; no remote-origin/CSP expansion is needed

The derived release mirror lives in `backend-node/data/catalog-media`, outside
`public`. Its 59 original crops plus reviewed page-38 scan total 1,452,744 bytes.
There is no second editable media library or custom archive. Existing backend-only
Docker context/COPY includes this directory. `check-media-package.js` verifies
all exact bytes in `check`, prebuild, predevelop and prestart, and Docker runs it
before compilation. Source-derivation tests also compare every mirrored asset to
the canonical `frontend/public` original. Do not edit mirror files directly.

## Verification status

The complete sequential local candidate run on source checkpoint `76d7f84` passed
74 backend units, 60 real PostgreSQL/native integration tests (including eight
media groups), 164 frontend units, frontend lint, Strapi Vite build/asset checks,
Next API/quotes/Page/static-preview builds, 12 Page contracts, 196 Page HTTP cases
and all 13 native Page groups available in HTTP-only mode. Its machine-readable
report is `backend-node/docs/native-catalog-media-regression-results.json`.

Browser discovery retains 45 default cases and four optional-webpack cases, with
no retries or added login sessions. Five existing CMS cases now exercise media,
including real public image/alt/disclaimer rendering, authenticated Blob previews,
page-38 restoration, native permission denial, conflicts and auth interruptions.
Browser helpers wait for product rendering, open the existing original-image
disclosure before checking its lazy-loaded image, and verify absence only after
the public product has loaded. The final absence-wait correction changes no
application source.

Chromium is denied in the local executor, so those browser assertions and their
screenshots await hosted execution; discovery is not a browser pass. Docker is
not installed locally, so package verification does not claim a built Docker
image or Docker runtime result. The existing audit gate and `APP_ENV=production`
refusal remain enabled; this is not a production deployment.
