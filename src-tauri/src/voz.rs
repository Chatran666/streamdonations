// Voz argentina "Daniela" sin internet (Piper)
// - Se baja una sola vez, cuando la persona la pide (unos 135 MB): el programa Piper y la voz.
//   Cada archivo se controla con su huella (SHA-256) antes de usarlo.
// - Piper queda abierto con la voz cargada y va generando frase por frase, con prioridad baja
//   para no trabar el juego ni OBS.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

const PIPER_ZIP_URL: &str = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
const PIPER_ZIP_SHA: &str = "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea";
const PIPER_ZIP_SIZE: u64 = 22_477_236;
const MODEL_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx";
const MODEL_SHA: &str = "7ceb1fc0dab349418c5b54a639ae9ee595212d7c9ea422220d8419163d5cc985";
const MODEL_SIZE: u64 = 114_199_011;
const CONFIG_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx.json";
const CONFIG_SHA: &str = "aedbf69647e1d754c62ecf8e0366ca5f16af3e768e3c6b5329af6eb6bde3852b";
const MODEL_FILE: &str = "es_AR-daniela-high.onnx";

#[cfg(windows)]
const PIPER_EXE: &str = "piper.exe";
#[cfg(not(windows))]
const PIPER_EXE: &str = "piper";

static INSTALLING: AtomicBool = AtomicBool::new(false);
static JOB_N: AtomicU64 = AtomicU64::new(1);

struct Engine {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    length_scale: f32,
}

pub struct VozState(Mutex<Option<Engine>>);

impl VozState {
    pub fn new() -> Self {
        VozState(Mutex::new(None))
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("voz"))
}
fn exe_path(d: &Path) -> PathBuf {
    d.join("piper").join(PIPER_EXE)
}
fn installed(d: &Path) -> bool {
    exe_path(d).is_file() && d.join(MODEL_FILE).is_file() && d.join(format!("{MODEL_FILE}.json")).is_file()
}

#[derive(Serialize)]
pub struct VozStatus {
    installed: bool,
    installing: bool,
    supported: bool,
}

#[tauri::command]
pub fn voz_status(app: AppHandle) -> VozStatus {
    let d = dir(&app).ok();
    VozStatus {
        installed: d.as_deref().map(installed).unwrap_or(false),
        installing: INSTALLING.load(Ordering::Relaxed),
        // Piper para Windows de 64 bits (en otras PC se puede probar copiando los archivos a mano)
        supported: cfg!(all(windows, target_arch = "x86_64")) || d.as_deref().map(installed).unwrap_or(false),
    }
}

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

/// Baja un archivo a disco controlando su huella; avisa el avance a la ventana
fn download(app: &AppHandle, agent: &ureq::Agent, url: &str, sha: &str, to: &Path, base: u64, total: u64) -> Result<u64, String> {
    let part = to.with_extension("part");
    let mut resp = agent.get(url).call().map_err(|e| format!("no se pudo bajar ({e})"))?;
    let mut reader = resp.body_mut().with_config().limit(200 * 1024 * 1024).reader();
    let mut f = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
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
        if last.elapsed().as_millis() > 250 {
            last = Instant::now();
            let _ = app.emit("voz-progress", Progress { done: base + n, total });
        }
    }
    drop(f);
    let got: String = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if got != sha {
        let _ = std::fs::remove_file(&part);
        return Err("el archivo bajado no es el original (huella distinta)".into());
    }
    std::fs::rename(&part, to).map_err(|e| e.to_string())?;
    Ok(n)
}

