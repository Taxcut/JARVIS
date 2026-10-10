# Gaming PC development target

Bootstrap dates: 2026-09-26–29. This machine extends the primary Mac workflow; it is not a new JARVIS development stream. Prompt #4 has not started.

## Acceptance status

**Required bootstrap build and remote checks passed September 28.** The local TypeScript checks, database integration tests, runtime/identity Rust checks and physical runtime smoke test pass. Full Rust workspace checks, the native workspace build and the Tauri Windows development build passed on September 28 without changing Windows security settings; Smart App Control remained enabled. The September 27 block no longer reproduced, but the reason it stopped reproducing was not diagnosed. The private SSH service is running. The owner confirmed successful Mac key authentication on September 27, and an established connection from the expected Mac address was observed. The remote environment helper subsequently passed: GitHub fetch succeeded, HEAD matched the Phase 3 checkpoint, Git/Node/pnpm/cargo/rustc ran, and the account reported non-elevated PowerShell 7.6.6. On September 28, a fresh non-interactive Mac SSH session passed direct esbuild setup, all of pnpm check (including 31 tests and frontend/Core builds), and all 14 runtime/identity Rust tests. The native-store test was intentionally ignored in that suite. Git status was clean and the session printed JARVIS_REMOTE_CHECKS_OK.

Do not disable Smart App Control, Defender, the firewall or UAC to turn this result green. If the earlier build-helper block recurs, investigate supported signing/trust options compatible with the owner's security requirements. Microsoft documents that Smart App Control does not offer individual application exceptions: <https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions>.

## Machine and toolchain

- Host: `DEEZY`; Windows 11 Home 25H2, x64, build 26200.9457.
- CPU: AMD Ryzen 7 8700F, 8 cores / 16 logical processors. Initial free disk space: approximately 756 GB.
- Local physical-validation checkout: `C:\Users\lanke\Developer\JARVIS`.
- Source: private GitHub repository `Taxcut/JARVIS`; authoritative `main` checkpoint `302031ff49af2d5947103ed87d5b440a3697029b`, including merged Phase 3.
- Git 2.53.0.windows.2; GitHub CLI 2.101.0, authenticated as the owner using Windows keyring storage.
- Node 24.21.0; repository-selected pnpm 12.4.2.
- Rust/cargo 1.98.1, stable `x86_64-pc-windows-msvc`, rustfmt and clippy installed.
- Visual Studio Build Tools 2026 18.6.1; MSVC 14.51.36231; Windows SDK 10.0.26100.0. Existing Visual Studio Community is also installed.
- WebView2 runtime 153.0.4234.48.
- PowerShell 7.6.6 installed system-wide. The bootstrap agent initially used its bundled PowerShell 7.6.5.
- Docker Desktop 4.90.0 / Docker CLI 29.7.2, with a working Linux-container engine.

Node 24.16.0/OpenSSL 3.5.6 failed the existing identity-point Ed25519 forgery rejection test. The official Node 24.21.0 release passed it and the entire TypeScript suite without any application-code change. Its installer checksum and OpenJS Authenticode signature were checked before installation.

Set `git config --local core.autocrlf false` in each Windows checkout before installing/checking the project. The repository stores LF text; automatic CRLF checkout conversion caused formatting failures. Normalizing this fresh checkout back to its committed LF bytes left no source diff.

## Existing validation commands

Run from the repository root in PowerShell:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm test:integration
pnpm rust:check
cargo build --workspace --locked
pnpm --filter @jarvis/desktop tauri build --debug --no-bundle
pnpm --filter @jarvis/desktop tauri build --no-bundle
```

`pnpm runtime:prepare` stages the target-specific helper. Build frontend assets and prepare the helper before direct Cargo/Tauri builds. The documented interactive development command is `pnpm desktop`; the development dashboard and standalone release dashboard both launched successfully during physical validation.

Results on this physical PC:

| Check                                             | Result                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| Frozen pnpm install                               | Passed; all nine workspace projects                                       |
| Formatting, lint, TypeScript, frontend/Core build | Passed                                                                    |
| Unit tests                                        | 31 passed                                                                 |
| Isolated real PostgreSQL integration              | 19 passed; test container cleaned up                                      |
| Rust fmt                                          | Passed                                                                    |
| Full workspace clippy, all targets                | Passed with warnings denied                                               |
| Runtime and identity Rust tests                   | 14 passed; isolated native-store test separately passed                   |
| Runtime helper build/staging                      | Passed                                                                    |
| Full Rust workspace/native build                  | Passed September 28; fmt, check, clippy, tests and native build           |
| Tauri development build                           | Passed September 28; debug executable produced                            |
| Tauri release build / desktop launch              | Passed: optimized no-bundle build and standalone packaged-frontend launch |

On September 27, the full `pnpm rust:check` reached `cargo check --workspace` and failed with OS error 4551. The Windows Code Integrity event 3077 names `target\debug\build\webview2-com-sys-f2581f028e9d3e55\build-script-build.exe` and policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`. Smart App Control policy state was enabled. That attempt was not a successful full native build.

