# Disposable production-stack proof

`.github/workflows/self-hosted-server.yml` builds the real production Dockerfiles
and launches the unchanged `deploy/compose.production.yml` on a fresh
GitHub-hosted Ubuntu runner. No server, repository secret or deployment token is
used. The runner script refuses non-hosted environments.

A separate `production-backend-runtime` job runs the backend's disposable
PostgreSQL 16/17 production integration runner, including explicit first-operator
bootstrap. It is independent of the full Compose acceptance below.
That job also runs the native CMS news lifecycle/public-delivery suite in its own
disposable PostgreSQL cluster; neither runner consumes a server database URL.

The gate exercises:

- Short-lived CA-signed HTTPS, PostgreSQL TLS and authenticated SMTP STARTTLS;
  certificate validation stays on. Wrong hostname/untrusted CA and plaintext
  database connections are rejected.
- Next `/healthz`, Strapi `/api/v1/readiness`, native `/cms` assets and `/admin`
  APIs, separate Next `/admin/catalog`, and HTTP-to-HTTPS redirect.
- Synthetic registration, locally captured verification/reset mail, same-origin
  session cookies, cross-origin refusal, browser-session boundaries, real
  Chromium login and HttpOnly/Secure/host-only cookie acceptance.
- The pinned official ClamAV engine and official FreshClam signatures: clean PNG
  passes, the harmless [official EICAR fixture](https://www.eicar.org/download-anti-malware-testfile/)
  is rejected by the actual application scanner adapter. EICAR is only streamed
  to clamd and is never executed or written to public media.
- PostgreSQL and application container recreation with persistent account,
  session, public upload and private quarantine bytes.
- The actual maintenance-window paired backup script and empty-target restore
  script, including restored sessions and byte-identical public/private media.

For the persistence rehearsal, the clean scanner-accepted PNG is written directly
to the real mounted upload directory by the app UID. This proves scanner adapter,
mounted storage, serving and recovery behavior. It does not claim to exercise an
authenticated native upload transaction or media RBAC; those remain covered by
the separate media integration suite.

The SMTP sink reuses the backend integration-test helper, binds only loopback in
the backend container's network namespace, and accepts only `.test` mail. It has
no relay implementation. No additional production service or insecure runtime
flag is introduced. Chromium trusts the generated CA in an isolated NSS profile;
TLS-error bypass options are not used.

The initial stack is stopped before the restore project starts, retaining the
production fixed subnets. Restore uses separate, initially empty DB/media paths.
Downloaded scanner signatures are copied to the second private signature store
to avoid making a redundant FreshClam download. Official signature download or
scanner health failures fail the gate; there is no mock fallback.

Only safe result JSON, image inventory, ClamAV version and container state are
uploaded. Private keys, environment files, inbox messages, account tokens,
cookies, database dumps, media archives and raw service logs are not artifacts.
An exit trap removes the job's containers, networks and private fixture tree.

Run the local non-Docker contracts with:

```sh
bash -n deploy/ci/run-proof.sh
node --test deploy/ci/proof-contract.test.mjs
```

These local checks are not Compose acceptance. A successful hosted workflow on
the exact source commit is required. A hosted pass is still staging evidence;
the real server needs its own DNS/certificates, SMTP-provider approval, firewall
review, encrypted off-host recovery rehearsal and explicit cutover approval.
