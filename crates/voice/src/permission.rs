//! OS permission is distinct from opening a Core Audio stream successfully.
#[cfg(target_os = "macos")]
pub fn ready() -> Result<bool, &'static str> {
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
    use std::sync::atomic::{AtomicBool, Ordering};
    static REQUESTED: AtomicBool = AtomicBool::new(false);
    // Only the documented audio media constant is supplied. The completion block
    // captures nothing; AVFoundation retains it while the system prompt is open.
    unsafe {
        let media = AVMediaTypeAudio.ok_or("Microphone permission status is unavailable")?;
        match AVCaptureDevice::authorizationStatusForMediaType(media) {
            AVAuthorizationStatus::Authorized => Ok(true),
            AVAuthorizationStatus::NotDetermined => {
                if !REQUESTED.swap(true, Ordering::AcqRel) {
                    let done = block2::RcBlock::new(|_: objc2::runtime::Bool| {});
                    AVCaptureDevice::requestAccessForMediaType_completionHandler(media, &done);
                }
                Ok(false)
            }
            AVAuthorizationStatus::Denied | AVAuthorizationStatus::Restricted => Err(
                "Microphone permission is required. Enable JARVIS in System Settings → Privacy & Security → Microphone, then reconnect audio.",
            ),
            _ => Err("Microphone permission status is unavailable"),
        }
    }
}
#[cfg(not(target_os = "macos"))]
pub fn ready() -> Result<bool, &'static str> {
    // CPAL reports the Windows desktop microphone privacy/device access error.
    Ok(true)
}
