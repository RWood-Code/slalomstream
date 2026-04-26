use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Path to the flag file that the middleware reads to know if the tunnel is active.
/// Only the Rust process creates/deletes this file — it cannot be manipulated via
/// any HTTP endpoint, so it acts as a trusted local signal.
fn tunnel_flag_path() -> std::path::PathBuf {
    std::env::temp_dir().join("slalomstream-tunnel-active")
}

fn set_tunnel_flag(active: bool) {
    let path = tunnel_flag_path();
    if active {
        let _ = std::fs::write(&path, b"");
    } else {
        let _ = std::fs::remove_file(&path);
    }
}

// ─── API Server sidecar state ─────────────────────────────────────────────────

struct SidecarState {
    child: Mutex<Option<CommandChild>>,
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

// ─── FFmpeg recording state ───────────────────────────────────────────────────

struct FfmpegState {
    child: Mutex<Option<CommandChild>>,
    /// Stop flag for the in-process MJPEG HTTP server that runs during recording
    recording_preview_stop_flag: Mutex<Option<Arc<AtomicBool>>>,
}

impl FfmpegState {
    fn new() -> Self {
        Self {
            child: Mutex::new(None),
            recording_preview_stop_flag: Mutex::new(None),
        }
    }
}

// ─── FFmpeg live preview state ────────────────────────────────────────────────

struct FfmpegPreviewState {
    child: Mutex<Option<CommandChild>>,
    // Signals the HTTP server thread to exit
    stop_flag: Mutex<Option<Arc<std::sync::atomic::AtomicBool>>>,
}

impl FfmpegPreviewState {
    fn new() -> Self {
        Self {
            child: Mutex::new(None),
            stop_flag: Mutex::new(None),
        }
    }
}

// ─── Cloudflare Tunnel state ─────────────────────────────────────────────────

struct TunnelState {
    child: Mutex<Option<CommandChild>>,
    active_url: Mutex<Option<String>>,
    shutting_down: AtomicBool,
}

impl TunnelState {
    fn new() -> Self {
        Self {
            child: Mutex::new(None),
            active_url: Mutex::new(None),
            shutting_down: AtomicBool::new(false),
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn get_app_data_dir(app: &AppHandle) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("Failed to resolve app data dir");
    std::fs::create_dir_all(&dir).ok();
    dir
}

fn folder_config_path(app: &AppHandle) -> std::path::PathBuf {
    get_app_data_dir(app).join("folder_config.json")
}

// ─── API Server sidecar management ───────────────────────────────────────────

fn spawn_sidecar(app: &AppHandle) -> bool {
    let state = app.state::<Arc<SidecarState>>();

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

    let static_dir = resource_dir
        .as_ref()
        .map(|d| d.join("static"))
        .filter(|p| p.exists());

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
    state.shutting_down.store(true, Ordering::SeqCst);

    let mut guard = state.child.lock().expect("Failed to lock sidecar state");
    if let Some(child) = guard.take() {
        child.kill().ok();
        eprintln!("[Sidecar] api-server stopped");
    }
}

// ─── Basic commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn get_server_port() -> String {
    "3000".to_string()
}

// ─── Native folder picker ─────────────────────────────────────────────────────

#[tauri::command]
async fn choose_save_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder = app
        .dialog()
        .file()
        .blocking_pick_folder();