Direct follow-up checks on September 27 also failed with error 4551: `cargo build --workspace --locked` was blocked at the `selectors` build helper, and `pnpm --filter @jarvis/desktop tauri build --debug --no-bundle` reached `jarvis-desktop` but could not run its build helper. The Tauri command's frontend prerequisite completed. On September 28, the same Tauri development build passed, followed by full `pnpm rust:check` (fmt, workspace check, clippy with warnings denied, and tests: 14 passed, one native-store test ignored) and `cargo build --workspace --locked`. The development executable was produced at `target/debug/jarvis-desktop.exe`. Smart App Control state remained enabled (`VerifiedAndReputablePolicyState=1`). No signing exception, security exclusion or alternative execution mechanism was introduced. The reason the previous policy block stopped reproducing is unknown, so this result does not guarantee every future generated binary will be accepted.

## Physical runtime and identity evidence

The existing Phase 3 helper launched in the ordinary desktop user's session without elevation. It reported `UNCONFIGURED`, `SECURE_IDENTITY_UNAVAILABLE`, no device/session, startup `DISABLED`, the Windows lifecycle observer available, and `executionAvailable: false`. This is the truthful state before explicit Windows enrollment; the Mac identity was not copied or reset.

A duplicate supervisor invocation retained the same instance and exactly two processes (one supervisor and one worker). Six samples over approximately 30 seconds observed working sets of approximately 24.11–24.12 MiB and 15.95–15.96 MiB, with zero additional measured process CPU seconds and zero log growth. This is an unconfigured idle debug-runtime spot sample, not a connected-runtime or peak-memory benchmark. The log contained fixed structured event/state fields. The existing IPC stop command stopped both processes cleanly.

The isolated `cargo test -p jarvis-identity native_store_roundtrip --locked -- --ignored` test passed against real Windows Credential Manager: write, read, delete and missing-entry verification. It uses a random validation entry and does not alter the real owner identity. Credential persistence across restart, Windows Hello registration/assertion, enrollment, and revoked-session rejection still require later physical acceptance.

Source and tests confirm that the IPC command set is status/reconnect/stop/provision; unknown shell commands are rejected. Execution and future voice, capture, computer-control and remote-desktop capabilities remain unavailable. No Prompt #4 implementation was added.

The existing Windows autostart implementation uses only the current user's `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value `JARVIS Runtime`, containing a quoted fixed helper path plus `--supervise`. Enable/disable is separate from process stop. The real desktop controls passed an enable/disable round trip, including registry verification. On September 29 this was repeated from the stable installed release: the entry exactly named its adjacent runtime helper, then was removed when disabled. No elevation was needed. Startup was left disabled and the disabled state was verified after the real September 29 reboot. Enabled automatic launch at login and suspend/resume remain later physical tests. Keep any lasting registration pointed at the stable installation, never a disposable build directory.

## Private remote development

Tailscale 1.102.4 is connected and configured to run unattended. Its service starts automatically. PC name: `deezy.tail03652f.ts.net`; private IPv4: `100.69.78.125`. The verified primary Mac peer is `landens-macbook-air.tail03652f.ts.net`, IPv4 `100.92.70.2`.

Windows OpenSSH 9.5p2 is running with system PowerShell 7 as its default shell. A dedicated standard local account, `jarvisdev`, avoids granting elevated administrator SSH sessions. The owner desktop account is not an SSH login target. Microsoft explains administrator session behavior in its SSH remoting documentation: <https://learn.microsoft.com/en-us/powershell/scripting/security/remoting/ssh-remoting-in-powershell>.

