# Gaming PC development target

Bootstrap dates: 2026-09-26–27. This machine extends the primary Mac workflow; it is not a new JARVIS development stream. Prompt #4 has not started.

## Acceptance status

**Not accepted yet.** The local TypeScript checks, database integration tests, runtime/identity Rust checks and physical runtime smoke test pass. Windows Smart App Control blocks unsigned Rust build helpers, preventing completion of the full native and Tauri builds. The private SSH service is running. The owner confirmed successful Mac key authentication on September 27, and an established connection from the expected Mac address was observed. The remote environment helper subsequently passed: GitHub fetch succeeded, HEAD matched the Phase 3 checkpoint, Git/Node/pnpm/cargo/rustc ran, and the account reported non-elevated PowerShell 7.6.6. Fresh non-interactive build/test validation remains pending.

Do not disable Smart App Control, Defender, the firewall or UAC to turn this result green. Native build acceptance needs a supported signing/trust solution compatible with the owner's security requirements. Microsoft documents that Smart App Control does not offer individual application exceptions: <https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions>.

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

`pnpm runtime:prepare` stages the target-specific helper. Build frontend assets and prepare the helper before direct Cargo/Tauri builds. The documented interactive development command is `pnpm desktop`; a full desktop smoke test remains pending the native build blocker.

Results on this physical PC:

| Check                                             | Result                                                         |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Frozen pnpm install                               | Passed; all nine workspace projects                            |
| Formatting, lint, TypeScript, frontend/Core build | Passed                                                         |
| Unit tests                                        | 31 passed                                                      |
| Isolated real PostgreSQL integration              | 19 passed; test container cleaned up                           |
| Rust fmt                                          | Passed                                                         |
| Runtime and identity clippy, all targets          | Passed with warnings denied                                    |
| Runtime and identity Rust tests                   | 14 passed; isolated native-store test separately passed        |
| Runtime helper build/staging                      | Passed                                                         |
| Full Rust workspace/native build                  | Blocked: App Control rejected build helpers; exit 101          |
| Tauri development build                           | Blocked: App Control rejected the desktop build helper; exit 1 |
| Tauri release build / desktop launch              | Pending resolution of the build blocker                        |

The full `pnpm rust:check` reached `cargo check --workspace` and failed with OS error 4551. The Windows Code Integrity event 3077 names `target\debug\build\webview2-com-sys-f2581f028e9d3e55\build-script-build.exe` and policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`. Smart App Control policy state was enabled. This is not a successful full native build.

Direct follow-up checks on September 27 also failed with error 4551: `cargo build --workspace --locked` was blocked at the `selectors` build helper, and `pnpm --filter @jarvis/desktop tauri build --debug --no-bundle` reached `jarvis-desktop` but could not run its build helper. The Tauri command's frontend prerequisite completed. No signing exception, security exclusion or alternative execution mechanism was introduced.

## Physical runtime and identity evidence

The existing Phase 3 helper launched in the ordinary desktop user's session without elevation. It reported `UNCONFIGURED`, `SECURE_IDENTITY_UNAVAILABLE`, no device/session, startup `DISABLED`, the Windows lifecycle observer available, and `executionAvailable: false`. This is the truthful state before explicit Windows enrollment; the Mac identity was not copied or reset.

A duplicate supervisor invocation retained the same instance and exactly two processes (one supervisor and one worker). Six samples over approximately 30 seconds observed working sets of approximately 24.11–24.12 MiB and 15.95–15.96 MiB, with zero additional measured process CPU seconds and zero log growth. This is an unconfigured idle debug-runtime spot sample, not a connected-runtime or peak-memory benchmark. The log contained fixed structured event/state fields. The existing IPC stop command stopped both processes cleanly.

The isolated `cargo test -p jarvis-identity native_store_roundtrip --locked -- --ignored` test passed against real Windows Credential Manager: write, read, delete and missing-entry verification. It uses a random validation entry and does not alter the real owner identity. Credential persistence across restart, Windows Hello registration/assertion, enrollment, and revoked-session rejection still require later physical acceptance.

Source and tests confirm that the IPC command set is status/reconnect/stop/provision; unknown shell commands are rejected. Execution and future voice, capture, computer-control and remote-desktop capabilities remain unavailable. No Prompt #4 implementation was added.

The existing Windows autostart implementation uses only the current user's `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value `JARVIS Runtime`, containing a quoted fixed helper path plus `--supervise`. Enable/disable is separate from process stop. The code and current disabled state were inspected; a real enable/disable round trip, login/reboot and suspend/resume are still pending. Do not register a disposable build directory or create another autostart mechanism.

## Private remote development

Tailscale 1.102.4 is connected and configured to run unattended. Its service starts automatically. PC name: `deezy.tail03652f.ts.net`; private IPv4: `100.69.78.125`. The verified primary Mac peer is `landens-macbook-air.tail03652f.ts.net`, IPv4 `100.92.70.2`.

Windows OpenSSH 9.5p2 is running with system PowerShell 7 as its default shell. A dedicated standard local account, `jarvisdev`, avoids granting elevated administrator SSH sessions. The owner desktop account is not an SSH login target. Microsoft explains administrator session behavior in its SSH remoting documentation: <https://learn.microsoft.com/en-us/powershell/scripting/security/remoting/ssh-remoting-in-powershell>.

