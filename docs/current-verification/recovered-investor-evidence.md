# Recovered original investor evidence

Recovered on 2026-10-27. These are original historical bytes, not fresh test results or current application acceptance. No approval pins or historical assertions were changed.

## Durable source and integrity

- Private Library archive: `Alageum-complete-local-candidate-2026-10-12.zip`
- Size: **50,953,491 bytes**
- Archive SHA256: `9828829dc68aada0f99d5ac3413bb4c2daabcbf09d81f78f9fa6d36b7876f7d6`
- Archive member: `Alageum-complete-local-candidate/alageum-complete-local-history.bundle`
- Bundle SHA256: `d60ad21f5546185b0d2d761007495b0bf6166567902a4fdb1b365406e3613a09`
- `git bundle verify`: PASS; complete history, 112 reachable commits; advertised HEAD `38ee4bb8706ef5bbce1cc5d9eab548912d2dbd2a`, tree `b7d9b74413b340f89b0a7c03be50c3f248ef263d`.

The private bundle/history were retained separately; neither the archive nor the entire original history is included in this repository publication.

## Exact restored files

Source commit: `aa41d7bb4f1078f0fa76271d6ea6e208b9cfad6e`.
Source tree: `46c9b63b700a9f5ea1ff3ce7b6ce88559b296c9a`.
Both restored paths are beneath `docs/investor-visual-2026-10-12/`.

| File | Bytes | Original Git blob | Expected and recovered SHA256 (equal) |
| --- | ---: | --- | --- |
| `browser-test-result.log` | 2,999 | `9c61f1abeecb8f324a50b22b69a466755e4f5250` | `d2ef759c1d42ad35dd649c275ec7fb47964c7d5d966896cdd457d8fbdb4cc4a1` |
| `unit-test-result.log` | 107,373 | `fed625c9db2ce9f863fb34a885b03324b99e9b3d` | `558cecf3b244945660a08ee51a55ad0d9710da86ca5c59d8cddc6cff93cea253` |

Expected hashes were read from the existing joint-site-integration evidence/fixed-file manifests before recovery. Files were extracted only after confirming exact equality. The transferred source archive and later checkpoint lacked these logs; the original Library Git bundle retained them. No logs were regenerated or substituted.

## Scope boundary

Restoring historical evidence does not establish that modified current source satisfies its old approval manifests. The archive README explicitly reports that its final unified suite was interrupted at the user's request after **406 observed passes and zero observed failures**; it does not claim completed aggregate acceptance. Any new replay must be reported separately with its own exact source, dependencies, runtime and result.

The bundle contains the exact joint candidate commit and all checked dependency file hashes, but the named authority baseline commit `340c74f63be9b72f35f7ebec689562e2bcdb5ae8` is absent. Content availability must not be presented as possession or validation of that missing commit object.
