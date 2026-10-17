# Public media admission and scanner operation

## Implemented boundary

New Strapi CMS media uploads are gated before image decoding and every provider
write. Binary replacements are refused before scanner, file or database mutation;
CMS users must upload a new image instead. Metadata edits remain available. CMS
authentication and upload-role checks remain native Strapi checks; business identities still cannot use CMS upload routes.
Existing reviewed static assets and shipped catalog PDFs are unchanged. Private
business documents remain in the separate authenticated document domain, not
Strapi's public Media Library.

The initial new-upload policy is deliberately narrow:

- PNG, JPEG (`.jpg`/`.jpeg`) and WebP, with matching filename, declared MIME,
  byte signature and decoded format
- 1 MiB actual bytes per file; up to 10 files / 10 MiB per multipart request
- 16,777,216 decoded pixels; single-frame images only
- Full decoding and re-encoding with the same pinned Sharp used by Strapi strips
  EXIF, profiles and trailing content. EXIF rotation is applied before stripping.
- No SVG, HTML, GIF, archives, executable files, PDF or Office-document admission
- No remote-URL imports, custom storage paths, path separators or symlink inputs
- Binary replacements disabled until atomic whole-asset storage is implemented

This is **not a complete new-public-PDF upload implementation**. The catalog's
existing `kind: document` contract accepts shipped canonical allowlisted PDF
paths, and those keep working. Arbitrary Strapi upload records are not currently
eligible catalog media. Supporting new public PDFs requires a separate reviewed
PDF admission/content policy and storage/serving design; uploading private
business documents into the public library is never the workaround.

## Lifecycle and code locations

This implementation is for the pinned Strapi 5.56.0 lifecycle verified in the
installed package source. The standard `src/extensions/upload/strapi-server.js`
extension wraps `services.upload` and the provider created by plugin `register`.
It does not modify installed package files.

1. `global::media-upload-temporary` precedes `strapi::body`. Its Formidable
   `onFileBegin` hook assigns every file an app-owned, random path in a private
   request directory, including unexpected multipart fields and parse failures.
2. Service admission reads actual bounded bytes with `O_NOFOLLOW`, rejects bad
   names/type/content, and scans untrusted input **before** invoking Sharp.
3. Canonical bytes are scanned again and written to a private `0600` quarantine
   file. Every input in a batch must pass before native persistence starts.
4. Native Strapi generates image variants only from admitted input. Low-level
   `upload` and `uploadStream` gates independently validate, normalize and scan
   the exact bytes passed to the provider. Low-level `replace` and `replaceStream`
   are also refused, so direct provider access cannot use the unsafe native path.
   Direct provider calls and every thumbnail/responsive output are covered.
5. Native persistence runs one input at a time. Started provider promises are
   drained before admission quarantine is removed. Multipart write streams are
   closed and request temporary directories are removed in an awaited `finally`,
   including invalid-input, decoder, scanner, provider and client-abort paths.

No rejected raw input or rejected variant is sent to public storage. Scanner
failure does not silently turn scanning off. Each public write is independently
admitted; native persistence is not an all-files database/storage transaction.
A provider or database failure after an admitted write can leave already-clean
bytes behind. Native multi-variant replacement can overwrite originals and delete
old variants before a later failure, so it is explicitly disabled. Orphan reconciliation and any future
atomic replacement implementation still need review; do not treat this patch
as a production cutover approval.

No automatic sweeping of unrelated or preexisting files is performed. A process
crash may leave a private request directory. Operators may remove this app's
orphaned `request-*` directories only while its workers are stopped. Do not point
quarantine at a shared folder or expose it through an HTTP/static mount.

## Explicit local-volume storage

The existing local provider can use an explicitly configured persistent public
root without changing provider or URL contracts:

```dotenv
ALAGEUM_MEDIA_PUBLIC_ROOT=/var/lib/alageum/public
ALAGEUM_MEDIA_QUARANTINE_DIR=/var/lib/alageum/private-quarantine
```

Strapi's `server.dirs.public` selects this directory for both provider writes and
its native `/uploads/` serving middleware. Uploaded bytes reside in
`ALAGEUM_MEDIA_PUBLIC_ROOT/uploads`; their URLs remain `/uploads/<hash>.<ext>`.
The default `./public` remains available for local development and tests. An
explicit root is required by the production configuration inspector.

Before starting with an explicit root, the operator must provision the mount and
create the root, its `uploads` child, and the separate private quarantine
folder. They must be owned by the application OS user, have no symlink path
components, and allow that user read/write/traversal. Public root/uploads may
not be group/world writable; private quarantine must be `0700`. The public root
must contain only `uploads/`, preventing accidental serving of source code,
configuration or backup folders. Existing upload entries must be flat regular
files, owned by the app, without symlinks, extra hard links or group/world write
permissions. Their bytes and legacy extensions are not changed. The mount and
application OS user must be trusted; do not allow unrelated writers into it.
The process creation mask must remove group/world write bits (`umask 022` or
stricter); inspection and provider writes reject an unsafe mask without changing
it. Ancestor directories must be owned by root or the app UID and not group/world
writable unless sticky protection is enabled (for example, a root-owned `/tmp`). Quarantine must not contain or be inside the
public root. Startup rejects missing/unsafe directories before provider
registration; it never creates a missing durable mount or falls back elsewhere.

The code does not migrate, delete or re-scan existing approved files. Keep the
current volume/path, or have an authorized operator copy all existing uploads
with their exact filenames before changing roots. Database media URLs and bytes
must refer to the same release/snapshot. Reviewed shipped catalog assets and
frontend static assets stay in their separate existing locations.