The standard account has its own checkout at `C:\Users\jarvisdev\Developer\JARVIS` and its own pnpm/Rust environment. Its GitHub access uses a separate Windows-generated read-only deploy key, restricted to `Taxcut/JARVIS` (GitHub key ID `164560974`, title `DEEZY JARVIS Windows read-only development`). The Mac private key stays on the Mac. No owner GitHub token is copied into the standard account; pushes and PRs remain in the primary Mac/owner workflow.

Windows Hello and the physical owner's Credential Manager validation must run in the actual desktop user session. The standard SSH account is a separate security identity, and an SSH build/test result does not establish physical-owner enrollment or Hello acceptance.

The service uses delayed automatic startup, depends on TCP/IP and Tailscale, and has restart recovery configured. After the real September 29 reboot (13:35 local), both services were running automatically and the private SSH listener was restored. Its only verified listener is `100.69.78.125:22` (IPv4). The firewall rule `JARVIS-SSH-Tailscale-Mac` permits only source `100.92.70.2`, destination `100.69.78.125`, TCP 22, on the Tailscale interface. The default broad `OpenSSH-Server-In-TCP` rule is disabled. Password authentication and forwarding are disabled; public-key authentication is required, only `jarvisdev` is allowed, and administrators are denied. The authorized Mac key additionally restricts source address and forwarding.

Connect from the primary Mac with Tailscale active:

```sh
ssh -4 -i ~/.ssh/jarvis_windows -o IdentitiesOnly=yes -o HostKeyAlgorithms=ssh-ed25519 jarvisdev@deezy.tail03652f.ts.net
```

Verify the server ED25519 fingerprint before accepting it:

```text
SHA256:whO2epBPJzWlsmUZJmKi1L4v1a8iZPxzIdQPZ/zb5T4
```

The authorized Mac public-key fingerprint is `SHA256:KJXMNx97Ws1MyemX75UcCwFmQYMJ5f5nVVvoQKHqj2Q`. Enter any private-key passphrase only on the Mac. Do not transfer the private key.

After the first authenticated connection, initialize the standard user's PATH and verify tools and read-only GitHub access:

```powershell
& "$env:USERPROFILE\Developer\Initialize-JarvisEnvironment.ps1"
```

This visible one-time helper changes only `jarvisdev`'s user PATH, confirms it is not elevated, prints tool versions, fetches origin and checks the Phase 3 ancestor. It does not perform elevation. A fresh non-interactive connection subsequently resolved Git, Node, pnpm, cargo and rustc to their intended locations. A standalone `whoami` command completed with exit 0 in 0.5 seconds. Remote dependency installation was attempted but failed before project checks with Windows error 448 while reading the esbuild package through a pnpm junction. After the dependency-link repair described below, the September 28 Mac SSH run passed pnpm check and all 14 runtime/identity tests, with a clean Git status and JARVIS_REMOTE_CHECKS_OK.

The first non-interactive Git fetch hung inside Windows' SSH client. A Mac-side `ChannelTimeout=session=30s` reproduced the hang and closed the idle session. Removing `Env:c28fc6f98a2c44abbbd89d6a3037d0d9_POSIX_FD_STATE` from that one PowerShell process allowed the otherwise identical fetch to finish and report `main` up to date. This matches the inherited descriptor-state problem reported in <https://github.com/PowerShell/Win32-OpenSSH/issues/2037>. The owner installed the correction in jarvisdev's current-user/all-hosts PowerShell profile. A new non-interactive connection verified the variable was absent and GitHub fetch succeeded without inline cleanup. It does not alter SSH authentication or Windows security protections. Commands that explicitly use `-NoProfile` must perform the same process-local cleanup before launching Windows' SSH client.

To disable access immediately, run these commands locally in an owner-approved elevated PowerShell session:

```powershell
Stop-Service sshd
Set-Service sshd -StartupType Disabled
Disable-NetFirewallRule -Name JARVIS-SSH-Tailscale-Mac
```

To revoke only the Mac key, remove its entry from `C:\Users\jarvisdev\.ssh\authorized_keys`, retaining restrictive permissions. To revoke the Windows account's repository access, remove deploy key `164560974` from the GitHub repository's deploy-key settings. Do not remove the Mac's private key as part of Windows cleanup. Disabling the Tailscale device is also available through the owner's tailnet administration, but affects all its private-network access.

Troubleshooting:

