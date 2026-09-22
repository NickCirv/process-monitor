# Source review — process-monitor

## Revision and method

Inspected public commit: [`ce7361d99ebe70631787c95712effd1aa83756a7`](https://github.com/NickCirv/process-monitor/commit/ce7361d99ebe70631787c95712effd1aa83756a7). Source tree: `3f264ad3fb35518ddc2b7c153651e11e1ac90d60`. Capture scope: all eligible text files; 5 of 5 eligible files.

This review read captured implementation and documentation. It did not install dependencies, execute project commands, call project APIs, check package publication or establish live CI status. Examples are source-derived, not captured execution transcripts.

## Claim ledger

| Claim | Evidence | Status |
| --- | --- | --- |
| Sampling, watch, CSV and signal paths | [index.js](https://github.com/NickCirv/process-monitor/blob/ce7361d99ebe70631787c95712effd1aa83756a7/index.js) | Verified in inspected source; execution unverified |

## Findings and verification gaps

This is not a passive-only interface: watch mode starts processes, log mode writes files and kill keys send signals. CPU/RSS readings have platform-specific semantics and are not a profiling trace. Process command lines and logs may contain local details. The captured tree lacks a LICENSE file despite MIT package metadata.

The captured smoke test only asks Node to syntax-check the entrypoint. It does not exercise behavior, integrations or failure paths. Neither that test nor installation was run in this review.

| Dimension | Result |
| --- | --- |
| Purpose and documented commands | Partially verified: static source inspection |
| Clean installation and examples | Unverified |
| Test suite and live CI | Unverified |
| Performance and security guarantees | Unverified |
| Publication | Local documentation only |

## Documentation inventory

- [README.md](https://github.com/NickCirv/process-monitor/blob/ce7361d99ebe70631787c95712effd1aa83756a7/README.md) — Rewritten; historic section anchors retained where practical.

## Captured source inventory

- [README.md](https://github.com/NickCirv/process-monitor/blob/ce7361d99ebe70631787c95712effd1aa83756a7/README.md) — Git blob `f221a35f86a65ffa3f13a144fef29f61c89c4eff`.
- [package.json](https://github.com/NickCirv/process-monitor/blob/ce7361d99ebe70631787c95712effd1aa83756a7/package.json) — Git blob `604a59540b905b6449dc13f04c2787aa1a7ce978`.
- [.github/workflows/ci.yml](https://github.com/NickCirv/process-monitor/blob/ce7361d99ebe70631787c95712effd1aa83756a7/.github/workflows/ci.yml) — Git blob `44515034a394670de44454a7a1bd2c7ef0c9836e`.
- [index.js](https://github.com/NickCirv/process-monitor/blob/ce7361d99ebe70631787c95712effd1aa83756a7/index.js) — Git blob `99e65c68a22e526088f6c16fe5d108902920f36e`.
- [test/smoke.test.js](https://github.com/NickCirv/process-monitor/blob/ce7361d99ebe70631787c95712effd1aa83756a7/test/smoke.test.js) — Git blob `ebbccaaf2583b4850575f835313e4b0afd21bff7`.

## Scope boundary

Capture excludes lockfiles, binary artwork, generated output, vendored dependencies and files above the acquisition size limit. The tree records their existence; no verification claim is made for omitted content. Protected documents and historical records are not replaced.

## Reference coverage

Added [command reference](REFERENCE.md) from the argument parser, command handlers and source-defined help at the pinned revision. README examples remain unexecuted.
