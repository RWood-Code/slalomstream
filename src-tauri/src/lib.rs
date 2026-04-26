use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct SidecarState {
    child: Mutex<Option<CommandChild>>,
    /// Set to true once the app begins its shutdown sequence.
    /// Prevents the crash-restart loop from firing after an intentional kill.
    shutting_down: AtomicBool,
}

impl SidecarState {
    fn new() -> Self {
        Self {
            child: Mutex::new(None),
            shutting_down: AtomicBool::new(false),
        }
    }
}

/// Returns the app data directory, creating it if needed.
fn get_app_data_dir(app: &AppHandle) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("Failed to resolve app data dir");
    std::fs::create_dir_all(&dir).ok();
    dir
}

/// Spawn the api-server sidecar.  Returns true on success.
///
/// In production the sidecar also serves the bundled frontend static files
/// (passed via SERVE_STATIC + STATIC_DIR env vars) so that the Tauri window
/// can load `http://localhost:3000` without cross-origin issues.
fn spawn_sidecar(app: &AppHandle) -> bool {
    let state = app.state::<Arc<SidecarState>>();

    // Do not restart if we are shutting down
    if state.shutting_down.load(Ordering::SeqCst) {
        eprintln!("[Sidecar] Shutdown in progress — not restarting");
        return false;
    }

    let data_dir = get_app_data_dir(app);
    let db_data_dir = data_dir.join("db");
    let pglite_data_dir = data_dir.join("pglite");

    std::fs::create_dir_all(&db_data_dir).ok();
    std::fs::create_dir_all(&pglite_data_dir).ok();

    const PORT: &str = "3000";

    let resource_dir = app.path().resource_dir().ok();

    // Locate bundled static files (only present in production Tauri builds).
    let static_dir = resource_dir
        .as_ref()
        .map(|d| d.join("static"))
        .filter(|p| p.exists());

    // Locate the pglite resource bundle so the SEA sidecar can resolve
    // `require('@electric-sql/pglite')` without a local node_modules directory.
    // NODE_PATH points to the directory that contains `@electric-sql/pglite/`.
    let pglite_node_path = resource_dir
        .as_ref()
        .map(|d| d.join("pglite"))
        .filter(|p| p.exists());

    let mut cmd = app
        .shell()
        .sidecar("api-server")
        .expect("Failed to find api-server sidecar")
        .env("PORT", PORT)
        .env("DB_DATA_DIR", db_data_dir.to_string_lossy().to_string())
        .env(
            "PGLITE_DATA_DIR",
            pglite_data_dir.to_string_lossy().to_string(),
        )
        .env("NODE_ENV", "production");

    if let Some(ref node_path) = pglite_node_path {
        cmd = cmd.env("NODE_PATH", node_path.to_string_lossy().to_string());
    }

    if let Some(ref static_path) = static_dir {
        cmd = cmd
            .env("SERVE_STATIC", "true")
            .env("STATIC_DIR", static_path.to_string_lossy().to_string());
    }

    match cmd.spawn() {
        Ok((rx, child)) => {
            {
                let mut guard = state.child.lock().expect("Failed to lock sidecar state");
                *guard = Some(child);
            }
            eprintln!("[Sidecar] api-server started on port {PORT}");

            // Monitor sidecar output; auto-restart on unexpected termination.
            let app_handle = app.clone();
            let state_for_monitor = state.inner().clone();
            tauri::async_runtime::spawn(async move {
                let mut rx = rx;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let s = String::from_utf8_lossy(&line);
                            eprintln!("[Sidecar] {}", s.trim_end());
                        }
                        CommandEvent::Stderr(line) => {
                            let s = String::from_utf8_lossy(&line);
                            eprintln!("[Sidecar:err] {}", s.trim_end());
                        }
                        CommandEvent::Terminated(payload) => {
                            // Check the shutdown flag before scheduling a restart
                            if state_for_monitor.shutting_down.load(Ordering::SeqCst) {
                                eprintln!(
                                    "[Sidecar] api-server stopped (shutdown, code: {:?})",
                                    payload.code
                                );
                            } else {
                                eprintln!(
                                    "[Sidecar] api-server crashed (code: {:?}). Restarting in 2s…",
                                    payload.code
                                );
                                let restart_handle = app_handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    tokio::time::sleep(Duration::from_secs(2)).await;
                                    spawn_sidecar(&restart_handle);
                                });
                            }
                            break;
                        }
                        _ => {}
                    }
                }
            });

            true
        }
        Err(e) => {
            eprintln!("[Sidecar] Failed to spawn api-server: {e}");
            false
        }
    }
}

fn kill_sidecar(app: &AppHandle) {
    let state = app.state::<Arc<SidecarState>>();
    // Signal that we are shutting down BEFORE killing the process so the
    // monitor task sees the flag before processing the Terminated event.
    state.shutting_down.store(true, Ordering::SeqCst);

    let mut guard = state.child.lock().expect("Failed to lock sidecar state");
    if let Some(child) = guard.take() {
        child.kill().ok();
        eprintln!("[Sidecar] api-server stopped");
    }
}

#[tauri::command]
fn get_server_port() -> String {
    "3000".to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Arc::new(SidecarState::new()))
        .setup(|app| {
            let handle = app.handle().clone();
            // In debug / dev mode (`pnpm tauri dev`) the api-server is started
            // by beforeDevCommand so we must NOT also spawn it as a sidecar —
            // that would cause a port-3000 conflict.  The sidecar is only
            // managed at runtime in production (release) builds.
            #[cfg(not(debug_assertions))]
            spawn_sidecar(&handle);

            // Check for updates 5 seconds after startup so it does not delay
            // the initial window paint.
            let updater_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(5)).await;
                check_for_updates(updater_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_server_port])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                kill_sidecar(app);
            }
        });
}

async fn check_for_updates(app: AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            eprintln!("[Updater] Not available: {e}");
            return;
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            eprintln!("[Updater] New version available: {}", update.version);
            use tauri_plugin_dialog::DialogExt;
            let msg = format!(
                "SlalomStream {} is available (you have {}).\nInstall now and restart?",
                update.version, update.current_version
            );
            app.dialog()
                .message(msg)
                .title("Update Available")
                .ok_button_label("Install & Restart")
                .cancel_button_label("Later")
                .show(move |confirmed| {
                    if confirmed {
                        let app_for_restart = app.clone();
                        tauri::async_runtime::spawn(async move {
                            match update
                                .download_and_install(|_, _| {}, || {})
                                .await
                            {
                                Ok(()) => {
                                    eprintln!("[Updater] Install complete — restarting");
                                    app_for_restart.restart();
                                }
                                Err(e) => {
                                    eprintln!("[Updater] Install failed: {e}");
                                }
                            }
                        });
                    }
                });
        }
        Ok(None) => {
            eprintln!("[Updater] App is up to date");
        }
        Err(e) => {
            eprintln!("[Updater] Check failed: {e}");
        }
    }
}
