# Remote boundary — not implemented

Initial target: Mac JARVIS viewer → Gaming PC Windows host. Devices will first join a private Tailscale network. This does not replace application-level device authentication, scoped authorization or revocation.

Windows capture is planned around DXGI Desktop Duplication; macOS capture around ScreenCaptureKit. Native capture, hardware encoding and secure realtime transport belong in later capture/remote crates. Phase 1 requests no screen capture, Accessibility or input permissions and provides no remote-control route.

Remote sessions must be visible, explicitly approved, stoppable and auditable. Device revocation and global lockdown must terminate authority. No homemade VPN, hidden input injection or copied AGPL implementation from RustDesk or incompatible projects. Transport/provider selection, latency measurements, encoder negotiation and OS permission behavior will be validated on real hardware in a later phase.