    match folder {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}

// ─── Folder config persistence ────────────────────────────────────────────────

#[tauri::command]
fn get_folder_config(app: AppHandle) -> serde_json::Value {
    let path = folder_config_path(&app);
    if let Ok(contents) = std::fs::read_to_string(&path) {
        serde_json::from_str(&contents).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    }
}

#[tauri::command]
fn set_folder_config(app: AppHandle, config: serde_json::Value) -> Result<(), String> {
    let path = folder_config_path(&app);
    let contents = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Serialization error: {e}"))?;
    std::fs::write(&path, contents)
        .map_err(|e| format!("Write error: {e}"))
}

// ─── Disk space ───────────────────────────────────────────────────────────────

#[tauri::command]
fn get_disk_space(path: String) -> Result<u64, String> {
    use sysinfo::Disks;

    let target = std::path::Path::new(&path);
    let disks = Disks::new_with_refreshed_list();

    let best = disks
        .iter()
        .filter(|d| target.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len());

    match best {
        Some(disk) => Ok(disk.available_space()),
        None => Err(format!("No disk found for path: {path}")),
    }
}

// ─── Path accessibility ───────────────────────────────────────────────────────

#[tauri::command]
fn check_path_accessible(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

// ─── File reading ─────────────────────────────────────────────────────────────

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    // Restrict to .markers.json sidecars only to limit filesystem exposure.
    if !path.ends_with(".markers.json") {
        return Err("read_text_file is restricted to .markers.json files".to_string());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Read error: {e}"))
}

// ─── Recording library ────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
struct RecordingEntry {
    path: String,
    filename: String,
    has_markers: bool,
    size_bytes: u64,
    modified_secs: u64,
}

#[tauri::command]
fn list_recordings(folder: String) -> Result<Vec<RecordingEntry>, String> {
    let dir = std::path::Path::new(&folder);
    if !dir.is_dir() {
        return Ok(vec![]);
    }

    let read_dir =
        std::fs::read_dir(dir).map_err(|e| format!("Cannot read directory: {e}"))?;

    let mut entries: Vec<RecordingEntry> = Vec::new();

    for entry in read_dir.flatten() {
        let path = entry.path();

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if ext != "mp4" && ext != "webm" {
            continue;
        }

        let filename = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        let meta = entry.metadata().ok();
        let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_secs = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&filename)
            .to_string();
        let markers_path = dir.join(format!("{}.markers.json", stem));
        let has_markers = markers_path.exists();

        entries.push(RecordingEntry {
            path: path.to_string_lossy().to_string(),
            filename,
            has_markers,
            size_bytes,
            modified_secs,
        });
    }

    entries.sort_by(|a, b| b.modified_secs.cmp(&a.modified_secs));

    Ok(entries)
}

// ─── Recording deletion ───────────────────────────────────────────────────────

#[tauri::command]
fn delete_recording(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext != "mp4" && ext != "webm" {
        return Err("delete_recording only accepts .mp4 or .webm files".to_string());
    }
    std::fs::remove_file(p).map_err(|e| format!("Delete error: {e}"))?;
    if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
        if let Some(parent) = p.parent() {
            let markers = parent.join(format!("{}.markers.json", stem));
            if markers.exists() {
                std::fs::remove_file(&markers).ok();
            }
        }
    }
    Ok(())
}

// ─── File writing ─────────────────────────────────────────────────────────────

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir error: {e}"))?;
    }
    std::fs::write(&path, content).map_err(|e| format!("Write error: {e}"))
}

#[tauri::command]
fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir error: {e}"))?;
    }
    std::fs::write(&path, data).map_err(|e| format!("Write error: {e}"))
}

#[tauri::command]
fn copy_file(src: String, dst: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dst).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir error: {e}"))?;
    }
    std::fs::copy(&src, &dst)
        .map(|_| ())
        .map_err(|e| format!("Copy error: {e}"))
}

// ─── FFmpeg device enumeration ────────────────────────────────────────────────

#[tauri::command]
async fn list_video_devices(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let output = run_ffmpeg_device_list(&app, "video").await?;
    let devices = parse_ffmpeg_devices(&output, "video");
    Ok(devices)
}

#[tauri::command]
async fn list_audio_devices(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let output = run_ffmpeg_device_list(&app, "audio").await?;
    let devices = parse_ffmpeg_devices(&output, "audio");
    Ok(devices)
}

async fn run_ffmpeg_device_list(app: &AppHandle, _kind: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let args = vec![
        "-list_devices".to_string(),
        "true".to_string(),
        "-f".to_string(),
        "dshow".to_string(),
        "-i".to_string(),
        "dummy".to_string(),
    ];

    #[cfg(target_os = "macos")]
    let args = vec![
        "-f".to_string(),
        "avfoundation".to_string(),
        "-list_devices".to_string(),
        "true".to_string(),
        "-i".to_string(),
        "\"\"".to_string(),
    ];

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let args = vec![
        "-list_devices".to_string(),
        "true".to_string(),
        "-f".to_string(),
        "v4l2".to_string(),
        "-i".to_string(),
        "/dev/video0".to_string(),
    ];

    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("FFmpeg sidecar not found: {e}"))?;

    let mut built = cmd;
    for arg in &args {
        built = built.args([arg]);
    }

    match built.output().await {
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            Ok(stderr)
        }
        Err(e) => Err(format!("FFmpeg execution error: {e}")),
    }
}