`inspectMediaStorage` is a read-only local directory/permission check. Its output
contains safe issue identifiers only and explicitly returns
`volume_persistence_verified: false` and `backup_restore_verified: false`.
A writable directory cannot prove that a persistent volume is mounted, survives
container replacement, or has a usable backup. Those remain operator evidence:

1. Identify the intended volume, mount target and retention/ownership settings.
2. In an authorized staging environment, persist a harmless uploaded image,
   restart/recreate the application using the same volume, and verify its URL,
   bytes and database association.
3. Stop writers or use a coordinated snapshot; back up PostgreSQL and the upload
   volume together. Keep private quarantine outside published/static storage.
4. Restore that paired snapshot into a separate authorized test environment;
   verify record counts, filename/content hashes and representative image URLs.
5. Record the evidence and recovery procedure before approving deployment.

No mount, infrastructure setting, real backup or production restore is changed
by this patch. Binary replacement remains intentionally unsupported (409); this
limitation is separate from whether new scanned uploads use persistent storage.

## Configuration

All settings are read by `config/media-security.js`. There is no allow-unsafe,
skip-scan, development bypass or fail-open switch.

| Variable | Meaning / default |
| --- | --- |
| `ALAGEUM_MEDIA_CLAMAV_SOCKET` | Absolute local Unix socket path; preferred when supported |
| `ALAGEUM_MEDIA_CLAMAV_HOST` | Alternative literal loopback or RFC1918 IPv4 address; no DNS names or public addresses |
| `ALAGEUM_MEDIA_CLAMAV_PORT` | TCP port, default `3310` |
| `ALAGEUM_MEDIA_SCAN_TIMEOUT_MS` | Whole-operation timeout, default `10000`; allowed `100`–`60000` ms |
| `ALAGEUM_MEDIA_PUBLIC_ROOT` | Optional explicit absolute public root, with a pre-existing `uploads/` child; required by production configuration inspection |
| `ALAGEUM_MEDIA_QUARANTINE_DIR` | Absolute app-owned private directory; default OS temp directory plus `alageum-media-quarantine` |

Configure socket **or** host, never both. Quarantine must be owned by the app user,
mode `0700`, without symlink path components, and outside the resolved public
root. Configuration is startup-scoped; restart the app after changing it.

Example for a same-host daemon (no credentials):

```dotenv
ALAGEUM_MEDIA_CLAMAV_HOST=127.0.0.1
ALAGEUM_MEDIA_CLAMAV_PORT=3310
ALAGEUM_MEDIA_SCAN_TIMEOUT_MS=10000
ALAGEUM_MEDIA_QUARANTINE_DIR=/var/lib/alageum/media-quarantine
```

The operator must provide and maintain a real ClamAV `clamd` and current signature
database through FreshClam. Set `StreamMaxLength` to at least the app's 1 MiB cap.
The daemon's TCP protocol is unauthenticated; bind it only to a private interface,
restrict access to the application, and never publish it to the internet.
Application configuration alone is not proof of engine health, signature
freshness, capacity or durable-storage readiness.

Official references: [ClamD protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html),
[daemon security](https://docs.clamav.net/manual/Usage/Scanning.html),
[signature updates](https://docs.clamav.net/manual/Usage/SignatureManagement.html).

With the intended scanner connection set, run:

```sh
node scripts/check-media-scanner.js
```

It sends only an embedded harmless PNG and the standard harmless EICAR test
string to that configured daemon. It requires clean acceptance and EICAR rejection
and performs no public writes. A failed check must block enabling uploads. Do not
configure production to use the deterministic test protocol fixture.

Errors visible to CMS users include `media_type_blocked`, `media_type_mismatch`,
`media_too_large` (413), `media_malware_detected` (400),
`media_scanner_unavailable` (503), `media_scan_timeout` (503) and
`media_replace_disabled` (409). Messages do not include daemon paths, internal addresses or antivirus signature details.

## Verification and remaining readiness

- `node --test tests/media-admission.test.js tests/media-temporary.test.js`
  covers a real local TCP INSTREAM protocol test double, harmless EICAR rejection,
  errors, timeout, missing daemon, file types, byte/pixel bounds, traversal,
  symlinks, all provider methods, replacement refusal and private-file cleanup.
- The parser tests use actual Koa/Formidable/Strapi body middleware over loopback
  HTTP, including malformed/oversized/aborted requests.
- `tests/media-storage.test.js` verifies configured path/permission admission and
  uses the real local provider plus native serving middleware across provider
  reinitialization. It proves path wiring, not host-volume durability.
- `tests/cms-upload.integration-support.js` runs through actual Strapi HTTP,
  CMS RBAC, pinned Sharp, local provider and PostgreSQL. It checks all four
  generated variants, existing-row/file snapshots, scanner refusals and cleanup.
- `.github/workflows/media-security.yml` installs official Ubuntu ClamAV packages,
  downloads current official signatures and runs the clean/EICAR diagnostic with
  a loopback-only daemon. Its actual-engine result must be verified after CI runs;
  adding the workflow is not evidence of a successful engine test.
- A protocol test double proves application behavior, not antivirus-engine
  effectiveness. A live-daemon clean/EICAR check is separate and still required
  for the chosen environment, plus fresh-signature monitoring.

The existing production startup guard remains. Real daemon provisioning,
monitoring, mounted-volume/backup evidence and cutover approval are external
release requirements. New public-PDF admission and atomic binary replacement
remain explicitly unsupported features; this code alone does not declare
production ready.
