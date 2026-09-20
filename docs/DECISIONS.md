# Decisions

| Date       | Decision                                                           | Rationale / alternatives                                                                                             |
| ---------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 2026-09-19 | pnpm workspace and Node 24                                         | Shared typed contracts without duplicated platform code; no distributed services                                     |
| 2026-09-19 | Tauri 2 + React/Vite, Rust workspace                               | Native desktop shell with small explicit authority surface; no Electron                                              |
| 2026-09-19 | Fastify modular monolith                                           | Clear boundaries without orchestration overhead                                                                      |
| 2026-09-19 | PostgreSQL + Drizzle + explicit SQL                                | Relational constraints, migrations and future pgvector; no MongoDB or separate vector store                          |
| 2026-09-19 | Loopback + random bootstrap token                                  | A real local security boundary while passkeys/device auth remain future work; not a deployment authentication system |
| 2026-09-19 | Default ASK, fail-closed DENY                                      | Sensitive capabilities cannot silently inherit execution authority                                                   |
| 2026-09-19 | Atomic setup/audit, database mutation triggers                     | Real durable progress without fake seeded events; not tamper-proof against a DBA                                     |
| 2026-09-19 | Only runtime native contract created                               | Audio/device/capture crates without implementation would add empty-folder overhead                                   |
| 2026-09-19 | Core verification is the only active setup step                    | Owner identity, enrollment, voice and phone setup must never imply completion                                        |
| 2026-09-19 | One Linux quality/database job plus cached Mac/Windows native jobs | Portable validation with heavier release compilation only on manual request                                          |
| 2026-09-19 | Source exports within private workspace                            | Single contract source and direct build-tool resolution; packages are not separately published                       |

Changes to authorization, persistence or protocol compatibility require a new dated decision and updated tests/security documentation. Future implementation must preserve the separate background runtime, private device keys, AURA API boundary and clean first-run state.

## 2026-09-19: Hosted CI failure is not a successful acceptance result

Historical decision: the startup blocker was subsequently resolved on 2026-09-20; see the closure decision below.

Both checked-in workflows validate locally, but GitHub rejects runs before creating jobs (`startup_failure` / `BuildFailed`). Preserve the private repository and hosted-runner configuration, record exact evidence, and require owner/GitHub resolution. Do not switch repository visibility, buy credits, install self-hosted runners or label Windows validation successful to work around the blocker.

## 2026-09-20: Preserve the owner-selected constrained VPS baseline

Future deployment targets InterServer 1 Slice in New Jersey / US East (`jarvis-core-01`, `us-east-nj`): Ubuntu 24.04 LTS, 1 vCPU, 2,048 MB RAM, 40 GB SSD and 2,000 GB monthly transfer. The setup guide records required swap, memory budgets, bounded queues, low-memory PostgreSQL, log rotation, off-box backups, resource monitoring and provisional upgrade triggers. The design must scale to 4 GB+ without redesign. This is planning documentation only; no server is provisioned and Prompt #2/#11 implementation remains out of scope.

## 2026-09-20: Isolate CI startup without changing the foundation

Historical investigation: its blocked status is superseded by the closure decision below.

A temporary workflow containing only a single Ubuntu echo step reproduced the same zero-job startup failure as the intended validation workflow. This rules out JARVIS dependencies, build steps and platform matrix as the immediate trigger. Retain the validated production workflows and private repository, remove the diagnostic branch, and record hosted acceptance as blocked until GitHub/account-side startup is resolved. Billing is unknown because the current authorization lacks account-read scope; do not infer payment failure or change spending. See CI_DIAGNOSTICS for exact evidence.

## 2026-09-20: Close Prompt #1 after successful hosted validation