fn parse_ffmpeg_devices(output: &str, kind: &str) -> Vec<serde_json::Value> {
    let mut devices = Vec::new();
    let mut in_section = false;
    let section_marker = if kind == "video" { "video" } else { "audio" };

    for line in output.lines() {
        let lower = line.to_lowercase();

        if lower.contains("directshow") || lower.contains("avfoundation") {
            if lower.contains(section_marker) {
                in_section = true;
            } else {
                in_section = false;
            }
        }

        if in_section {
            if let Some(start) = line.find('"') {
                if let Some(end) = line[start + 1..].find('"') {
                    let name = line[start + 1..start + 1 + end].to_string();
                    if !name.is_empty() {
                        let id = format!("{}:{}", kind, devices.len());
                        devices.push(serde_json::json!({
                            "deviceId": id,
                            "label": name,
                            "native_name": name,
                        }));
                    }
                }
            }
        }
    }

    devices
}

// ─── FFmpeg recording ─────────────────────────────────────────────────────────

/// Common MJPEG preview output args (appended after the MP4 output in all platforms).
/// Scale is handled inside filter_complex (split → scale[vpreview]) so we do NOT
/// use -vf here, which would conflict with -filter_complex named streams.
fn mjpeg_preview_output_args() -> Vec<String> {
    vec![
        "-map".to_string(), "[vpreview]".to_string(),
        "-an".to_string(),
        "-c:v".to_string(), "mjpeg".to_string(),
        "-q:v".to_string(), "8".to_string(),
        "-f".to_string(), "mpjpeg".to_string(),
        "pipe:1".to_string(),
    ]
}

/// Build FFmpeg argv for concurrent recording + MJPEG preview via filter_complex split.
/// The video is duplicated: [vrecord] → H.264 MP4 file, [vpreview] → MJPEG stdout.
/// A single FFmpeg process handles both outputs, resolving the exclusive-device conflict
/// that would arise from running separate recording and preview processes.

#[cfg(target_os = "windows")]
fn build_recording_argv(
    device_name: &str,
    audio_device_name: Option<&str>,
    output_path: &str,
) -> Vec<String> {
    let mut args = vec![
        "-f".to_string(), "dshow".to_string(),
        "-framerate".to_string(), "60".to_string(),
        "-video_size".to_string(), "1920x1080".to_string(),
        "-i".to_string(), format!("video={}", device_name),
    ];
    if let Some(adev) = audio_device_name {
        args.extend([
            "-f".to_string(), "dshow".to_string(),
            "-i".to_string(), format!("audio={}", adev),
        ]);
    }
    args.extend([
        "-filter_complex".to_string(), "[0:v]split=2[vrecord][vp_raw];[vp_raw]scale=1920:1080[vpreview]".to_string(),
        "-map".to_string(), "[vrecord]".to_string(),
    ]);
    if let Some(_adev) = audio_device_name {
        args.extend([
            "-map".to_string(), "1:a".to_string(),
            "-c:a".to_string(), "aac".to_string(),
            "-b:a".to_string(), "192k".to_string(),
        ]);
    } else {
        args.push("-an".to_string());
    }
    args.extend([
        "-c:v".to_string(), "libx264".to_string(),
        "-preset".to_string(), "veryfast".to_string(),
        "-crf".to_string(), "18".to_string(),
        "-pix_fmt".to_string(), "yuv420p".to_string(),
        "-movflags".to_string(), "+faststart".to_string(),
        "-y".to_string(),
        output_path.to_string(),
    ]);
    args.extend(mjpeg_preview_output_args());
    args
}

