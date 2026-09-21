#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
fn main() {
    let arg = std::env::args().nth(1);
    let result = match arg.as_deref() {
        Some("--supervise") => jarvis_runtime::daemon::supervise(),
        Some("--worker") => worker(),
        _ => Err(std::io::Error::other("Unsupported runtime invocation")),
    };
    if result.is_err() {
        std::process::exit(1);
    }
}
fn worker() -> std::io::Result<()> {
    let directory = jarvis_runtime::storage::directory()?;
    let (tx, rx) = tokio::sync::mpsc::channel(32);
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()?;
    let thread =
        std::thread::spawn(move || runtime.block_on(jarvis_runtime::daemon::run(directory, rx)));
    // AppKit / Windows messages live on the process main thread.
    jarvis_runtime::platform::observe(tx);
    thread
        .join()
        .map_err(|_| std::io::Error::other("Runtime worker failed"))?
}