[Validate #5](https://github.com/Taxcut/JARVIS/actions/runs/35492241746) passed on `8194079f314014a21df9b8db17e7af805f0f3eda`: `typescript` on Linux, `native (macos-latest)` and `native (windows-latest)` all succeeded. Together with the recorded local acceptance evidence, this satisfies Phase 1 / Prompt #1. Close the phase with documentation-only changes; do not repeat passing implementation work or begin Prompt #2.

The owner reports resolving account-side Actions eligibility/billing by correcting the Actions budget/payment setup. Preserve the earlier zero-job diagnostics as history, clearly marked resolved. The successful run independently verifies restored hosted execution; the exact internal GitHub cause remains unexposed and is not inferred beyond that evidence.

Record the current Node 20 deprecation notices for checkout/setup-node/pnpm setup actions as non-blocking future maintenance. Do not change dependencies or workflow versions during this closure. The InterServer constrained-VPS plan remains documentation only; nothing is deployed.

## 2026-09-20: Phase 2 identity and synchronization

Use standards-based SimpleWebAuthn ceremonies in the system browser on macOS and Windows. Native Rust owns Ed25519 device keys and refresh credentials in OS secure storage. Browser completion and desktop redemption use separate short-lived one-use secrets; only the native device can redeem session material. Exact RP/origin validation and required user verification remain enabled. PostgreSQL provides durable challenges, nonces, purpose-bound grants and transactional ordered sync events. Physical Touch ID and Windows Hello validation will be recorded separately from automated tests. No execution capability is introduced.

- Keep the existing `users` anchor as the canonical singleton owner; enforce uniqueness in SQL rather than introduce tenants or generic RBAC.
- Use SimpleWebAuthn 14 with required UV/resident credentials and a system-browser adapter. Native WebView WebAuthn is not a dependency. Official server/browser documentation was checked before implementation.
- Use Ed25519 via maintained native/library implementations and keyring 4 platform stores, with a public cross-language fixture. No fallback files or raw signing IPC.
- Serialize personal-owner security transactions with a PostgreSQL advisory lock, parameterized SQL and transactional audit/outbox. The same database supplies durable rate buckets and replay prevention; avoid Redis/Kafka.
- Realtime batches carry safe authoritative snapshots plus ordered events. This bounds client complexity and prevents independent client state from drifting. Retention gaps force resync; sequence strings preserve bigint precision.
- Recovery requires both a one-use high-entropy code and an already-trusted device key, followed by new-passkey registration. Loss of every trusted device remains an explicit offline-recovery limitation. Recovery replaces prior passkeys/session authority.
- Preserve historical Phase 1 CI evidence and non-blocking Node-action warnings. Phase 2 requires fresh hosted Linux/macOS/Windows evidence; physical biometric validation is separately identified.
- Correct the future wake-word architecture to sherpa-onnx; do not implement voice or Prompt #3.

## 2026-09-20: Reconcile the owner configuration without activating future systems

Incorporate the sanitized `jarvis setup info.txt` requirements in OWNER_CONFIGURATION. Preserve America/New_York, `bm_george`, weekday noon, Saturday 07:00 and the remaining weekend window, plus five call retries with counting semantics still to clarify. Missing retry interval and undefined “BOTH” fallback remain future phone-phase questions. Preserve the existing InterServer decision where source fields are blank. No schedules, voice models, provider integrations, purchases or fake readiness records are created.

Keep supplied provider secrets in existing private local configuration only; track blank variable names and distinguish presence from verified access. A phone value that fails E.164 validation is not imported or guessed. Kokoro output remains a separate future adapter from OpenAI Realtime conversation. The disconnected UI must describe unknown devices/security as requiring sign-in, rather than asserting that no owner/devices exist.

[Phase 2 Validate](https://github.com/Taxcut/JARVIS/actions/runs/35530976129) succeeded on `16dfe950315d1d63aa7e30cb7dae78dbaa886c8c` for Linux TypeScript/database and both macOS/Windows native jobs. Preserve this evidence and rerun hosted validation for the UI correction. Owner-deferred Keychain/restart/sign-in/recovery/native GUI checks and Windows physical testing prevent a complete Phase 2 acceptance claim. Keep the PR draft and unmerged; do not start Prompt #3. Node 20 action warnings remain future maintenance.

The continuation's [fresh hosted run](https://github.com/Taxcut/JARVIS/actions/runs/35545676708) subsequently passed all three jobs on `c61e99e1855f31c0161c06832a04bac73b083f37`. Targeted local desktop tests/typecheck/lint/build and the built first-run browser review also passed. Record the evidence in a documentation-only handoff commit with duplicate CI skipped; no source, dependency or workflow changes follow the tested checkpoint. This closes the configuration reconciliation and feasible automated work, not the deferred physical acceptance.