- A timeout: verify both devices are online in Tailscale, use IPv4, and check the service and the exact firewall addresses. A changed Mac Tailscale address requires a deliberate update to both the firewall scope and authorized-key source constraint.
- A changed host-key warning: stop and compare the server's local public-key fingerprint. Do not delete known-host entries without verifying the reason.
- A permission-denied login: confirm username `jarvisdev`, the selected Mac private key, and the protected user-owned authorized-key file. Do not enable password authentication as a workaround.
- A pnpm PowerShell launcher reporting "operation attempted is not supported": the initial standard-account install skipped pnpm 12's native-binary installation script. The correction was verified in a separate local install; run `npm.cmd install --global --prefix "$env:APPDATA\npm" pnpm@12.4.2 --allow-scripts=pnpm --ignore-scripts=false --no-audit --no-fund` as `jarvisdev`, then repeat the environment helper. The owner confirmed the repair and successful environment helper in the remote account on September 27. This is a package installation repair, not a Windows security exception. pnpm installation reference: <https://pnpm.io/installation/>.
- Service error 1067: check SSH directory/log permissions and host-key ownership. On this machine, startup succeeded after existing host private keys were assigned to Administrators with access only for SYSTEM and Administrators, and SSH directory/log permissions were normalized. Keys were not regenerated. Microsoft references: <https://learn.microsoft.com/en-us/troubleshoot/windows-server/system-management-components/error-1053-1067-7034-after-update-openssh-doesnt-start> and <https://github.com/PowerShell/Win32-OpenSSH/wiki/Security-protection-of-various-files-in-win32-openssh>.
- Native build error 4551: preserve Windows protections and resolve the signing/trust blocker; a passing TypeScript build does not establish Tauri readiness.

No public listener, router forwarding, broad SMB share, anonymous share or RDP enablement was created by this bootstrap. Automatic SSH and Tailscale startup and the restricted SSH listener were verified after the September 29 reboot; the SSH event log confirms the expected Mac key was accepted and a command session opened at 13:40 September 29. The owner then ran the explicit-marker check from the Mac: it printed SSH_AFTER_REBOOT_OK and deezy\jarvisdev and returned to the Mac prompt. Post-reboot key authentication and non-interactive command output are verified.

The remote install downloaded the locked packages and passed pnpm supply-chain checks, then failed with `ERR_PNPM_CMD_SHIM_READ_MANIFEST` / Windows error 448 at `node_modules\esbuild\package.json`. This is consistent with RedirectionGuard's restriction on non-admin-created junctions in an enforcing process; the sshd image has a mitigation policy configured. Microsoft describes the trust model at <https://www.microsoft.com/en-us/msrc/blog/2025/06/redirectionguard-mitigating-unsafe-junction-traversal-in-windows>. A scratch workspace confirmed that hoisted installation still creates workspace junctions, while injecting workspace packages changes frozen-lockfile requirements. No project dependency settings were changed.

The owner approved a narrow repair that validated and recreated 450 existing pnpm junctions with administrator-created trust. All link paths and real target directory chains were checked to remain inside the remote checkout. No package/repository code ran with elevation; target files were preserved, the link inventory was recorded, and RedirectionGuard remains enabled. SSH restarted successfully. The subsequent non-admin install retry passed the earlier esbuild link but failed at a newly created `node_modules\.pnpm\node_modules\vite` junction with the same error 448. Repairing a partial tree therefore did not complete the install. New or replaced dependency junctions may require future owner approval; this is not yet a fully unattended dependency-update workflow.

The owner then approved completion of the frozen dependency layout using pnpm 12.4.2 with lifecycle scripts and pnpm hooks disabled (`--ignore-scripts --ignore-pnpmfile`) and copy-based package import. This completed all nine workspace projects and 261 packages without changing the lockfile or root dependency configuration. The repair validated and recreated all 698 resulting in-checkout junctions, and SSH restarted successfully. Package lifecycle scripts were not run with elevation. The subsequent standard-account `pnpm rebuild esbuild` recreated dependency links and failed with error 448 before project checks ran. The corrected sequence uses direct `node node_modules/esbuild/install.js`, `pnpm check`, and `cargo test -p jarvis-runtime -p jarvis-identity --locked` after restoring the trusted layout. Direct esbuild setup and a TypeScript transform passed in a separate local scratch workspace using the same esbuild version. On September 28, a further approved layout restoration completed; the link repair was extended to validate directory symbolic links as well as junctions and convert them to trusted junctions. All 698 links were recreated and SSH was verified running. The owner subsequently provided the complete fresh Mac SSH output: direct esbuild setup passed, pnpm check passed (format, lint, typecheck, 31 tests and frontend/Core builds), and cargo runtime/identity tests passed (14 passed, one native-store test ignored). The session reached JARVIS_REMOTE_CHECKS_OK and git status --short printed no changes. This establishes remote standard-account development checks for the prepared dependency layout; it does not establish the full Tauri build or unattended dependency updates. Do not repeat installation solely to resume these checks, since an install can create fresh untrusted junctions. Dependency updates still require a reviewed layout-provisioning step while RedirectionGuard remains enabled.

