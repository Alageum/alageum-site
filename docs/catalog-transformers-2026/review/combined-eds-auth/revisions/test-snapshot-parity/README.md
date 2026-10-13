# Bounded proof-test performance revision

All original PR45, combined EDS/auth and browser-locator approval artifacts remain
byte-for-byte unchanged. The 48-file corrected application scope and its source
identity are unchanged. Only proof-test organization and exact evidence bindings
change in this revision. No coordinator or evaluation/caching behavior changes.

Read-only profiling of the prior candidate found all eleven default-reader gates
complete in approximately 1.74 seconds total, with 675 paths captured and reread
per invocation. Completed Map-backed explicit-reader measurements for all eleven
gates sum to 221.442 seconds, 6,291,466 reads, 283.897 GiB and 5,644 leaf
evaluations. These were separate probe runs: an initial source probe hit a
90-second diagnostic budget, then a source-only retry completed in 128.271 seconds.
The sum is not an observed uninterrupted whole-run time. This is finite inherited uncached fan-out.
The original tests unnecessarily repeated successful uncached matrices.

Real-checkout acceptance now genuinely omits the reader argument. Two synthetic
cases are consolidated into one: each gate succeeds on its exact explicit reader,
then every original pending/missing/forged-authority refusal runs immediately on
that same warmed reader. All predecessor refusals and the assertion that real
checkout authority remains untouched are retained. Ten top-level test cases
become nine through consolidation; no unique assertion category is removed.
No temporary fixture helper, hidden skip, weakened scope or runtime cache is added.

Historical parity/reference checks, exhaustive explicit-reader mutations,
wrong-predecessor rejection, all-route default final rereads, stale-reader
isolation, superseded authority rejection and forged-owner checks remain active.
The complete revised test file passed 9/9 against pending revision evidence in
282.698 seconds wall time, including 221.381 seconds for the retained explicit
success/refusal matrix. The first case tested pending rejection; actual approved
omitted-reader acceptance still requires verification after independent approval.

The 678-path current closure adds the previous browser-locator authority pair and
this revision's README, candidate evidence and fixed map. Every previous authority
remains exactly bound. Pending or absent new approval fails closed. Independent
review must verify assertion equivalence and approve the exact new file map.
All previous sequential-observation limitations and no-release/no-security-waiver,
unavailable EDS, unverified live Google and unavailable eGov boundaries remain.
