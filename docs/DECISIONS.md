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

Historical checkpoint: the Mac deferral and Windows-as-blocker wording below are superseded by the owner-authorized 2026-09-21 acceptance decision.

Incorporate the sanitized `jarvis setup info.txt` requirements in OWNER_CONFIGURATION. Preserve America/New_York, `bm_george`, weekday noon, Saturday 07:00 and the remaining weekend window, plus five call retries with counting semantics still to clarify. Missing retry interval and undefined “BOTH” fallback remain future phone-phase questions. Preserve the existing InterServer decision where source fields are blank. No schedules, voice models, provider integrations, purchases or fake readiness records are created.

Keep supplied provider secrets in existing private local configuration only; track blank variable names and distinguish presence from verified access. A phone value that fails E.164 validation is not imported or guessed. Kokoro output remains a separate future adapter from OpenAI Realtime conversation. The disconnected UI must describe unknown devices/security as requiring sign-in, rather than asserting that no owner/devices exist.

[Phase 2 Validate](https://github.com/Taxcut/JARVIS/actions/runs/35530976129) succeeded on `16dfe950315d1d63aa7e30cb7dae78dbaa886c8c` for Linux TypeScript/database and both macOS/Windows native jobs. Preserve this evidence and rerun hosted validation for the UI correction. Owner-deferred Keychain/restart/sign-in/recovery/native GUI checks and Windows physical testing prevent a complete Phase 2 acceptance claim. Keep the PR draft and unmerged; do not start Prompt #3. Node 20 action warnings remain future maintenance.

The continuation's [fresh hosted run](https://github.com/Taxcut/JARVIS/actions/runs/35545676708) subsequently passed all three jobs on `c61e99e1855f31c0161c06832a04bac73b083f37`. Targeted local desktop tests/typecheck/lint/build and the built first-run browser review also passed. Record the evidence in a documentation-only handoff commit with duplicate CI skipped; no source, dependency or workflow changes follow the tested checkpoint. This closes the configuration reconciliation and feasible automated work, not the deferred physical acceptance.

## 2026-09-21: Complete real Mac acceptance; defer Gaming PC physical testing

The owner resumed Mac validation and explicitly made Windows Hello/Credential Manager physical testing a later, non-blocking Gaming PC task. The real Mac retained its Keychain identity and resumed its signed session after native restart. Purpose-bound passkey step-up revoked the prior session; protected realtime access stopped and a new real browser sign-in restored it. Owner recovery codes were generated, then replaced after the owner reported not saving the first set. The owner saved and hid the replacement set; old rows were removed, hashes only persisted and CRITICAL audit evidence remained. No raw recovery material was inspected. Recovery setup satisfies this request; destructive code-consumption recovery remains automated evidence, not a claimed physical test.

Authenticated Owner/Security/Devices/Approvals and real Core disconnect/reconnect were checked. Windows physical acceptance remains intentionally deferred, not failed; hosted Windows CI is separately required. Prepare PR #1 for review once fresh CI passes. Do not merge automatically or start Prompt #3.

## 2026-09-21: Release realtime resources before closing the owned pool

Physical shutdown exposed a deadlock between reverse-ordered onClose hooks: main ended the PostgreSQL pool before realtime could return its LISTEN connection. Realtime now closes peers/timers/listener in preClose, and a connection acquired after shutdown begins is immediately returned. A real PostgreSQL/live-WebSocket regression uses production's pool-ownership order, failed before the fix and passes after it. A second physical Core restart confirmed clean exit and native automatic reconnection. Authentication, durable replay, grants and native Keychain behavior are unchanged. Fresh hosted validation is required for this focused code fix.

Closure evidence: [Validate](https://github.com/Taxcut/JARVIS/actions/runs/35567260762) passed Linux TypeScript/database and both macOS/Windows native jobs on `1d2857eef87a12e56e97b9e4168807115de50231`. Together with the real Mac acceptance above and passing local gates, this completes the owner's current Phase 2 macOS acceptance scope. Windows physical testing stays intentionally deferred. Record this in a documentation-only commit with duplicate CI skipped, mark PR #1 ready for owner review, and leave it unmerged. No Prompt #3 work begins.

## 2026-09-21: Phase 3 user-session runtime

Implement an independent Rust helper plus bounded crash supervisor, with OS file locks and typed local IPC. Use SMAppService bundled Aqua LaunchAgent on macOS 13+, and a quoted fixed per-user Run entry on Windows. Registration is explicit; no root/admin daemon. The dashboard never owns the runtime lifetime.

Reuse the existing device key but isolate runtime refresh rotation in a separate OS credential entry. Owner-authenticated native setup provisions an existing-system session marked `runtime`; Core restricts it to snapshot/sync/refresh/presence. React cannot receive this session or invoke its provisioning route through the generic native bridge. Missing/revoked identity fails closed.

Runtime presence is a leased current row per device, separate from trust/enrollment. Only lifecycle transitions append audit evidence; heartbeat sync uses the existing bounded retention stream. Protocol mismatch is explicit and execution stays false. Physical Mac acceptance and fresh three-platform CI must precede a completion claim; Gaming PC physical acceptance is intentionally deferred.

## 2026-09-26: Runtime physical validation and IPC review

The runtime persisted through the usage-limit pause and real OS sleep/session transitions. Restore Core rather than reset credentials; automatic bounded reconnect resumed the existing runtime session and trusted device. Dashboard quit/reopen and a duplicate supervisor launch preserved a single worker. SMAppService startup/disable and supervised crash recovery were physically exercised from the installed user app.

A valid bundled SMAppService returned NotFound before first registration; treating that as unavailable disabled the setup action incorrectly. Report NOT_CONFIGURED for this state while retaining UNAVAILABLE for missing bundle resources. Registration then succeeded through the supported API. No legacy startup fallback was needed. Preserve sanitized OS error domain/code for actionable registration failures.

Security review adds Windows named-pipe server SID verification before credential transfer, alongside the owner DACL/remote-client rejection, and macOS fixed-helper ancestor path checks. Same-OS-user compromise remains outside the threat boundary; no app-enclave claim is made. Keep manual packaging aware of the new sidecar prerequisite. Fresh hosted CI must validate these refinements before marking PR #2 ready; no merge or Prompt #4 is authorized.

During final review, strengthen the report CHECK with an explicit key-existence/JSON-boolean condition: PostgreSQL CHECK otherwise accepts a NULL result for a missing key. Use a new numbered migration, preserving the migration already applied to the real owner database. Native builds consistently target macOS 13 to match SMAppService availability.

## 2026-09-26: Close Prompt #3 for the current Mac scope

[Final Validate](https://github.com/Taxcut/JARVIS/actions/runs/36268611479) passed Linux TypeScript/PostgreSQL and macOS/Windows native checks, tests and builds on `7d739d5e70b35dcf7092560f6f56704033999c03`. The preceding Windows Clippy failure was fixed by placing its test module after production items; no behavior changed. Local quality gates and real Mac lifecycle/startup acceptance also passed. Record closure in documentation only, skip duplicate CI, mark PR #2 ready and leave it unmerged for the owner. No Prompt #4 functionality or execution authority is introduced.

The final installed app uses a fresh complete bundle replacement: the earlier in-place update was rejected by macOS launch constraints despite passing on-disk signature verification. Unregister, quit, replace the stopped bundle and register again restored authenticated startup through SMAppService; no OS security or secure-storage bypass was used. The runtime remains ONLINE with startup ENABLED and the same trusted device. Dashboard quit/reopen again preserved its instance. Keep this distinction in setup/security guidance rather than claiming signature verification alone proves launchability.

Windows physical acceptance remains intentionally deferred, with a Gaming PC checklist. Full Mac reboot/login was not forced; actual supported startup registration/launch/unregister/re-registration and naturally occurring sleep/wake were verified. Core/PostgreSQL supervision, production signing/notarization and delivery remain later work. Node 20 action deprecation warnings are non-blocking future maintenance. The owner has no remaining interactive action for this Mac closure; PR review/merge is a separate decision.

## Phase 4 implementation checkpoint — 2026-09-29

Prompt #4 is authorized on `feat/phase4-voice-cinematic`. The native runtime owns
CPAL capture/playback, sherpa-onnx wake detection, echo processing and local
Kokoro `bm_george` synthesis. Fresh installs keep voice disabled. Core brokers
short-lived Realtime credentials only to signed, currently trusted runtime
sessions in NORMAL security state; durable provider keys stay in backend setup.
Provider responses are text, with no tools or execution interface. The native
runtime sends conversation audio only after recognized wake activation.

Runtime protocol 2 adds truthful voice/capture capability reporting and rejects
old runtime registrations with update-required. Computer execution and all other
future control capabilities remain unavailable. No new application data is seeded.

The pinned Kokoro archive README documents 54 speakers (Spanish `em_santa` added
at index 53); existing indices are unchanged, including George at 26. British
pronunciation uses the supplied GB lexicon, avoiding a language override that
failed in the packaged eSpeak build. The single terminal keyword `Jarvis`
accepts both requested wake phrases; overlapping prefix/suffix rules caused
missed synthetic detections and were removed. Stop-listening has a separate
local keyword stream. See PHASE4_WORKLOG for acceptance still outstanding.
