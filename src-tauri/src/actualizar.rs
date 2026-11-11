// Actualizar desde la misma app: baja el instalador de la versión nueva (solo desde las publicaciones
// del proyecto en GitHub), controla que sea el original con su huella SHA-256, lo abre en modo
// "pasivo" (sin preguntas, solo una barrita) y cierra la app. El instalador la vuelve a abrir.

use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

const ALLOWED: &str = "https://github.com/Chatran666/streamdonations/releases/download/";
static BUSY: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
struct Progress {
    done: u64,
    total: u64,
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .tls_config(
            ureq::tls::TlsConfig::builder()
                .root_certs(ureq::tls::RootCerts::PlatformVerifier)
                .build(),
        )
        .timeout_global(Some(std::time::Duration::from_secs(1800)))
        .build()
        .into()
}

fn valid_url(url: &str) -> bool {
    url.starts_with(ALLOWED)
        && url.ends_with(".exe")
        && !url[ALLOWED.len()..].contains("..")
        && url[ALLOWED.len()..].chars().all(|c| c.is_ascii_alphanumeric() || "._-/".contains(c))
}

fn download(app: &AppHandle, url: &str, sha: &str) -> Result<std::path::PathBuf, String> {
    let dir = std::env::temp_dir().join("StreamDonations-actualizacion");
    let _ = std::fs::create_dir_all(&dir);
    let file = dir.join("StreamDonations-Setup.exe");
    let part = dir.join("StreamDonations-Setup.part");
    let mut resp = agent().get(url).call().map_err(|e| format!("no se pudo bajar ({e})"))?;
    let total: u64 = resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let mut reader = resp.body_mut().with_config().limit(300 * 1024 * 1024).reader();
    let mut f = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 128 * 1024];
    let mut n: u64 = 0;
    let mut last = Instant::now();
    loop {
        let k = reader.read(&mut buf).map_err(|e| format!("se cortó la descarga ({e})"))?;
        if k == 0 {
            break;
        }
        h.update(&buf[..k]);
        f.write_all(&buf[..k]).map_err(|e| e.to_string())?;
        n += k as u64;
        if last.elapsed().as_millis() > 200 {
            last = Instant::now();
            let _ = app.emit("update-progress", Progress { done: n, total });
        }
    }
    drop(f);
    let got: String = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if got != sha.to_ascii_lowercase() {
        let _ = std::fs::remove_file(&part);
        return Err("el archivo bajado no es el original (huella distinta)".into());
    }
    let _ = std::fs::remove_file(&file);
    std::fs::rename(&part, &file).map_err(|e| e.to_string())?;
    let _ = app.emit("update-progress", Progress { done: n, total: n });
    Ok(file)
}

#[tauri::command]
pub fn update_install(app: AppHandle, url: String, sha256: String) -> Result<(), String> {
    if !valid_url(&url) {
        return Err("Solo se baja desde las publicaciones oficiales de StreamDonations".into());
    }
    if sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Falta la huella del instalador".into());
    }
    if BUSY.swap(true, Ordering::SeqCst) {
        return Err("Ya se está bajando".into());
    }
    std::thread::spawn(move || {
        let r = download(&app, &url, &sha256).and_then(|exe| run_installer(&exe));
        match r {
            Ok(()) => {
                let _ = app.emit("update-ready", ());
                // Se cierra para que el instalador pueda reemplazar los archivos (después la vuelve a abrir)
                std::thread::sleep(std::time::Duration::from_millis(700));
                app.exit(0);
            }
            Err(e) => {
                BUSY.store(false, Ordering::SeqCst);
                let _ = app.emit("update-error", e);
            }
        }
    });
    Ok(())
}

#[cfg(windows)]
fn run_installer(exe: &std::path::Path) -> Result<(), String> {
    // /P: sin preguntas, solo una barrita · /UPDATE: es una actualización (no borra datos) · /R: la vuelve a abrir
    std::process::Command::new(exe)
        .args(["/P", "/UPDATE", "/R"])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("no se pudo abrir el instalador ({e})"))
}

#[cfg(not(windows))]
fn run_installer(_exe: &std::path::Path) -> Result<(), String> {
    Err("La actualización desde la app es solo para Windows".into())
}
