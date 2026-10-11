---
name: ci-cd-architect
description: Enforces deterministic, secure, and performance-optimized CI/CD pipeline design, debugging, and maintenance across GitHub Actions and automated deployment workflows.
version: 1.0.0
author: Software Engineering & AI Systems Architecture
triggers:
  - ci-cd-pipeline
  - github-actions
  - build-optimization
  - release-automation
  - deployment-workflow
---

# CI/CD Architect Skill & Operational Rules

## 1. Scope & Execution Boundaries

This skill governs how AI agents analyze, write, refactor, and debug CI/CD pipelines. It treats workflow manifests as mission-critical infrastructure code, enforcing strict performance constraints, cryptographic security standards, and deterministic build states.

### When to Activate
- Authoring or modifying workflow files (e.g., `.github/workflows/*.yml`, GitLab CI, Bitbucket Pipelines).
- Diagnosing runner failures, timeout bottlenecks, or deployment crashes.
- Configuring automated release tags, asset uploads, or semantic versioning.
- Implementing build caching, secret management, or signing identity setups.

---

## 2. Core Non-Negotiable Directives

### I. Security & Secret Hygiene (Zero Exposure)
1. **Never Log Sensitive Outputs:** Never echo or pipe environment variables containing tokens, keystores, SSH keys, or passwords. Suppress trace logs that dump decrypted payload values.
2. **Strict Action Pinning:** Pin third-party actions to full commit SHAs or verified major versions (`@v4`), never unpinned mutable branches like `@master` or `@main`.
3. **Explicit Permissions Model:** Always declare a least-privilege top-level or job-level `permissions:` block. Never default to permissive organization tokens:
   ```yaml
   permissions:
     contents: read # Read repo code by default
   ```
   Elevate only specific jobs that require writing releases or updating deployments:
   ```yaml
   permissions:
     contents: write # Needed only for release asset publication
   ```
4. **Injection Prevention:** Never interpolate raw context expressions or unvalidated Git commit messages directly into shell execution scripts (`run:`). Store them in environment variables first:
   ```yaml
   # VIOLATION (Command Injection Risk):
   run: echo "Processing ${{ github.event.head_commit.message }}"

   # COMPLIANT:
   env:
     COMMIT_MSG: ${{ github.event.head_commit.message }}
   run: echo "Processing $COMMIT_MSG"
   ```

---

### II. Determinism & Clean-Room Hermeticism
1. **Zero Ephemeral Dependencies:** The workflow must execute cleanly on a fresh, pristine runner without assuming pre-existing caches, local developer environment variables, or ambient IDE files (e.g., gitignored type stubs).
2. **Strict Dependency Locking:** Always enforce clean installation from lockfiles:
   - Node / npm: `npm ci` (never bare `npm install` in CI).
   - Python: `uv pip sync` or `poetry install --frozen`.
   - Rust: `cargo check --locked` or `cargo test --locked`.
   - Go: `go test ./...` with verified `go.sum`.
3. **Pin Toolchains & Runtimes:** Pin exact language runtime versions (Node LTS, Python minor, Java JDK, Go minor) across all jobs to prevent silent upstream breaking changes:
   ```yaml
   - uses: actions/setup-node@v4
     with:
       node-version: 20.x
       cache: 'npm'
   ```
4. **Cross-Platform Shell & Path Safety:** 
   - Never assume Unix shell defaults on multi-platform runners. Specify `shell: bash` on Windows jobs if using bash syntax.
   - Enforce consistent line-ending handling (`core.autocrlf = input`) to prevent hash mismatches between Linux and Windows runners.

---

