# Contributing

Read `docs/IMPLEMENTATION_STATUS.md`, the relevant architecture/security section and applicable decisions before changing code. Keep Phase 2+ features separate from the foundation.

After bootstrap, create a focused branch, make conventional commits and open a PR against `main`. Explain the concrete behavior change, meaningful tests and security/compatibility impact. Review migrations and protocol/policy changes explicitly. Never commit environment files, generated credentials or private keys.

Run `pnpm check`, relevant integration tests and native checks before pushing. Required review evidence includes the relevant Linux, macOS and Windows validation results; do not silently call an unavailable runner green. Documentation-only changes skip expensive validation. Branch protection should be enabled when a working CI baseline and owner review workflow exist; this repository does not claim protections have been configured.

Dependency updates must refresh and review the lockfiles, build-script allowlist and CI results. Avoid broad release-age exclusions. No mock data belongs in first-run product state; test fixtures stay in isolated tests.