fn unzip(zip_path: &Path, into: &Path) -> Result<(), String> {
    let f = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut z = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
    for i in 0..z.len() {
        let mut e = z.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = e.enclosed_name() else { continue };
        let out = into.join(rel);
        if e.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = out.parent() {
                std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut w = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut e, &mut w).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn install(app: &AppHandle) -> Result<(), String> {
    let d = dir(app)?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let a = agent();
    let total = PIPER_ZIP_SIZE + MODEL_SIZE;
    let zip_path = d.join("piper.zip");
    let got = download(app, &a, PIPER_ZIP_URL, PIPER_ZIP_SHA, &zip_path, 0, total)?;
    let _ = std::fs::remove_dir_all(d.join("piper"));
    unzip(&zip_path, &d)?;
    let _ = std::fs::remove_file(&zip_path);
    download(app, &a, CONFIG_URL, CONFIG_SHA, &d.join(format!("{MODEL_FILE}.json")), got, total)?;
    download(app, &a, MODEL_URL, MODEL_SHA, &d.join(MODEL_FILE), got, total)?;
    let _ = app.emit("voz-progress", Progress { done: total, total });
    if !installed(&d) {
        return Err("faltan archivos de la voz".into());
    }
    Ok(())
}

#[tauri::command]
pub fn voz_install(app: AppHandle) -> Result<(), String> {
    if INSTALLING.swap(true, Ordering::SeqCst) {
        return Err("ya se está bajando".into());
    }
    std::thread::spawn(move || {
        let r = install(&app);
        INSTALLING.store(false, Ordering::SeqCst);
        let _ = app.emit("voz-installed", r.err());
    });
    Ok(())
}

#[tauri::command]
pub fn voz_remove(app: AppHandle, st: tauri::State<VozState>) -> Result<(), String> {
    *st.0.lock().unwrap() = None;
    let d = dir(&app)?;
    // Windows tarda un instante en soltar los archivos de Piper después de cerrarlo
    for _ in 0..10 {
        if !d.exists() || std::fs::remove_dir_all(&d).is_ok() {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
    Err("no se pudo borrar la carpeta de la voz".into())
}

fn start_engine(d: &Path, length_scale: f32) -> Result<Engine, String> {
    let mut cmd = Command::new(exe_path(d));
    cmd.current_dir(d.join("piper"))
        .arg("-m")
        .arg(d.join(MODEL_FILE))
        .arg("--json-input")
        .arg("-q")
        .arg("--length_scale")
        .arg(format!("{length_scale:.2}"))
        .arg("--sentence_silence")
        .arg("0.15")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Sin ventana negra y con prioridad baja (el juego y OBS van primero)
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
        cmd.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Piper no arrancó ({e})"))?;
    let stdin = child.stdin.take().ok_or("sin entrada")?;
    let stdout = BufReader::new(child.stdout.take().ok_or("sin salida")?);
    Ok(Engine { child, stdin, stdout, length_scale })
}

fn synth_once(eng: &mut Engine, text: &str, out: &Path) -> Result<Vec<u8>, String> {
    let line = serde_json::json!({ "text": text, "output_file": out.to_string_lossy() }).to_string();
    eng.stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    eng.stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    eng.stdin.flush().map_err(|e| e.to_string())?;
    let mut answer = String::new();
    if eng.stdout.read_line(&mut answer).map_err(|e| e.to_string())? == 0 {
        return Err("Piper se cerró".into());
    }
    let bytes = std::fs::read(out).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(out);
    Ok(bytes)
}

/// Genera el audio (WAV) de un texto. Devuelve los bytes del archivo.
#[tauri::command]
pub async fn voz_synth(app: AppHandle, text: String, length_scale: f32) -> Result<tauri::ipc::Response, String> {
    let text: String = text.chars().filter(|c| !c.is_control()).take(600).collect();
    if text.trim().is_empty() {
        return Err("texto vacío".into());
    }
    let ls = if length_scale.is_finite() { length_scale.clamp(0.4, 2.5) } else { 1.0 };
    let app2 = app.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let d = dir(&app2)?;
        if !installed(&d) {
            return Err("La voz no está bajada".into());
        }
        let st = app2.state::<VozState>();
        let mut g = st.0.lock().unwrap();
        // Si cambió la velocidad, Piper se reinicia con la nueva
        if g.as_ref().map(|e| (e.length_scale - ls).abs() > 0.01).unwrap_or(true) {
            *g = None;
            *g = Some(start_engine(&d, ls)?);
        }
        let out = std::env::temp_dir().join(format!("sd-voz-{}-{}.wav", std::process::id(), JOB_N.fetch_add(1, Ordering::Relaxed)));
        match synth_once(g.as_mut().unwrap(), &text, &out) {
            Ok(b) => Ok(b),
            Err(_) => {
                // Un reintento con Piper recién abierto
                *g = Some(start_engine(&d, ls)?);
                synth_once(g.as_mut().unwrap(), &text, &out)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}