#[cfg(target_os = "macos")]
fn build_recording_argv(
    device_name: &str,
    audio_device_name: Option<&str>,
    output_path: &str,
) -> Vec<String> {
    let av_input = if let Some(adev) = audio_device_name {
        format!("{}:{}", device_name, adev)
    } else {
        format!("{}:", device_name)
    };
    let mut args = vec![
        "-f".to_string(), "avfoundation".to_string(),
        "-framerate".to_string(), "60".to_string(),
        "-video_size".to_string(), "1920x1080".to_string(),
        "-i".to_string(), av_input,
        "-filter_complex".to_string(), "[0:v]split=2[vrecord][vp_raw];[vp_raw]scale=1920:1080[vpreview]".to_string(),
        "-map".to_string(), "[vrecord]".to_string(),
    ];
    if audio_device_name.is_some() {
        // avfoundation combined input: audio is 0:a
        args.extend([
            "-map".to_string(), "0:a".to_string(),
            "-c:a".to_string(), "aac".to_string(),
            "-b:a".to_string(), "192k".to_string(),
        ]);
    } else {
        args.push("-an".to_string());
    }
    args.extend([
        "-c:v".to_string(), "libx264".to_string(),
        "-preset".to_string(), "veryfast".to_string(),
        "-crf".to_string(), "18".to_string(),
        "-pix_fmt".to_string(), "yuv420p".to_string(),
        "-movflags".to_string(), "+faststart".to_string(),
        "-y".to_string(),
        output_path.to_string(),
    ]);
    args.extend(mjpeg_preview_output_args());
    args
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn build_recording_argv(
    device_name: &str,
    _audio_device_name: Option<&str>,
    output_path: &str,
) -> Vec<String> {
    let mut args = vec![
        "-f".to_string(), "v4l2".to_string(),
        "-framerate".to_string(), "60".to_string(),
        "-video_size".to_string(), "1920x1080".to_string(),
        "-i".to_string(), device_name.to_string(),
        "-filter_complex".to_string(), "[0:v]split=2[vrecord][vp_raw];[vp_raw]scale=1920:1080[vpreview]".to_string(),
        "-map".to_string(), "[vrecord]".to_string(),
        "-an".to_string(),
        "-c:v".to_string(), "libx264".to_string(),
        "-preset".to_string(), "veryfast".to_string(),
        "-crf".to_string(), "18".to_string(),
        "-pix_fmt".to_string(), "yuv420p".to_string(),
        "-movflags".to_string(), "+faststart".to_string(),
        "-y".to_string(),
        output_path.to_string(),
    ];
    args.extend(mjpeg_preview_output_args());
    args
}

#[tauri::command]
async fn start_ffmpeg_recording(
    app: AppHandle,
    output_path: String,
    device_name: String,
    audio_device_name: Option<String>,
    preview_port: u16,
    state: tauri::State<'_, Arc<FfmpegState>>,
) -> Result<(), String> {
    {
        let guard = state.child.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("FFmpeg recording already in progress".to_string());
        }
    }

    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let ffmpeg_args = build_recording_argv(
        &device_name,
        audio_device_name.as_deref(),
        &output_path,
    );

    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("FFmpeg sidecar not found: {e}"))?
        .args(&ffmpeg_args);

    let (mut rx, child) = cmd.spawn().map_err(|e| format!("Failed to start FFmpeg: {e}"))?;

    // mpsc channel bridges async tokio (FFmpeg stdout events) → sync thread (HTTP server)
    let (frame_tx, frame_rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(60);

    // Tokio task: forward stdout bytes (MJPEG stream) to the HTTP server thread
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(bytes) = event {
                if frame_tx.send(bytes).is_err() {
                    break;
                }
            }
        }
    });

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_clone = stop_flag.clone();

    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
        let mut sf = state.recording_preview_stop_flag.lock().map_err(|e| e.to_string())?;
        *sf = Some(stop_flag);
    }

    // Spawn the embedded MJPEG HTTP server for the recording preview
    std::thread::spawn(move || {
        use std::io::Write;
        let listener = match std::net::TcpListener::bind(format!("127.0.0.1:{}", preview_port)) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[RecordingPreview] Failed to bind port {}: {}", preview_port, e);
                return;
            }
        };
        listener.set_nonblocking(true).ok();
        eprintln!("[RecordingPreview] MJPEG HTTP server on 127.0.0.1:{}", preview_port);

        'accept: loop {
            if stop_flag_clone.load(Ordering::SeqCst) { break; }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream.set_nonblocking(false).ok();
                    let header = concat!(
                        "HTTP/1.0 200 OK\r\n",
                        "Content-Type: multipart/x-mixed-replace;boundary=ffmpeg\r\n",
                        "Cache-Control: no-cache, no-store, must-revalidate\r\n",
                        "Pragma: no-cache\r\n",
                        "\r\n"
                    );
                    if stream.write_all(header.as_bytes()).is_err() { continue 'accept; }
                    loop {
                        if stop_flag_clone.load(Ordering::SeqCst) { break 'accept; }
                        match frame_rx.recv_timeout(Duration::from_secs(5)) {
                            Ok(bytes) => {
                                if stream.write_all(&bytes).is_err() { break; }
                            }
                            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                            Err(_) => break 'accept,
                        }
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(20));
                }
                Err(_) => break,
            }
        }
        eprintln!("[RecordingPreview] MJPEG server stopped");
    });

    eprintln!("[FFmpeg] Recording started with embedded MJPEG preview on port {}", preview_port);
    Ok(())
}

