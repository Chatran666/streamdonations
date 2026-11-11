// StreamDonations (versión con ventana propia, sin depender de Chrome)
// - Ventana principal con el panel (los mismos archivos de app/)
// - "Modo OBS" y la ayuda se abren como ventanas propias (window.open sigue funcionando igual)
// - Los links de internet se abren en el navegador que la persona tiene por defecto
// - Servidor interno en 127.0.0.1 (solo esta PC): sirve la página para la fuente de navegador
//   de OBS / Streamlabs y pasa los mensajes entre el panel y esa fuente
// - Ícono en la bandeja, una sola instancia, atajos globales y arranque con Windows (opcionales)

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, Wry};
use tauri_plugin_opener::OpenerExt;

mod voz;
mod actualizar;

/// Igual para todas las ventanas (WebView2 exige los mismos argumentos en las que comparten datos).
/// Los tres primeros son los que Tauri pone de fábrica; el último deja sonar los avisos sin tocar nada antes.
#[cfg(windows)]
const BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

static WIN_N: AtomicU64 = AtomicU64::new(1);
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// Ventanas y links
// ---------------------------------------------------------------------------

/// Páginas de la propia app (todo lo demás se abre afuera)
fn is_internal(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "blob" | "data" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost") => true,
            Some("localhost") | Some("127.0.0.1") => cfg!(dev),
            _ => false,
        },
        _ => false,
    }
}

fn open_external(app: &AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

fn with_handlers<'a>(
    b: WebviewWindowBuilder<'a, Wry, AppHandle>,
    app: &AppHandle,
) -> WebviewWindowBuilder<'a, Wry, AppHandle> {
    let nav_app = app.clone();
    let new_app = app.clone();
    b.on_navigation(move |url| {
        if is_internal(url) {
            true
        } else {
            open_external(&nav_app, url);
            false
        }
    })
    .on_new_window(move |url, features| new_window(&new_app, url, features))
}

/// window.open(...) desde la app: páginas propias en una ventana nueva (conserva window.opener,
/// así el "Modo OBS" se comunica igual que antes); links de internet en el navegador por defecto
fn new_window(app: &AppHandle, url: Url, features: NewWindowFeatures) -> NewWindowResponse<Wry> {
    if !is_internal(&url) || url.scheme() == "about" {
        open_external(app, &url);
        return NewWindowResponse::Deny;
    }
    let n = WIN_N.fetch_add(1, Ordering::Relaxed);
    let b = WebviewWindowBuilder::new(
        app,
        format!("pop{n}"),
        WebviewUrl::External("about:blank".parse().unwrap()),
    )
    .window_features(features)
    .title("StreamDonations")
    .on_document_title_changed(|w, t| {
        let _ = w.set_title(&t);
    });
    match with_handlers(b, app).build() {
        Ok(window) => NewWindowResponse::Create { window },
        Err(_) => NewWindowResponse::Deny,
    }
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Solo para pruebas en desarrollo: SD_EVAL_DIR=carpeta → ejecuta en el panel los .js que aparezcan ahí
#[cfg(debug_assertions)]
fn debug_eval_loop(win: tauri::WebviewWindow) {
    let Some(d) = std::env::var_os("SD_EVAL_DIR") else { return };
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(400));
        if let Ok(rd) = std::fs::read_dir(&d) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().map(|x| x == "js").unwrap_or(false) {
                    if let Ok(code) = std::fs::read_to_string(&p) {
                        let _ = std::fs::remove_file(&p);
                        let _ = win.eval(&code);
                    }
                }
            }
        }
    });
}

#[tauri::command]
fn debug_log(msg: String) {
    if cfg!(debug_assertions) {
        println!("[panel] {msg}");
    }
}

#[tauri::command]
fn set_close_to_tray(on: bool) {
    CLOSE_TO_TRAY.store(on, Ordering::Relaxed);
}

// ---------------------------------------------------------------------------
// Servidor interno (solo 127.0.0.1)
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize, Deserialize)]
struct RelayInfo {
    port: u16,
    token: String,
}

struct RelayState(Mutex<Option<RelayInfo>>);

type Clients = Arc<Mutex<HashMap<u64, tokio::sync::mpsc::UnboundedSender<Message>>>>;

#[derive(Clone)]
struct Srv {
    app: AppHandle,
    token: Arc<String>,
    clients: Clients,
    next: Arc<AtomicU64>,
}

