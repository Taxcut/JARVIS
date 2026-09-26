use super::Event;
use objc2_app_kit::*;
use objc2_foundation::{NSDate, NSNotification, NSRunLoop, NSString};
use objc2_service_management::{SMAppService, SMAppServiceStatus};
use std::ptr::NonNull;
use tokio::sync::mpsc::Sender;
pub fn startup(enable: Option<bool>) -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|_| "Application path unavailable")?;
    let macos = exe.parent().ok_or("Application bundle required")?;
    let contents = macos.parent().ok_or("Application bundle required")?;
    if !contents
        .join("Library/LaunchAgents/com.taxcut.jarvis.runtime.plist")
        .is_file()
    {
        return Ok("UNAVAILABLE".into());
    }
    // SMAppService binds registration to this bundle; never copies a legacy plist into ~/Library.
    let service = unsafe {
        SMAppService::agentServiceWithPlistName(&NSString::from_str(
            "com.taxcut.jarvis.runtime.plist",
        ))
    };
    if let Some(enable) = enable {
        if enable {
            super::helper_path()?;
        }
        let result = unsafe {
            if enable {
                service.registerAndReturnError()
            } else {
                service.unregisterAndReturnError()
            }
        };
        result.map_err(|error| format!("macOS startup registration failed ({} / {}). Review Login Items in System Settings.", error.domain(), error.code()))?;
    }
    Ok(unsafe {
        match service.status() {
            SMAppServiceStatus::Enabled => "ENABLED",
            SMAppServiceStatus::RequiresApproval => "APPROVAL_REQUIRED",
            SMAppServiceStatus::NotRegistered => "DISABLED",
            SMAppServiceStatus::NotFound => "NOT_CONFIGURED",
            _ => "UNAVAILABLE",
        }
    }
    .into())
}
pub fn observe(tx: Sender<Event>) {
    let center = NSWorkspace::sharedWorkspace().notificationCenter();
    let names = unsafe {
        [
            (NSWorkspaceWillSleepNotification, Event::Sleep),
            (NSWorkspaceDidWakeNotification, Event::Wake),
            (
                NSWorkspaceSessionDidResignActiveNotification,
                Event::SessionInactive,
            ),
            (
                NSWorkspaceSessionDidBecomeActiveNotification,
                Event::SessionActive,
            ),
            (NSWorkspaceWillPowerOffNotification, Event::Logout),
        ]
    };
    let mut tokens = Vec::new();
    for (name, event) in names {
        let sender = tx.clone();
        let block = block2::RcBlock::new(move |_: NonNull<NSNotification>| {
            let _ = sender.try_send(event);
        });
        tokens.push(unsafe {
            center.addObserverForName_object_queue_usingBlock(Some(name), None, None, &block)
        });
    }
    let _ = tx.try_send(Event::Ready);
    while !tx.is_closed() {
        objc2::rc::autoreleasepool(|_| {
            NSRunLoop::currentRunLoop().runUntilDate(&NSDate::dateWithTimeIntervalSinceNow(1.0));
        });
    }
    for token in tokens {
        unsafe {
            center.removeObserver(objc2::runtime::ProtocolObject::as_ref(&token));
        }
    }
}