fn stop_ffmpeg_child(mut child: CommandChild) {
    // Send 'q' + newline to FFmpeg's stdin for graceful shutdown so it can flush
    // the MP4 container metadata (moov atom) before exiting.
    // If stdin write fails (e.g. pipe already closed), fall back to SIGTERM/kill.
    if child.write(b"q\n").is_err() {
        child.kill().ok();
    }
    eprintln!("[FFmpeg] Recording stopped (graceful)");
}

#[tauri::command]
fn stop_ffmpeg_recording(
    state: tauri::State<'_, Arc<FfmpegState>>,
) -> Result<(), String> {
    // Signal the embedded MJPEG HTTP server to stop accepting new connections
    if let Ok(mut sf) = state.recording_preview_stop_flag.lock() {
        if let Some(flag) = sf.take() {
            flag.store(true, Ordering::SeqCst);
        }
    }
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.take() {
        stop_ffmpeg_child(child);
    }
    Ok(())
}

// ─── FFmpeg live preview (MJPEG over HTTP loopback) ──────────────────────────
//
// Runs FFmpeg writing -f mpjpeg to its stdout, which is forwarded over a raw
// HTTP MJPEG stream on 127.0.0.1:preview_port.  The React WebView consumes it
// via <img src="http://127.0.0.1:PORT/"> — browsers natively support MJPEG in
// <img> tags via multipart/x-mixed-replace, so no JS decoding is needed.

#[tauri::command]
async fn start_ffmpeg_preview(
    app: AppHandle,
    device_name: String,
    preview_port: u16,
    state: tauri::State<'_, Arc<FfmpegPreviewState>>,
) -> Result<(), String> {
    {
        let guard = state.child.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("Preview already running".to_string());
        }
    }

    // Build FFmpeg argv for MJPEG preview (input options before -i).
    // Preview at 30fps 1920x1080 — sufficient for live view without the overhead
    // of full 60fps, while meeting the 1080p live-panel requirement.
    #[cfg(target_os = "windows")]
    let ffmpeg_args: Vec<String> = vec![
        "-f".to_string(), "dshow".to_string(),
        "-framerate".to_string(), "30".to_string(),
        "-video_size".to_string(), "1920x1080".to_string(),
        "-i".to_string(), format!("video={}", device_name),
        "-an".to_string(),
        "-f".to_string(), "mpjpeg".to_string(),
        "-q:v".to_string(), "8".to_string(),
        "pipe:1".to_string(),
    ];

    #[cfg(target_os = "macos")]
    let ffmpeg_args: Vec<String> = vec![
        "-f".to_string(), "avfoundation".to_string(),
        "-framerate".to_string(), "30".to_string(),
        "-video_size".to_string(), "1920x1080".to_string(),
        "-i".to_string(), format!("{}:", device_name),
        "-an".to_string(),
        "-f".to_string(), "mpjpeg".to_string(),
        "-q:v".to_string(), "8".to_string(),
        "pipe:1".to_string(),
    ];

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let ffmpeg_args: Vec<String> = vec![
        "-f".to_string(), "v4l2".to_string(),
        "-framerate".to_string(), "30".to_string(),
        "-video_size".to_string(), "1920x1080".to_string(),
        "-i".to_string(), device_name.clone(),
        "-an".to_string(),
        "-f".to_string(), "mpjpeg".to_string(),
        "-q:v".to_string(), "8".to_string(),
        "pipe:1".to_string(),
    ];

    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("FFmpeg sidecar not found: {e}"))?
        .args(&ffmpeg_args);

    let (mut rx, child) = cmd.spawn().map_err(|e| format!("Failed to start FFmpeg preview: {e}"))?;

    // mpsc channel bridges async tokio (FFmpeg stdout events) → sync thread (HTTP server)
    let (frame_tx, frame_rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(60);

    // Tokio task: forward CommandEvent::Stdout bytes to the sync channel
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(bytes) = event {
                if frame_tx.send(bytes).is_err() {
                    break; // receiver dropped → HTTP server exited
                }
            }
        }
    });

    let stop_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let stop_flag_clone = stop_flag.clone();

    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
        let mut sf = state.stop_flag.lock().map_err(|e| e.to_string())?;
        *sf = Some(stop_flag);
    }

    // Spawn a dedicated OS thread for the HTTP MJPEG server so it can block on accept/recv
    // without interfering with the Tokio runtime.
    std::thread::spawn(move || {
        use std::io::Write;

        let listener = match std::net::TcpListener::bind(format!("127.0.0.1:{}", preview_port)) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[Preview] Failed to bind port {}: {}", preview_port, e);
                return;
            }
        };
        // Non-blocking accept loop so we can check the stop flag.
        listener.set_nonblocking(true).ok();

        eprintln!("[Preview] MJPEG HTTP server on 127.0.0.1:{}", preview_port);

        'accept: loop {
            if stop_flag_clone.load(Ordering::SeqCst) {
                break;
            }
            match listener.accept() {
                Ok((mut stream, _addr)) => {
                    eprintln!("[Preview] Client connected");
                    stream.set_nonblocking(false).ok();

                    // Write HTTP MJPEG response header.  The body is the raw mpjpeg
                    // stream from FFmpeg which already contains the MIME boundaries.
                    // FFmpeg's -f mpjpeg emits "--ffmpeg" boundary tags by default,
                    // so the Content-Type boundary MUST be "ffmpeg" to match.
                    let header = concat!(
                        "HTTP/1.0 200 OK\r\n",
                        "Content-Type: multipart/x-mixed-replace;boundary=ffmpeg\r\n",
                        "Cache-Control: no-cache, no-store, must-revalidate\r\n",
                        "Pragma: no-cache\r\n",
                        "\r\n"
                    );
                    if stream.write_all(header.as_bytes()).is_err() {
                        continue 'accept;
                    }

                    // Pipe FFmpeg stdout bytes directly to the HTTP client.
                    loop {
                        if stop_flag_clone.load(Ordering::SeqCst) {
                            break 'accept;
                        }
                        match frame_rx.recv_timeout(std::time::Duration::from_secs(5)) {
                            Ok(bytes) => {
                                if stream.write_all(&bytes).is_err() {
                                    // Client disconnected; go back to waiting for next accept
                                    break;
                                }
                            }
                            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                                // No bytes yet; check stop flag and loop
                                continue;
                            }
                            Err(_) => break 'accept, // sender dropped
                        }
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                Err(_) => break,
            }
        }
        eprintln!("[Preview] MJPEG HTTP server stopped");
    });

    eprintln!("[FFmpeg] Preview started on port {}", preview_port);
    Ok(())
}

