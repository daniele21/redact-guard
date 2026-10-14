# Adaptive Workspace — native macOS acceptance

Status: **pending representative Mac evidence**. Owner: RedactGuard Desktop UX/runtime. Candidate: [integration PR #17](https://github.com/daniele21/redact-guard/pull/17).

This document separates three kinds of proof. A green PR build is not a real-device UX pass.

## 1. Automated evidence (REMOTE_AUTOMATED)

- CI must pass all six checks on the **same PR HEAD/base**: backend, frontend, managed Korgis wheel contract, Rust/Tauri, browser UX, and macOS bundled API startup.
- Browser smoke uses synthetic PDF responses, verifies a two-page document, incremental analysis, retained review of unchanged pages, reanalysis, keyboard toggles, a compact 960×700 viewport, explicit attestation and the `*_protected.md` download. Review screenshots are **synthetic** and expire after seven days.
- macOS CI must start the **packaged API launcher** and import both the API and Korgis Python modules from their isolated paths. It does not execute real model inference or exercise the desktop WebView as a human.
- `unittest discover` runs tests for the packaged E2E evidence contract, including the prohibition on relying on Korgis's unauthenticated administrative API.

## Shared Mac validation (trusted source commits only)

The source-owned bounded lane is `.github/ci/local-test.sh`; `.github/workflows/local-ci.yml` dispatches an exact trusted `main` or `dev` commit to `daniele21/local-runner-infra`. This **does not** run this draft PR's head SHA because the central Mac executor rejects commits not reachable from a trusted source branch. It is not a substitute for the hosted PR Rust/frontend/backend/macOS bundle jobs or for native model inference and visual accessibility tests.

- The script runs macOS ARM64 preflight, Bash/Rust formatting, Node 22+ pure review and document queue regressions, backend unittest and managed Korgis packaging contract. It installs only lightweight backend test dependencies into a disposable local venv, with no global writes or model downloads. Missing tools fail the lane.

- **PR exact-head coverage without expanding trusted host exposure:** `Validate PR` now runs the **same versioned script** on an ephemeral, GitHub-hosted Apple Silicon Mac before the packaged-app build, with read-only permissions. This proves the script and its bounded tests against the PR SHA, but **does not** grant untrusted PR code access to `local-runner-infra` or qualify as a physical installed-app UX/inference test. The macOS packaging job remains responsible for verifying the bundled API.
- **Central lane after approved integration:** continue to dispatch only trusted `main/dev` commits and check `local-ci/mac` separately. The original source dispatcher successfully delivered trusted `main@9e2d13f` to [central run #38639722441](https://github.com/daniele21/local-runner-infra/actions/runs/38639722441), which reported `local-ci/mac=success` for 18 Python tests. That result **does not** cover this PR's expanded script.
- A successful source **dispatch** is not a test success. Inspect the originating commit's `local-ci/mac` status and the central `Central Local CI` run logs.
- The initial missing `CENTRAL_DISPATCH_TOKEN` credential was configured and the trusted `main` dispatch retested successfully on 2026-10-14. Do not place this token in code, PR workflows, CI artifacts or Terraform state.
- Preserve the central host's Terraform state on the original Mac, and do not create runner registrations in RedactGuard or weaken the central trusted-ancestry guard.
- The source `local-test.sh` becomes runnable centrally only after the candidate is independently reviewed and promoted through the repository's normal approved integration procedure to a trusted branch. Do not promote a blocked release candidate purely to obtain Mac runner access.

## 2. Packaged-model E2E on a representative Mac (REAL_ENVIRONMENT)

Requirements: Apple Silicon Mac, downloaded and approved Korgis model that is actually available to the local registry, packaged `RedactGuard.app`, Python 3.13 for the evidence runner, and exact source commit / Korgis pin.

Run from the checked-out matching repository, using **only synthetic input**:

```bash
python3 scripts/run-managed-package-e2e.py \
  --app "/path/to/RedactGuard.app" \
  --model "<Korgis registry startup key>" \
  --redactguard-source-commit "<exact 40-character RedactGuard SHA>" \
  --expected-korgis-commit "<40-character pinned Korgis SHA>" \
  --output-dir "./local-evidence"
```

The runner starts the packaged managed Korgis process and API on loopback, looks up the **public model ID** for the supplied startup registry key using Korgis' public identity endpoint, isolates the test's model preference from the user's personal configuration, analyzes its own generated synthetic PDF, checks model identity, CPU/RAM evidence provenance, and graceful cleanup. Its `managed-package-e2e-summary.json` is the canonical machine-readable evidence. **Do not upload raw logs**, model caches, documents, access tokens or personal paths. Review the bounded JSON before sharing. The runner intentionally does not use the optional unauthenticated Korgis admin API.

Accept only if: matching manifest/source commits, managed mode online with expected model, at least one inference request with compatible evidence, attributable resource source reported, no hard kill, and `status=PASS`. A PASS here still does not prove accessibility, real-user comprehension, detection recall, signed distribution or Mac thermal behavior.

## 3. Installed desktop UI acceptance (REAL_ENVIRONMENT)

Use a trust-appropriate signed/local test build rather than treating the ad-hoc CI signature as production notarization. Use **synthetic PDFs**, one with at least two pages and one independent second document.

| Journey | Observable acceptance | Evidence |
|---|---|---|
| Start/stop | Desktop window opens; managed Korgis readiness and offline/incompatible states distinguish correctly; closing terminates owned processes | Pass/fail, sanitized note |
| Home | Import and drag/drop; selected model/policy understandable with one clear primary action | Pass/fail, safe screenshot |
| Model Center | Select resident model; restart; same public model ID selected and correct registry startup key used; unsupported/unloaded model produces an actionable error without silent fallback | Pass/fail, sanitized model identifier |
| PII Library | Edit one variant; inspect inherited definition/history; restore; other profiles unchanged; already-open PDF policy unchanged | Pass/fail |
| Two-PDF review | Separate status per PDF; changing documents retains decisions; incomplete/failed document never appears ready | Pass/fail |
| Multipage review | Analyze pages incrementally; reviewing page 1 is not lost when page 2 is analyzed; reanalysis invalidates only affected page's stale decisions | Pass/fail |
| Source inspection | Full value visible **only in local document canvas**, masked in inspector; pressing Space/Enter toggles explicit keep/redact, never accidental disclosure | Pass/fail, synthetic-only |
| Export | Requires reviewed pages + explicit confirmation; exported file ends in `.md`, matches protected preview, reanalysis revokes prior backend attestation | Pass/fail, synthetic-only |
| Compact desktop | At least 960×700, document and findings remain usable; no covering sticky footer or horizontal overflow | Pass/fail, screenshot |
| Accessibility | Tab/Shift+Tab, VoiceOver button names and pressed states, focus after navigation, reduced motion, adequate text/contrast | Pass/fail, human notes |
| Lifecycle | Quit/restart after switching models, interrupted inference, backend offline; any lost in-memory session must be explained, never represented as protected | Pass/fail |

Do not check these boxes based on the browser fixture. A human must assess visual balance, progressive disclosure, legibility and the risk of accidental `keep` decisions with the installed app.

## Release/integration boundary

The integration candidate must not be promoted as stable/release-ready while an applicable blocking real-device gate remains unresolved. Separately, signing identity, notarization, real PII benchmark quality and PDF-layout-preserving export require their own release/product evidence. Existing Markdown export is a deliberate supported scope, not a claim of layout-preserving PDF output.

No cloud PII processing, analytics upload, new document retention, or external subprocessors are introduced by this acceptance protocol.
