use std::sync::Mutex;
use std::path::PathBuf;
use tauri::Emitter;
use tauri_plugin_shell::process::CommandChild;
mod sidecar;

struct SidecarState {
    api_child: Mutex<Option<CommandChild>>,
    llm_child: Mutex<Option<CommandChild>>,
    api_port: Mutex<u16>,
    llm_port: Mutex<u16>,
}

const MODEL_FILENAME: &str = "NVIDIA-Nemotron-3-Nano-4B-Q4_K_M.gguf";
const MODEL_URL: &str = "https://huggingface.co/lmstudio-community/NVIDIA-Nemotron-3-Nano-4B-GGUF/resolve/main/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M.gguf";
const MODEL_SIZE_GB: f64 = 2.5;

fn model_path() -> PathBuf {
    // dirs::home_dir() in v5 only uses $HOME env var, which may be unset
    // when the app is launched via macOS LaunchServices (open command).
    // Fall back to getpwuid via std, then /tmp as last resort.
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir())
        .unwrap_or_else(|| std::env::temp_dir());
    home.join(".redactguard/models").join(MODEL_FILENAME)
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        if let Some(child) = self.api_child.lock().unwrap().take() {
            let _ = child.kill();
        }
        if let Some(child) = self.llm_child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

#[tauri::command]
fn get_api_port(state: tauri::State<SidecarState>) -> u16 {
    *state.api_port.lock().unwrap()
}

#[tauri::command]
fn get_llm_port(state: tauri::State<SidecarState>) -> u16 {
    *state.llm_port.lock().unwrap()
}

#[tauri::command]
fn check_model_exists() -> bool {
    model_path().exists()
}

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    downloaded_mb: f64,
    total_mb: f64,
    percent: f64,
}

#[tauri::command]
async fn download_model(handle: tauri::AppHandle) -> Result<(), String> {
    let dest = model_path();
    if dest.exists() {
        return Ok(());
    }

    let dir = dest.parent().unwrap();
    std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create models dir: {}", e))?;

    let partial = dest.with_extension("gguf.part");
    let resume_size = if partial.exists() {
        std::fs::metadata(&partial).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    let client = reqwest::Client::new();
    let mut req = client.get(MODEL_URL);
    if resume_size > 0 {
        req = req.header("Range", format!("bytes={}-", resume_size));
    }

    let response = req.send().await.map_err(|e| format!("Request failed: {}", e))?;
    let content_length = response.content_length().unwrap_or(0);
    let total_bytes = content_length + resume_size;

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(resume_size > 0)
        .write(true)
        .open(&partial)
        .map_err(|e| format!("Cannot open partial file: {}", e))?;

    let mut downloaded = resume_size;
    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        std::io::Write::write_all(&mut file, &chunk)
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;

        let progress = DownloadProgress {
            downloaded_mb: downloaded as f64 / 1024.0 / 1024.0,
            total_mb: total_bytes as f64 / 1024.0 / 1024.0,
            percent: if total_bytes > 0 { downloaded as f64 / total_bytes as f64 * 100.0 } else { 0.0 },
        };
        let _ = handle.emit("model-download-progress", progress);
    }

    drop(file);

    // Use copy+delete instead of rename: safer across mount points and sandboxed envs
    std::fs::copy(&partial, &dest)
        .map_err(|e| format!("Cannot finalize model (copy): {}", e))?;
    std::fs::remove_file(&partial)
        .map_err(|e| format!("Cannot remove partial file: {}", e))?;

    let _ = handle.emit("model-download-complete", ());
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(SidecarState {
            api_child: Mutex::new(None),
            llm_child: Mutex::new(None),
            api_port: Mutex::new(8000),
            llm_port: Mutex::new(1235),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match sidecar::start_backend(&handle).await {
                    Ok(()) => {
                        log::info!("Backend started successfully");
                    }
                    Err(e) => {
                        log::error!("Failed to start backend: {}", e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_api_port, get_llm_port, check_model_exists, download_model])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
