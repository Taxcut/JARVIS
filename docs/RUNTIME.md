# Runtime — Phase 3 implementation in progress

This document records the current implementation plan, not completed acceptance. Execution remains unavailable. Voice, capture, computer control and remote desktop remain future phases.

## Process and identity boundaries

A Rust user-session runtime runs independently of the Tauri dashboard. The existing device UUID and Ed25519 key remain in OS secure storage. Runtime startup must load an existing identity, never create or enroll another device automatically. The dashboard and runtime use separate rotating sessions so neither overwrites the other's refresh credential. Runtime sessions use the existing signed transport, expiry, security revision and revocation checks, restricted server-side to safe snapshot/sync/presence operations. Only an authenticated owner session can provision a runtime session.

The dashboard's narrow native setup command transfers the scoped session directly to the runtime over a local OS-protected channel; React never receives it. Runtime resume material has a separate OS secure-store entry. No secret file fallback. Local IPC admits only status, reconnect, stop and native session provisioning; no arbitrary commands, paths or process IDs.

## Platform choices under implementation

macOS: embed the helper and its LaunchAgent plist in the app bundle, using SMAppService agent registration in the logged-in GUI session, not a root daemon. Apple recommends SMAppService on macOS 13+, including bundled agents with BundleProgram. Registration/status/disable belong to explicit native owner controls. NSWorkspace notifications drive sleep/wake/session transitions. See [Apple SMAppService](https://developer.apple.com/documentation/servicemanagement/smappservice) and [Apple DTS bundled-service guidance](https://developer.apple.com/forums/thread/802443).

Windows: a fixed, quoted runtime executable registered under the current user's Run key; no elevated service. Suspend/resume and session transitions use Windows notifications. See [Microsoft Run keys](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys) and [WM_POWERBROADCAST](https://learn.microsoft.com/en-us/windows/win32/power/wm-powerbroadcast). Hosted native validation is required; physical Gaming PC startup/suspend/resume/Hello/Credential Manager acceptance is intentionally deferred.

## Planned persistence and failure handling

Core holds one current runtime-presence row per trusted device, separate from enrollment. A server-issued expiry bounds online claims. Heartbeats update this row and the bounded sync stream, not indefinite audit history; real lifecycle/security changes retain audit evidence. Capabilities are explicitly limited to runtime infrastructure; future capabilities cannot be reported available. Runtime protocol compatibility is independent of application versions and fails closed.

An OS-backed exclusive lock prevents duplicate instances and releases after crashes. Reconnect uses capped jittered backoff, socket deadlines and skipped missed timer ticks. Wake discards old transport state, revalidates the session and requests an authoritative resync. Auth/revocation errors require owner action rather than trust recreation. Logs use fixed sanitized events and bounded rotation; diagnostics contain no authentication material or invasive inventory.

Implementation, test results, measured idle behavior and physical acceptance will replace this plan as they are verified. Login persistence is not enabled merely by building or launching the dashboard.
