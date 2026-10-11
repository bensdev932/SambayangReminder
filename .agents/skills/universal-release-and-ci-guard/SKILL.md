---
name: universal-release-and-ci-guard
description: Universal standard operating procedure and architectural guardrails for cross-language CI/CD pipeline parity, deterministic release engineering, SemVer synchronization, and client-side auto-update binary boundaries across any language, framework, or platform.
version: 1.0.0
author: Software Engineering & Agent Architecture
triggers:
  - ci-cd-pipeline
  - release-management
  - version-bump
  - auto-update-engineering
  - clean-room-parity
---

# Universal Release, CI Parity & Client Distribution Guard

This skill provides non-negotiable architectural guardrails for release engineering, CI/CD pipeline reliability, and client auto-update architectures across **any programming language, framework, or platform** (Node/TypeScript, Rust, Go, Python, C#/.NET, Kotlin/Android, Swift/iOS, C/C++, Flutter, Electron, React Native, etc.).

---

## 1. Principle I: Clean-Room CI Parity (Zero Ephemeral Assumptions)

> **The Clean-Room Law**: A codebase must compile, typecheck, lint, and pass test suites on a pristine, ephemeral machine containing **only** tracked Git repository files and declared toolchain packages.

### Common "Works on My Machine" Anti-Patterns Across Stacks

| Stack | Common Ephemeral Trap | Clean-Room Solution |
| :--- | :--- | :--- |
| **Node / TypeScript** | • Importing non-TS assets (`.css`, `.mp3`, `.svg`) relying on gitignored files (e.g. `expo-env.d.ts`, IDE stubs).<br/>• Running `node --test` on TypeScript ESM without `tsx` on Node 20 LTS runners. | • Commit explicit ambient declarations in `src/types/declarations.d.ts` (`declare module '*.css'`, etc.).<br/>• Explicitly include `"**/*.d.ts"` in `tsconfig.json`.<br/>• Use `tsx --test` for cross-version ESM TypeScript testing. |
| **Rust** | • Local `nightly` compiler features or locally installed Cargo plugins (`cargo-binstall`) missing in CI. | • Pin exact toolchain version in `rust-toolchain.toml`.<br/>• Commit `Cargo.lock` for all binary targets. |
| **Python** | • Depending on global `pip` packages or unpinned transitive wheels. | • Use hermetic lockfiles (`uv.lock`, `poetry.lock`).<br/>• Never invoke global python; always use virtual environment binaries. |
| **Go** | • Depending on local Go proxy cache or uncommitted `go.sum` entries. | • Enforce `go mod tidy` and verify `go.sum` is committed with zero untracked diff. |
| **C# / .NET** | • Implicit reliance on globally installed .NET SDKs or local developer NuGet fallback caches. | • Pin SDK in `global.json`.<br/>• Enable `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` in CI. |
| **Mobile (Android/iOS)** | • Uncommitted signing properties or assuming local Android Studio generated classes exist on clean runners. | • Use environment variables or Gradle project properties injected in CI; never hardcode local paths. |

### The Clean-Room Pre-Flight Test
Before pushing a release or declaring a CI pipeline complete:
1. Verify that no untracked files are required for the build:
   ```bash
   git status --short
   ```
2. Verify that typechecking and tests pass without ambient developer files:
   - Temporarily simulate a clean checkout (e.g. rename gitignored build cache files).
   - Ensure test runner commands work across all target CI runtime versions (e.g., Node 20 LTS vs. Node 24).

---

## 2. Principle II: The Atomic Release Lifecycle Protocol

> **The Atomic Release Law**: A release is an indivisible state transition. Version manifests, quality gates, Git commits, and Git tags must move together in a strict, deterministic sequence.

### Invariant 5-Step Release State Machine

```
[1. Manifest Sync] ➔ [2. Quality Gate] ➔ [3. Atomic Bump Commit] ➔ [4. Canonical Tag] ➔ [5. Push Tag]
```

#### Step 1: Manifest Synchronization Layer
Update all version-bearing project descriptors concurrently. Never leave one manifest updated while another lags behind:
- **Node / React Native / Electron**: `package.json` (`version`) AND `app.json` (`expo.version`) AND `package-lock.json`.
- **Rust**: `Cargo.toml` (`[package] version`).
- **Python**: `pyproject.toml` (`[project] version`) or `setup.cfg` or `__version__.py`.
- **Android**: `app/build.gradle` (`versionName`, `versionCode`).
- **iOS**: `Info.plist` (`CFBundleShortVersionString`, `CFBundleVersion`).
- **Go / C++**: `VERSION` file or `version.go` / `version.h` constants.

#### Step 2: Quality Verification Gate
Execute the full local verification triad before staging release files:
```bash
# 1. Unit & Integration Tests Pass
<test-runner-command>

# 2. Static Analysis & Typechecking Pass
<typecheck-command>

# 3. Linter & Formatting Pass
<lint-command>
```

#### Step 3: Atomic Bump Commit
Stage only the version manifests and commit with standard conventional format:
```bash
git add <manifest-files>
git commit -m "chore(release): bump version to vX.Y.Z"
```
*Never create empty commits (`git commit --allow-empty`); verify `git status` shows staged modifications before committing.*

#### Step 4 & 5: Canonical Tagging & Tag Push
Tag the exact bump commit using standard SemVer prefix `vX.Y.Z` and push:
```bash
git tag vX.Y.Z
git push origin <branch>
git push origin vX.Y.Z
```

#### The Single-Pipeline Invariant
Never maintain multiple CI workflows listening to the same tag triggers (`push.tags: ['v*']`). There must be **exactly one** canonical workflow responsible for building release binaries, computing SHA-256 checksums, and publishing release notes. Multiple workflows cause race conditions and release collision errors.

#### Failed Release Recovery Protocol
If a CI job fails after a tag was already pushed:
1. Fix the root cause in code.
2. Commit the fix on the release branch: `git commit -m "fix(ci): resolve build issue"`.
3. Re-point the tag locally: `git tag -f vX.Y.Z`.
4. Push the branch commit: `git push origin <branch>`.
5. Force-push the updated tag: `git push -f origin vX.Y.Z`.

---

## 3. Principle III: The Binary Horizon & Client Distribution Principle

> **The Binary Horizon Law**: Compiled client software (mobile APKs, desktop binaries, CLI tools, firmware) is frozen in time at its compilation timestamp. It cannot execute code, parse protocols, or query endpoints introduced in future releases until the user installs that future release.

### Core Rules for Client Auto-Updaters

#### 1. The Horizon Awareness Rule
Never expect an installed client running version `N` to exhibit behavior, features, or update UI introduced in version `N+1`.
- If an update engine was added in `v1.0.3`, devices running `v1.0.2` will **not** dynamically detect `v1.0.3` unless `v1.0.2` already had that update engine compiled into its binary.
- Transitioning to a new update mechanism always requires a one-time manual installation of the version containing the new engine.

#### 2. Aggressive Network Cache Invalidation
Remote release endpoints (e.g. GitHub Releases API `api.github.com/.../releases/latest`) send HTTP cache headers (`cache-control: public, max-age=60`). Mobile HTTP stacks (Android OkHttp, iOS URLSession) and intermediate proxies frequently cache these responses.
- **Mandate**: All client update checks must enforce cache-busting:
  ```ts
  // 1. Query parameter timestamp
  const url = `${releaseApiEndpoint}?_t=${Date.now()}`;

  // 2. Explicit HTTP Cache-Control headers
  const headers = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  };
  ```

#### 3. Multi-Modal Update Discovery
Do not rely exclusively on a one-time background check at app startup. An application may remain open in background memory for weeks without re-triggering startup hooks.
- **Provide 3 Discovery Channels**:
  1. **Startup Check**: Silent background check when app launches.
  2. **Gesture Refresh**: Re-query the update engine during pull-to-refresh or swipe-down actions.
  3. **Screen / Modal Navigation**: Perform a fresh query when the user opens the "Check for Updates" or "About" modal.

#### 4. Explicit UI State Transparency
Always clearly communicate the four distinct update states to the user:
- **`UP_TO_DATE`**: "You are on the latest version (vX.Y.Z)."
- **`UPDATE_AVAILABLE`**: "New version vX.Y.Z is available! Download & Install."
- **`RATE_LIMITED`**: "API check rate limit reached. Rechecking in X minutes."
- **`DEVELOPMENT_ENVIRONMENT`**: "Running in development mode (Expo Go / Debug build). Native installer disabled."

---

## 4. Agent Autonomous Pre-Release Checklist

Before declaring any release engineering task complete, verify this checklist:

- [ ] Are all version manifests across the project synchronized to the exact same version string?
- [ ] Do tests and typechecks pass in a clean-state simulation without relying on gitignored files?
- [ ] Are all imported non-code assets covered by explicit type declarations and verified to exist on disk?
- [ ] Is there exactly one CI release workflow listening to release tag events?
- [ ] Has the release commit been created and verified before the tag was created?
- [ ] Does the remote release check query utilize cache-busting parameters (`?_t=timestamp`)?
- [ ] Is pull-to-refresh / manual rechecking wired into the update discovery engine?