fn random_token() -> String {
    let mut b = [0u8; 18];
    if getrandom::fill(&mut b).is_err() {
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(7);
        for (i, x) in b.iter_mut().enumerate() {
            *x = ((t >> ((i % 16) * 8)) as u8) ^ (i as u8).wrapping_mul(97);
        }
    }
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// El puerto y la clave quedan guardados: así el link que pegaste en OBS sigue andando
fn load_or_create_relay(app: &AppHandle) -> Option<(std::net::TcpListener, RelayInfo)> {
    let dir = app.path().app_config_dir().ok();
    let file = dir.as_ref().map(|d| d.join("servidor.json"));
    let saved: Option<RelayInfo> = file
        .as_ref()
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .filter(|r: &RelayInfo| r.token.len() >= 24 && r.token.chars().all(|c| c.is_ascii_hexdigit()));
    let token = saved.as_ref().map(|r| r.token.clone()).unwrap_or_else(random_token);
    let mut ports: Vec<u16> = Vec::new();
    if let Some(r) = &saved {
        ports.push(r.port);
    }
    ports.extend(17321..17341);
    for p in ports {
        if let Ok(l) = std::net::TcpListener::bind(("127.0.0.1", p)) {
            let info = RelayInfo { port: p, token };
            if saved.as_ref().map(|s| s.port != p || s.token != info.token).unwrap_or(true) {
                if let (Some(d), Some(f)) = (&dir, &file) {
                    let _ = std::fs::create_dir_all(d);
                    let _ = std::fs::write(f, serde_json::to_string(&info).unwrap_or_default());
                }
            }
            return Some((l, info));
        }
    }
    None
}

#[derive(Deserialize)]
struct WsQuery {
    k: Option<String>,
}

fn same_secret(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

async fn ws_handler(State(s): State<Srv>, Query(q): Query<WsQuery>, up: WebSocketUpgrade) -> Response {
    if !q.k.as_deref().map(|k| same_secret(k, &s.token)).unwrap_or(false) {
        return StatusCode::FORBIDDEN.into_response();
    }
    up.max_message_size(80 << 20)
        .max_frame_size(80 << 20)
        .on_upgrade(move |sock| ws_client(s, sock))
}

/// Cada mensaje que llega se reparte a los demás conectados (el panel, las fuentes de OBS)
async fn ws_client(s: Srv, sock: WebSocket) {
    let (mut tx, mut rx) = sock.split();
    let (ctx, mut crx) = tokio::sync::mpsc::unbounded_channel::<Message>();
    let id = s.next.fetch_add(1, Ordering::Relaxed);
    s.clients.lock().unwrap().insert(id, ctx);
    let writer = tokio::spawn(async move {
        while let Some(m) = crx.recv().await {
            if tx.send(m).await.is_err() {
                break;
            }
        }
    });
    while let Some(Ok(m)) = rx.next().await {
        match m {
            Message::Text(t) => {
                let cl = s.clients.lock().unwrap();
                for (cid, c) in cl.iter() {
                    if *cid != id {
                        let _ = c.send(Message::Text(t.clone()));
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    s.clients.lock().unwrap().remove(&id);
    writer.abort();
}

/// Archivos de la app (para la fuente de navegador: http://127.0.0.1:PUERTO/obs.html#...)
async fn file_handler(State(s): State<Srv>, uri: Uri) -> Response {
    let mut path = uri.path().trim_start_matches('/').to_string();
    if path.is_empty() {
        path = "obs.html".into();
    }
    if path.contains("..") || path.contains('\\') || path == "migrar.html" {
        return StatusCode::NOT_FOUND.into_response();
    }
    match s.app.asset_resolver().get(path) {
        Some(a) => (
            [
                (header::CONTENT_TYPE, a.mime_type),
                (header::CACHE_CONTROL, "no-cache".to_string()),
                (header::X_CONTENT_TYPE_OPTIONS, "nosniff".to_string()),
            ],
            a.bytes,
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

fn start_server(app: &AppHandle) -> Option<RelayInfo> {
    let (listener, info) = load_or_create_relay(app)?;
    listener.set_nonblocking(true).ok()?;
    let srv = Srv {
        app: app.clone(),
        token: Arc::new(info.token.clone()),
        clients: Arc::new(Mutex::new(HashMap::new())),
        next: Arc::new(AtomicU64::new(1)),
    };
    tauri::async_runtime::spawn(async move {
        let Ok(l) = tokio::net::TcpListener::from_std(listener) else { return };
        let router = Router::new()
            .route("/ws", get(ws_handler))
            .fallback(get(file_handler))
            .with_state(srv);
        let _ = axum::serve(l, router).await;
    });
    Some(info)
}

#[tauri::command]
fn relay_info(st: tauri::State<RelayState>) -> Option<RelayInfo> {
    st.0.lock().unwrap().clone()
}

// ---------------------------------------------------------------------------
// Traer los datos de la versión anterior (la que abría Google Chrome)
// Los datos de esa versión quedaron dentro del perfil de Chrome. Se abre esa versión una vez con
// una página que los junta y los manda al panel por el servidor interno.
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct LegacyInfo {
    found: bool,
    chrome: bool,
}

#[cfg(windows)]
fn legacy_dir() -> Option<std::path::PathBuf> {
    let d = std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("StreamDonations");
    if d.join("perfil").join("Default").is_dir() {
        Some(d)
    } else {
        None
    }
}

#[cfg(windows)]
fn find_chrome() -> Option<std::path::PathBuf> {
    let mut c = Vec::new();
    for var in ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Some(v) = std::env::var_os(var) {
            c.push(std::path::PathBuf::from(v).join("Google\\Chrome\\Application\\chrome.exe"));
        }
    }
    c.into_iter().find(|p| p.is_file())
}

#[tauri::command]
fn legacy_info() -> LegacyInfo {
    #[cfg(windows)]
    {
        LegacyInfo { found: legacy_dir().is_some(), chrome: find_chrome().is_some() }
    }
    #[cfg(not(windows))]
    {
        LegacyInfo { found: false, chrome: false }
    }
}

#[tauri::command]
fn legacy_migrate(app: AppHandle, st: tauri::State<RelayState>) -> Result<(), String> {
    let info = st.0.lock().unwrap().clone().ok_or("El servidor interno no arrancó")?;
    #[cfg(windows)]
    {
        let dir = legacy_dir().ok_or("No encontré la versión anterior")?;
        let chrome = find_chrome().ok_or("No encontré Google Chrome")?;
        let page = app
            .asset_resolver()
            .get("migrar.html".into())
            .ok_or("Falta migrar.html")?;
        let target = dir.join("migrar-v2.html");
        std::fs::write(&target, page.bytes).map_err(|e| e.to_string())?;
        let mut url = Url::from_file_path(&target).map_err(|_| "Ruta inválida".to_string())?;
        url.set_fragment(Some(&format!("port={}&k={}", info.port, info.token)));
        std::process::Command::new(chrome)
            .arg(format!("--user-data-dir={}", dir.join("perfil").display()))
            .arg(format!("--app={url}"))
            .arg("--no-first-run")
            .arg("--no-default-browser-check")
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, info);
        Err("Solo en Windows".into())
    }
}

// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .manage(RelayState(Mutex::new(None)))
        .manage(voz::VozState::new())
        .invoke_handler(tauri::generate_handler![
            relay_info,
            legacy_info,
            legacy_migrate,
            set_close_to_tray,
            debug_log,
            voz::voz_status,
            voz::voz_install,
            voz::voz_remove,
            voz::voz_synth,
            actualizar::update_install
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let info = start_server(&handle);
            *app.state::<RelayState>().0.lock().unwrap() = info;

            let b = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::App("index.html".into()))
                .title("StreamDonations")
                .inner_size(1280.0, 800.0)
                .min_inner_size(820.0, 560.0)
                .maximized(true);
            #[cfg(windows)]
            let b = b.additional_browser_args(BROWSER_ARGS);
            let main = with_handlers(b, &handle).build()?;
            #[cfg(debug_assertions)]
            debug_eval_loop(main.clone());
            let win = main.clone();
            main.on_window_event(move |e| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                    if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                        api.prevent_close();
                        let _ = win.hide();
                    } else {
                        // Al cerrar el panel se cierran también las otras ventanas (Modo OBS, ayuda)
                        win.app_handle().exit(0);
                    }
                }
            });

            let show = MenuItem::with_id(app, "show", "Mostrar StreamDonations", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("StreamDonations")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("no se pudo abrir StreamDonations");
}