The standard account has its own checkout at `C:\Users\jarvisdev\Developer\JARVIS` and its own pnpm/Rust environment. Its GitHub access uses a separate Windows-generated read-only deploy key, restricted to `Taxcut/JARVIS` (GitHub key ID `164560974`, title `DEEZY JARVIS Windows read-only development`). The Mac private key stays on the Mac. No owner GitHub token is copied into the standard account; pushes and PRs remain in the primary Mac/owner workflow.

Windows Hello and the physical owner's Credential Manager validation must run in the actual desktop user session. The standard SSH account is a separate security identity, and an SSH build/test result does not establish physical-owner enrollment or Hello acceptance.

The service uses delayed automatic startup, depends on TCP/IP and Tailscale, and has restart recovery configured. Its only verified listener is `100.69.78.125:22` (IPv4). The firewall rule `JARVIS-SSH-Tailscale-Mac` permits only source `100.92.70.2`, destination `100.69.78.125`, TCP 22, on the Tailscale interface. The default broad `OpenSSH-Server-In-TCP` rule is disabled. Password authentication and forwarding are disabled; public-key authentication is required, only `jarvisdev` is allowed, and administrators are denied. The authorized Mac key additionally restricts source address and forwarding.

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

This visible one-time helper changes only `jarvisdev`'s user PATH, confirms it is not elevated, prints tool versions, fetches origin and checks the Phase 3 ancestor. It does not perform elevation. A fresh non-interactive connection subsequently resolved Git, Node, pnpm, cargo and rustc to their intended locations. A standalone `whoami` command completed with exit 0 in 0.5 seconds. Remote dependency installation was attempted but failed before project checks with Windows error 448 while reading the esbuild package through a pnpm junction. Remote build/test execution remains pending.

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

No public listener, router forwarding, broad SMB share, anonymous share or RDP enablement was created by this bootstrap. Service behavior after a real reboot is still untested.

The remote install downloaded the locked packages and passed pnpm supply-chain checks, then failed with `ERR_PNPM_CMD_SHIM_READ_MANIFEST` / Windows error 448 at `node_modules\esbuild\package.json`. This is consistent with RedirectionGuard's restriction on non-admin-created junctions in an enforcing process; the sshd image has a mitigation policy configured. Microsoft describes the trust model at <https://www.microsoft.com/en-us/msrc/blog/2025/06/redirectionguard-mitigating-unsafe-junction-traversal-in-windows>. A scratch workspace confirmed that hoisted installation still creates workspace junctions, while injecting workspace packages changes frozen-lockfile requirements. No project dependency settings were changed.

The owner approved a narrow repair that validated and recreated 450 existing pnpm junctions with administrator-created trust. All link paths and real target directory chains were checked to remain inside the remote checkout. No package/repository code ran with elevation; target files were preserved, the link inventory was recorded, and RedirectionGuard remains enabled. SSH restarted successfully. The subsequent non-admin install retry passed the earlier esbuild link but failed at a newly created `node_modules\.pnpm\node_modules\vite` junction with the same error 448. Repairing a partial tree therefore did not complete the install. New or replaced dependency junctions may require future owner approval; this is not yet a fully unattended dependency-update workflow.

The owner then approved completion of the frozen dependency layout using pnpm 12.4.2 with lifecycle scripts and pnpm hooks disabled (`--ignore-scripts --ignore-pnpmfile`) and copy-based package import. This completed all nine workspace projects and 261 packages without changing the lockfile or root dependency configuration. The repair validated and recreated all 698 resulting in-checkout junctions, and SSH restarted successfully. Package lifecycle scripts were not run with elevation. The subsequent standard-account `pnpm rebuild esbuild` recreated dependency links and failed with error 448 before project checks ran. The corrected next steps, after restoring the trusted layout, are direct `node node_modules/esbuild/install.js`, `pnpm check`, and `cargo test -p jarvis-runtime -p jarvis-identity --locked`; remote verification remains pending. Direct esbuild setup and a TypeScript transform passed in a separate local scratch workspace using the same esbuild version. On September 28, a further approved layout restoration completed; the link repair was extended to validate directory symbolic links as well as junctions and convert them to trusted junctions. All 698 links were recreated and SSH was verified running. Remote direct esbuild setup and project tests remain pending. Do not repeat installation solely to resume these checks, since an install can create fresh untrusted junctions. Dependency updates still require a reviewed layout-provisioning step while RedirectionGuard remains enabled.

## Security and pending work

Defender, real-time protection, all Windows Firewall profiles and UAC were observed enabled. RDP was disabled; only built-in administrative SMB shares were present. No security exclusions or broad network shares were created. `.env` and private-key file patterns remain ignored; the project scan found no GitHub token or private-key markers. No JARVIS owner identity or session was transferred from the Mac. A new local JARVIS owner/database was not created.

Before acceptance, finish the Mac command tests, resolve the native build signing/trust blocker without weakening the required protections, and complete the full workspace and Tauri validation. Windows Hello, connected-runtime recovery, per-user login startup and suspend/resume remain explicitly pending physical tasks.