fn stop_ffmpeg_preview_inner(state: &Arc<FfmpegPreviewState>) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.take() {
            stop_ffmpeg_child(child);
        }
    }
    if let Ok(mut sf) = state.stop_flag.lock() {
        if let Some(flag) = sf.take() {
            flag.store(true, Ordering::SeqCst);
        }
    }
}

#[tauri::command]
fn stop_ffmpeg_preview(state: tauri::State<'_, Arc<FfmpegPreviewState>>) -> Result<(), String> {
    stop_ffmpeg_preview_inner(&state);
    eprintln!("[FFmpeg] Preview stopped");
    Ok(())
}

// ─── FFmpeg clip trimming ─────────────────────────────────────────────────────

#[tauri::command]
async fn trim_video(
    app: AppHandle,
    input_path: String,
    output_path: String,
    start_sec: f64,
    end_sec: f64,
) -> Result<(), String> {
    if end_sec <= start_sec {
        return Err(format!(
            "Invalid trim range: start={start_sec} end={end_sec}"
        ));
    }

    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir error: {e}"))?;
    }

    let duration = end_sec - start_sec;

    let ffmpeg_args: Vec<String> = vec![
        "-ss".to_string(), format!("{:.6}", start_sec),
        "-i".to_string(), input_path,
        "-t".to_string(), format!("{:.6}", duration),
        "-c".to_string(), "copy".to_string(),
        "-movflags".to_string(), "+faststart".to_string(),
        "-avoid_negative_ts".to_string(), "make_zero".to_string(),
        "-y".to_string(),
        output_path,
    ];

    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("FFmpeg sidecar not found: {e}"))?
        .args(&ffmpeg_args);

    let output = cmd.output().await.map_err(|e| format!("FFmpeg execution error: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg trim failed: {}", stderr.trim()))
    }
}

// ─── Internet connectivity check ─────────────────────────────────────────────

