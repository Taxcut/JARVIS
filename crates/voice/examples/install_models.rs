//! Explicit setup action; no downloads happen during ordinary runtime startup.
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};
fn install(
    root: &Path,
    name: &str,
    url: &str,
    digest: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let archive = root.join(format!(".{name}.download"));
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()?;
    let mut response = client.get(url).send()?.error_for_status()?;
    let mut file = fs::File::create(&archive)?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    let mut total = 0;
    loop {
        let n = response.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        total += n;
        if total > 200 * 1024 * 1024 {
            return Err("Model archive exceeded its size limit".into());
        }
        hash.update(&buffer[..n]);
        file.write_all(&buffer[..n])?;
    }
    file.sync_all()?;
    drop(file);
    if hex::encode(hash.finalize()) != digest {
        return Err("Model archive failed its integrity check".into());
    }
    let decoder = bzip2::read::BzDecoder::new(fs::File::open(&archive)?);
    let mut tar = tar::Archive::new(decoder);
    let mut size = 0u64;
    for entry in tar.entries()? {
        let mut entry = entry?;
        let kind = entry.header().entry_type();
        if !kind.is_file() && !kind.is_dir() {
            return Err("Model archive contained a non-regular entry".into());
        }
        size += entry.size();
        if size > 700 * 1024 * 1024 {
            return Err("Extracted model exceeded its limit".into());
        }
        if !entry.unpack_in(root)? {
            return Err("Model archive path was rejected".into());
        }
    }
    fs::remove_file(archive)?;
    println!("Verified and installed {name}");
    Ok(())
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = jarvis_voice::models::model_root()?;
    fs::create_dir_all(&root)?;
    if jarvis_voice::models::verify(&root).is_ok() {
        println!("Voice models already verified");
        return Ok(());
    }
    install(&root,"wake","https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2","f170013b4716e41b62b9bfd809687c207cef798ef9bc6534d524e17af9b6561a")?;
    install(&root,"kokoro","https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2","4c3052abaa60943a341f193888cf6abd68787dae6ab8ae5c925a706caa247e4e")?;
    jarvis_voice::models::verify(&root)?;
    println!("All voice assets passed their individual integrity checks");
    Ok(())
}