## Security and pending work

Defender, real-time protection, all Windows Firewall profiles and UAC were observed enabled. RDP was disabled; only built-in administrative SMB shares were present. No security exclusions or broad network shares were created. `.env` and private-key file patterns remain ignored; the project scan found no GitHub token or private-key markers. No JARVIS owner identity or session was transferred from the Mac. A new local JARVIS owner/database was not created.

The required bootstrap development-build and Mac remote-command checks are complete. The prepared checkout supports standard-account checks; dependency updates are not fully unattended because newly created links can require owner-approved trust repair. The optimized Tauri no-bundle release and standalone desktop launch passed. Signed installers remain outside this repository's implemented packaging scope. Windows Hello/enrollment, connected-runtime recovery, enabled login launch and suspend/resume remain explicitly pending physical tasks allowed to be deferred by the bootstrap prompt. Do not create a replacement owner or reset secure storage merely to complete that later checklist; use docs/JARVISSETUP.md with the intended owner/Core.

## Installed release and interactive validation

`pnpm runtime:prepare --release` and `pnpm --filter @jarvis/desktop tauri build --no-bundle` passed on September 28. The matching desktop and runtime executables were copied together into `C:\Users\lanke\AppData\Local\Programs\JARVIS\0.3.0-bootstrap-302031f`; their hashes match the release output. The directory allows only the desktop owner, SYSTEM and Administrators. Both executables are development artifacts, not signed distribution installers.

The development app rendered through the loopback Vite server. The release app rendered its embedded frontend at `http://tauri.localhost/` with that development server stopped. The release also reopened after the September 29 reboot. It truthfully displayed Not connected and execution unavailable. No Core connection or owner enrollment was forced.

Start runtime launched one supervisor/worker pair. Closing the dashboard left the same pair alive; reopening the release dashboard rediscovered it. The runtime reported AUTH_REQUIRED after normal desktop initialization of its local Credential Manager identity, with no authenticated Core session. No existing enrollment was replaced and no Mac identity was imported. Stop runtime through the desktop stopped both processes. All temporary development-server processes were stopped. Per-user startup was restored to disabled after validation.

The installed release helper also launched after the September 29 reboot from the protected installation path as exactly one supervisor/worker pair. It reported AUTH_REQUIRED, and the desktop Stop runtime control stopped both processes. Startup remained disabled.

## Phase 4 remote validation checkpoint

Standard-user SSH fetched `feat/phase4-voice-cinematic` at 18d922b. Verified native
sherpa-onnx assets and `cargo check -p jarvis-voice -p jarvis-runtime --locked`
succeeded on the Gaming PC, including CPAL, Kokoro/sherpa, echo processing and TLS.
Hosted Validate 36683188583 independently passed full Windows native tests/builds.

Local `pnpm install --frozen-lockfile` encountered Windows error 448 while reading
the esbuild package through an untrusted dependency junction. Preserve the earlier
RedirectionGuard diagnostic and trusted-link recovery procedure. No SAC, Defender,
UAC or RedirectionGuard setting was weakened. This is not a local TypeScript pass.
Additional native application/model checks and physical Windows enrollment/audio
acceptance remain explicitly pending. Do not import the Mac identity to Windows.

### Phase 4 local voice continuation

The 2026-10-02 local default requires sherpa streaming STT and pinned local Qwen
in addition to existing wake/Kokoro. `pnpm voice:local-setup` supports the pinned
Windows x64 Ollama archive, loopback-only service and the same Qwen digest; it
never changes Defender, Firewall, Smart App Control or RedirectionGuard. Existing
9a242d3 native build/28-test evidence predates this change. Updated Windows local
inference and native build validation remain pending; physical microphone and
owner enrollment are separate. Remote availability has resumed.