#[tauri::command]
fn check_internet() -> bool {
    use std::net::TcpStream;
    TcpStream::connect_timeout(
        &"1.1.1.1:443".parse().expect("Invalid address"),
        Duration::from_secs(3),
    )
    .is_ok()
}

// ─── Cloudflare Tunnel management ─────────────────────────────────────────────

/// Extract the first HTTPS URL from a cloudflared log line.
fn extract_url_from_line(line: &str) -> Option<String> {
    let idx = line.find("https://")?;
    let rest = &line[idx..];
    let end = rest
        .find(|c: char| c.is_whitespace() || c == '|' || c == '\r' || c == '\n')
        .unwrap_or(rest.len());
    let url = rest[..end].trim_end_matches(|c: char| !c.is_alphanumeric() && c != '/');
    if url.len() > 12 && url.contains('.') {
        Some(url.to_string())
    } else {
        None
    }
}

/// Spawn cloudflared and monitor its output. On unexpected exit, waits 5s and
/// re-spawns automatically (unless `state.shutting_down` is set).
/// Returns Err if the initial spawn fails.
async fn spawn_cloudflared(
    app: AppHandle,
    token: Option<String>,
    state: Arc<TunnelState>,
) -> Result<(), String> {
    let mut cmd = app
        .shell()
        .sidecar("cloudflared")
        .map_err(|e| format!("cloudflared sidecar not found: {e}"))?;

    if let Some(ref t) = token {
        cmd = cmd.args(["tunnel", "--no-autoupdate", "run", "--token", t.as_str()]);
    } else {
        cmd = cmd.args(["tunnel", "--no-autoupdate", "--url", "http://localhost:3000"]);
    }

    let (rx, child) = cmd
        .spawn()
        .map_err(|e| format!("Failed to start cloudflared: {e}"))?;

    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    eprintln!("[Tunnel] cloudflared started");

    let app_handle = app.clone();
    let state_monitor = state.clone();
    let token_for_retry = token.clone();

    tauri::async_runtime::spawn(async move {
        let mut rx = rx;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    let s = String::from_utf8_lossy(&line).to_string();
                    eprintln!("[Tunnel] {}", s.trim_end());

                    // Only emit the URL once
                    let already_have_url = {
                        let guard = state_monitor.active_url.lock().unwrap();
                        guard.is_some()
                    };
                    if already_have_url {
                        continue;
                    }

                    if let Some(url) = extract_url_from_line(&s) {
                        eprintln!("[Tunnel] Assigned URL: {url}");
                        {
                            let mut guard = state_monitor.active_url.lock().unwrap();
                            *guard = Some(url.clone());
                        }
                        // Mark tunnel as active — middleware reads this file
                        set_tunnel_flag(true);
                        // Notify the frontend — it will call PUT /api/settings
                        app_handle
                            .emit("tunnel-url", serde_json::json!({ "url": url }))
                            .ok();
                    }
                }
                CommandEvent::Terminated(payload) => {
                    // Clear process handle, URL, and flag file
                    {
                        let mut guard = state_monitor.active_url.lock().unwrap();
                        *guard = None;
                    }
                    {
                        let mut guard = state_monitor.child.lock().unwrap();
                        *guard = None;
                    }
                    set_tunnel_flag(false);

                    if state_monitor.shutting_down.load(Ordering::SeqCst) {
                        eprintln!("[Tunnel] cloudflared stopped (code: {:?})", payload.code);
                    } else {
                        eprintln!(
                            "[Tunnel] cloudflared exited unexpectedly (code: {:?}). Reconnecting in 5s…",
                            payload.code
                        );
                        // Notify frontend URL is gone (it shows a "reconnecting" state)
                        app_handle
                            .emit("tunnel-stopped", serde_json::json!({ "reconnecting": true }))
                            .ok();

                        // Reconnect after backoff unless shutdown was requested in the meantime.
                        // We do the sleep + guard check in one spawned task, then spawn a second
                        // task for the actual reconnect. This avoids awaiting spawn_cloudflared
                        // inside the outer spawn, which would require the future to be Send (it
                        // isn't, because CommandChild is not Send across an await point).
                        let retry_handle = app_handle.clone();
                        let retry_state = state_monitor.clone();
                        let retry_token = token_for_retry.clone();
                        tauri::async_runtime::spawn(async move {
                            tokio::time::sleep(Duration::from_secs(5)).await;
                            if retry_state.shutting_down.load(Ordering::SeqCst) {
                                return;
                            }
                            // Guard against a race with another start_tunnel call
                            {
                                let guard = retry_state.child.lock().unwrap();
                                if guard.is_some() {
                                    return;
                                }
                            }
                            eprintln!("[Tunnel] Attempting reconnect…");
                            // Spawn a fresh top-level task for the reconnect so we don't
                            // need to await a non-Send future here.
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = spawn_cloudflared(retry_handle, retry_token, retry_state).await {
                                    eprintln!("[Tunnel] Reconnect failed: {e}");
                                }
                            });
                        });
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn start_tunnel(
    app: AppHandle,
    token: Option<String>,
    state: tauri::State<'_, Arc<TunnelState>>,
) -> Result<(), String> {
    // Prevent double-start
    {
        let guard = state.child.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("Tunnel already running".to_string());
        }
    }

    state.shutting_down.store(false, Ordering::SeqCst);
    spawn_cloudflared(app, token, state.inner().clone()).await
}

#[tauri::command]
async fn stop_tunnel(
    app: AppHandle,
    state: tauri::State<'_, Arc<TunnelState>>,
) -> Result<(), String> {
    state.shutting_down.store(true, Ordering::SeqCst);

    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        if let Some(child) = guard.take() {
            child.kill().ok();
            eprintln!("[Tunnel] cloudflared stopped by user");
        }
    }
    {
        let mut guard = state.active_url.lock().unwrap();
        *guard = None;
    }

    // Frontend listens for this event and clears public_url in settings
    app.emit("tunnel-stopped", serde_json::json!({})).ok();

    Ok(())
}