### III. Performance & Cost Optimization
1. **Concurrency & Redundant Run Cancellation:** Always configure concurrency cancellation to kill obsolete in-flight runs when a new commit is pushed to the same branch or PR:
   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true
   ```
2. **Path & Event Filtering:** Scope workflow triggers with `paths` or `paths-ignore` so documentation-only or unrelated subfolder changes do not trigger expensive heavy builds:
   ```yaml
   on:
     push:
       branches: [main]
       paths-ignore:
         - '**.md'
         - 'docs/**'
         - '.vscode/**'
   ```
3. **Native Cache Integration:** Utilize first-party action cache integrations (`actions/setup-node` `cache: 'npm'`, `actions/setup-python` `cache: 'pip'`, `actions/setup-go` `cache: true`) or granular `actions/cache@v4` with hashed lockfile keys.
4. **Mandatory Job Timeouts:** Always declare `timeout-minutes:` on every job (defaulting to 15–30 minutes) to eliminate runaway hanging jobs billing runner minutes indefinitely:
   ```yaml
   jobs:
     build:
       runs-on: ubuntu-latest
       timeout-minutes: 20
   ```

---

### IV. Atomic Release Engineering & Quality Gates
1. **Verification Triad Gate:** In release workflows, always require test, typecheck, and lint stages to pass before executing compilation or publishing assets:
   ```
   [Lint & Typecheck] ➔ [Automated Unit/Integration Tests] ➔ [Build Binary] ➔ [Sign & Publish]
   ```
2. **Single Canonical Release Workflow:** Never maintain duplicate workflows listening to the same tag triggers (`push.tags: ['v*']`). There must be exactly one canonical workflow creating releases, preventing race conditions and release collision errors.
3. **Cryptographic Checksums:** For all distributed binary artifacts (APKs, executables, tarballs), generate and publish SHA-256 checksums alongside release assets:
   ```bash
   sha256sum build/outputs/*.apk > checksums.sha256
   ```
4. **Atomic Git Tagging:** When tagging releases programmatically or manually, tag only after manifests (`package.json`, `Cargo.toml`, `app.json`) are committed. Never create empty commits.

---

### V. Defensive Failure Triage & Self-Healing
1. **Preserve Diagnostic Artifacts:** On build or test failure, upload test logs, crash dumps, or coverage reports using `if: failure()`:
   ```yaml
   - name: Upload Test Failure Logs
     if: failure()
     uses: actions/upload-artifact@v4
     with:
       name: test-failure-logs
       path: |
         logs/
         test-results/
       retention-days: 7
   ```
2. **Deterministic Error Localization:** When diagnosing a failed CI run:
   - Check the module resolution stage first (missing loaders, unrecognized extensions like `.ts` in Node ESM).
   - Check ambient types and missing imported asset declarations (`.css`, `.json`).
   - Check environment variable propagation between steps.
   - Cross-check runner architecture and OS differences (Linux vs macOS vs Windows).

---

## 3. Systematic 5-Phase Pipeline Engineering Workflow

```
[Phase 1: Topology & Trigger Audit]
                 │
[Phase 2: Security & Permissions Hardening]
                 │
[Phase 3: Caching, Concurrency & Performance Tuning]
                 │
[Phase 4: Hermetic Quality Gates & Build Verification]
                 │
[Phase 5: Release Distribution & Artifact Attestation]
```

### Phase 1: Topology & Trigger Audit
- Identify the purpose of every workflow: validation (PRs), continuous delivery (main), release publication (tags), or scheduled maintenance (cron).
- Eliminate overlapping triggers and duplicate workflow files.

### Phase 2: Security & Permissions Hardening
- Audit `permissions:` block at top level.
- Check for command injection risks in `run:` blocks.
- Ensure all secrets are injected via `env:`, never echoed.

### Phase 3: Caching, Concurrency & Performance Tuning
- Add `concurrency` with `cancel-in-progress: true`.
- Set `timeout-minutes` on all jobs.
- Configure dependency and compiler caching.

### Phase 4: Hermetic Quality Gates & Build Verification
- Enforce clean install commands (`npm ci`, `cargo check --locked`, etc.).
- Ensure test runner commands work across all target CI runtime versions (e.g. Node 20 LTS vs. Node 24).
- Verify typechecking and linting succeed with zero warnings or errors.

### Phase 5: Release Distribution & Artifact Attestation
- Compute SHA-256 hashes.
- Upload signed binaries to GitHub Releases / distribution targets.
- Ensure release notes accurately reflect changes.

---

## 4. Pre-Flight Checklist Before Merging Workflows

- [ ] Is there an explicit top-level or job-level `permissions:` declaration?
- [ ] Are all runner jobs bounded by `timeout-minutes:`?
- [ ] Is concurrency configured with `cancel-in-progress: true`?
- [ ] Are all secrets and dynamic inputs passed via `env:` variables rather than inline `${{ ... }}` interpolation?
- [ ] Are third-party actions pinned to `@v4` or immutable commit SHAs?
- [ ] Is dependency installation locked to lockfiles (`npm ci`, `cargo --locked`, etc.)?
- [ ] Are test/build artifacts preserved with `actions/upload-artifact` on failure?
- [ ] Is there only ONE workflow listening to release tag triggers?
