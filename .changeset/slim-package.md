---
"cliuno": patch
---

Ship only `dist/` in the npm package. Adds a `files` allowlist to package.json so the published tarball no longer includes the matrix harness, the `.claude/` skill workspace, `matrix-report.json`, or repo config — shrinking the package from ~250 kB to ~22 kB.
