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

Both checked-in workflows validate locally, but GitHub rejects runs before creating jobs (`startup_failure` / `BuildFailed`). Preserve the private repository and hosted-runner configuration, record exact evidence, and require owner/GitHub resolution. Do not switch repository visibility, buy credits, install self-hosted runners or label Windows validation successful to work around the blocker.

## 2026-09-20: Preserve the owner-selected constrained VPS baseline

Future deployment targets InterServer 1 Slice in New Jersey / US East (`jarvis-core-01`, `us-east-nj`): Ubuntu 24.04 LTS, 1 vCPU, 2,048 MB RAM, 40 GB SSD and 2,000 GB monthly transfer. The setup guide records required swap, memory budgets, bounded queues, low-memory PostgreSQL, log rotation, off-box backups, resource monitoring and provisional upgrade triggers. The design must scale to 4 GB+ without redesign. This is planning documentation only; no server is provisioned and Prompt #2/#11 implementation remains out of scope.

## 2026-09-20: Isolate CI startup without changing the foundation

A temporary workflow containing only a single Ubuntu echo step reproduced the same zero-job startup failure as the intended validation workflow. This rules out JARVIS dependencies, build steps and platform matrix as the immediate trigger. Retain the validated production workflows and private repository, remove the diagnostic branch, and record hosted acceptance as blocked until GitHub/account-side startup is resolved. Billing is unknown because the current authorization lacks account-read scope; do not infer payment failure or change spending. See CI_DIAGNOSTICS for exact evidence.
