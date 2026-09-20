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