// ─── App entry point ─────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Arc::new(SidecarState::new()))
        .manage(Arc::new(FfmpegState::new()))
        .manage(Arc::new(FfmpegPreviewState::new()))
        .manage(Arc::new(TunnelState::new()))
        .setup(|app| {
            // Clean up any stale tunnel flag from a previous crash
            set_tunnel_flag(false);

            let handle = app.handle().clone();
            #[cfg(not(debug_assertions))]
            spawn_sidecar(&handle);

            let updater_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(5)).await;
                check_for_updates(updater_handle).await;
            });

            // ── System tray ────────────────────────────────────────────────
            let show_item = MenuItemBuilder::with_id("show", "Show SlalomStream")
                .build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit")
                .build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&quit_item)
                .build()?;

            let tray_icon = tauri::image::Image::from_bytes(
                include_bytes!("../icons/tray-icon-32.png"),
            )
            .expect("tray-icon-32.png is a valid PNG bundled at compile time");

            TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("SlalomStream")
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            win.show().ok();
                            win.set_focus().ok();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_port,
            choose_save_folder,
            get_folder_config,
            set_folder_config,
            get_disk_space,
            check_path_accessible,
            read_text_file,
            write_text_file,
            write_binary_file,
            copy_file,
            list_recordings,
            delete_recording,
            list_video_devices,
            list_audio_devices,
            start_ffmpeg_recording,
            stop_ffmpeg_recording,
            start_ffmpeg_preview,
            stop_ffmpeg_preview,
            trim_video,
            check_internet,
            start_tunnel,
            stop_tunnel,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                kill_sidecar(app);
                // Stop tunnel if active and clear flag file
                let tunnel = app.state::<Arc<TunnelState>>();
                tunnel.shutting_down.store(true, Ordering::SeqCst);
                if let Ok(mut guard) = tunnel.child.lock() {
                    if let Some(child) = guard.take() {
                        child.kill().ok();
                        eprintln!("[Tunnel] cloudflared stopped (app exit)");
                    }
                }
                set_tunnel_flag(false);
                // Gracefully stop any in-progress FFmpeg recording
                let ffmpeg = app.state::<Arc<FfmpegState>>();
                if let Ok(mut guard) = ffmpeg.child.lock() {
                    if let Some(child) = guard.take() {
                        stop_ffmpeg_child(child);
                    }
                }
                // Stop any running FFmpeg preview + its HTTP server
                let preview = app.state::<Arc<FfmpegPreviewState>>();
                stop_ffmpeg_preview_inner(&preview);
            }
        });
}

// ─── Auto-updater ─────────────────────────────────────────────────────────────

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
                .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
                    "Install & Restart".to_string(),
                    "Later".to_string(),
                ))
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
