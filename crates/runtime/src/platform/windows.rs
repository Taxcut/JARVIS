use super::Event;
use std::{io, path::Path, ptr};
use tokio::sync::mpsc::Sender;
use windows_sys::Win32::{
    Foundation::*,
    Security::{Authorization::*, *},
    System::{Registry::*, RemoteDesktop::*, Threading::*},
    UI::WindowsAndMessaging::*,
};
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
pub fn sid() -> io::Result<String> {
    unsafe {
        let mut token = ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(io::Error::last_os_error());
        }
        let mut size = 0;
        GetTokenInformation(token, TokenUser, ptr::null_mut(), 0, &mut size);
        let mut data = vec![0usize; (size as usize).div_ceil(std::mem::size_of::<usize>())];
        let success =
            GetTokenInformation(token, TokenUser, data.as_mut_ptr().cast(), size, &mut size);
        CloseHandle(token);
        if success == 0 {
            return Err(io::Error::last_os_error());
        }
        let user = &*(data.as_ptr() as *const TOKEN_USER);
        let mut string = ptr::null_mut();
        if ConvertSidToStringSidW(user.User.Sid, &mut string) == 0 {
            return Err(io::Error::last_os_error());
        }
        let mut len = 0;
        while *string.add(len) != 0 {
            len += 1;
        }
        let result = String::from_utf16_lossy(std::slice::from_raw_parts(string, len));
        LocalFree(string.cast());
        Ok(result)
    }
}
struct Descriptor(PSECURITY_DESCRIPTOR);
impl Descriptor {
    fn new(inherit: bool) -> io::Result<Self> {
        let flags = if inherit { "OICI" } else { "" };
        let text = wide(&format!("D:P(A;{flags};GA;;;{})", sid()?));
        let mut sd = ptr::null_mut();
        if unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                text.as_ptr(),
                1,
                &mut sd,
                ptr::null_mut(),
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(Self(sd))
    }
}
impl Drop for Descriptor {
    fn drop(&mut self) {
        unsafe {
            LocalFree(self.0);
        }
    }
}
pub fn protect_directory(path: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    let path: Vec<_> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let sd = Descriptor::new(true)?;
    if unsafe {
        SetFileSecurityW(
            path.as_ptr(),
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            sd.0,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}
pub fn pipe_name() -> io::Result<String> {
    Ok(format!(r"\\.\pipe\jarvis-runtime-v1-{}", sid()?))
}
pub fn pipe(first: bool) -> io::Result<tokio::net::windows::named_pipe::NamedPipeServer> {
    let descriptor = Descriptor::new(false)?;
    let mut attributes = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: descriptor.0,
        bInheritHandle: 0,
    };
    unsafe {
        tokio::net::windows::named_pipe::ServerOptions::new()
            .first_pipe_instance(first)
            .reject_remote_clients(true)
            .max_instances(9)
            .in_buffer_size(16384)
            .out_buffer_size(16384)
            .create_with_security_attributes_raw(
                pipe_name()?,
                (&mut attributes as *mut SECURITY_ATTRIBUTES).cast(),
            )
    }
}
pub fn startup(enable: Option<bool>) -> Result<String, String> {
    let path = super::helper_path()?;
    let command = format!(
        "\"{}\" --supervise",
        path.to_str().ok_or("Unsupported application path")?
    );
    if command.contains('\n') || command.encode_utf16().count() > 250 {
        return Err("Application path too long for login startup".into());
    }
    unsafe {
        let mut key = ptr::null_mut();
        let access = KEY_QUERY_VALUE | if enable.is_some() { KEY_SET_VALUE } else { 0 };
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            wide(r"Software\Microsoft\Windows\CurrentVersion\Run").as_ptr(),
            0,
            access,
            &mut key,
        ) != ERROR_SUCCESS
        {
            return Err("Windows login startup is unavailable".into());
        }
        let name = wide("JARVIS Runtime");
        let result = match enable {
            Some(true) => {
                let v = wide(&command);
                RegSetValueExW(
                    key,
                    name.as_ptr(),
                    0,
                    REG_SZ,
                    v.as_ptr().cast(),
                    (v.len() * 2) as u32,
                )
            }
            Some(false) => {
                let r = RegDeleteValueW(key, name.as_ptr());
                if r == ERROR_FILE_NOT_FOUND {
                    ERROR_SUCCESS
                } else {
                    r
                }
            }
            None => ERROR_SUCCESS,
        };
        if result != ERROR_SUCCESS {
            RegCloseKey(key);
            return Err("Windows could not change runtime startup".into());
        }
        let mut data = [0u16; 512];
        let mut size = std::mem::size_of_val(&data) as u32;
        let mut kind = 0;
        let result = RegQueryValueExW(
            key,
            name.as_ptr(),
            ptr::null(),
            &mut kind,
            data.as_mut_ptr().cast(),
            &mut size,
        );
        RegCloseKey(key);
        if result == ERROR_FILE_NOT_FOUND {
            return Ok("DISABLED".into());
        }
        if result != ERROR_SUCCESS || kind != REG_SZ {
            return Ok("ERROR".into());
        }
        let end = data.iter().position(|c| *c == 0).unwrap_or(data.len());
        Ok(if String::from_utf16_lossy(&data[..end]) == command {
            "ENABLED"
        } else {
            "ERROR"
        }
        .into())
    }
}
unsafe extern "system" fn procedure(window: HWND, message: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    let ptr = unsafe { GetWindowLongPtrW(window, GWLP_USERDATA) } as *const Sender<Event>;
    let event = match message {
        WM_POWERBROADCAST => match w as u32 {
            4 => Some(Event::Sleep),
            7 | 18 => Some(Event::Wake),
            _ => None,
        },
        WM_WTSSESSION_CHANGE => match w as u32 {
            WTS_SESSION_LOCK | WTS_CONSOLE_DISCONNECT => Some(Event::SessionInactive),
            WTS_SESSION_UNLOCK | WTS_CONSOLE_CONNECT => Some(Event::SessionActive),
            WTS_SESSION_LOGOFF => Some(Event::Logout),
            _ => None,
        },
        WM_ENDSESSION if w != 0 => Some(Event::Logout),
        _ => None,
    };
    if !ptr.is_null() {
        let tx = unsafe { &*ptr };
        if let Some(event) = event {
            let _ = tx.try_send(event);
        }
        if message == WM_TIMER && tx.is_closed() {
            unsafe {
                PostQuitMessage(0);
            }
        }
    }
    if message == WM_QUERYENDSESSION {
        return 1;
    }
    unsafe { DefWindowProcW(window, message, w, l) }
}
pub fn observe(tx: Sender<Event>) {
    unsafe {
        let class = wide("JARVISRuntimeSessionV1");
        let instance = windows_sys::Win32::System::LibraryLoader::GetModuleHandleW(ptr::null());
        let window_class = WNDCLASSW {
            lpfnWndProc: Some(procedure),
            hInstance: instance,
            lpszClassName: class.as_ptr(),
            ..std::mem::zeroed()
        };
        if RegisterClassW(&window_class) == 0 {
            let _ = tx.try_send(Event::Unavailable);
            return;
        }
        let window = CreateWindowExW(
            0,
            class.as_ptr(),
            class.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            ptr::null_mut(),
            ptr::null_mut(),
            instance,
            ptr::null(),
        );
        if window.is_null() {
            let _ = tx.try_send(Event::Unavailable);
            return;
        }
        SetWindowLongPtrW(
            window,
            GWLP_USERDATA,
            (&tx as *const Sender<Event>) as isize,
        );
        let ready = WTSRegisterSessionNotification(window, NOTIFY_FOR_THIS_SESSION) != 0;
        SetTimer(window, 1, 1000, None);
        let _ = tx.try_send(if ready {
            Event::Ready
        } else {
            Event::Unavailable
        });
        let mut msg = std::mem::zeroed();
        while GetMessageW(&mut msg, ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        WTSUnRegisterSessionNotification(window);
        DestroyWindow(window);
    }
}
