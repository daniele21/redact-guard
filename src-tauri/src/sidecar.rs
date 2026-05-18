use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

use crate::SidecarState;

const HEALTH_CHECK_INTERVAL: Duration = Duration::from_millis(500);
const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(60);

/// Resolve the project root directory.
/// - In dev: parent of CARGO_MANIFEST_DIR (which is src-tauri/)
/// - In production: parent of the app's resource dir
fn project_root(handle: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        // CARGO_MANIFEST_DIR is src-tauri/ at compile time, project root is one level up
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        handle
            .path()
            .resource_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
    }
}

/// Start the Python backend (FastAPI + LLM server) as a sidecar process.
/// In dev mode, this expects the Python venv to be available.
/// In production, it uses the bundled Python environment.
pub async fn start_backend(handle: &AppHandle) -> Result<(), String> {
    // In dev mode, use fixed ports to match the Vite proxy config.
    // In production, pick free ports dynamically.
    let (api_port, llm_port) = if cfg!(debug_assertions) {
        (8000u16, 1235u16)
    } else {
        (
            portpicker::pick_unused_port().unwrap_or(8000),
            portpicker::pick_unused_port().unwrap_or(1235),
        )
    };

    log::info!("Starting LLM server on port {}", llm_port);
    start_llm_server(handle, llm_port).await?;

    log::info!("Starting API server on port {}", api_port);
    start_api_server(handle, api_port).await?;

    // Wait for API to be healthy
    wait_for_health(api_port).await?;
    log::info!("Backend is ready on port {}", api_port);

    // Store ports in state
    let state = handle.state::<SidecarState>();
    *state.api_port.lock().unwrap() = api_port;
    *state.llm_port.lock().unwrap() = llm_port;

    Ok(())
}

async fn start_llm_server(handle: &AppHandle, port: u16) -> Result<(), String> {
    let root = project_root(handle);
    let port_str = port.to_string();

    let sidecar_cmd = if cfg!(debug_assertions) {
        let python = root.join(".venv/bin/python");
        let script = root.join("anonimizer/llama_cpp_server.py");
        handle.shell()
            .command(python.to_str().unwrap())
            .args([
                script.to_str().unwrap(),
                "--port", &port_str,
            ])
            .current_dir(&root)
    } else {
        handle.shell()
            .sidecar("redactguard-server")
            .map_err(|e| format!("Failed to create LLM sidecar: {}", e))?
            .args(["llm", "--port", &port_str])
    };

    let (mut rx, child) = sidecar_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn LLM server: {}", e))?;

    // Log output in background
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    log::info!("[LLM] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    log::warn!("[LLM] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    log::info!("[LLM] Process terminated: {:?}", payload);
                    break;
                }
                _ => {}
            }
        }
    });

    let state = handle.state::<SidecarState>();
    *state.llm_child.lock().unwrap() = Some(child);

    // Give LLM server time to load model
    tokio::time::sleep(Duration::from_secs(2)).await;
    Ok(())
}

async fn start_api_server(handle: &AppHandle, port: u16) -> Result<(), String> {
    let root = project_root(handle);
    let port_str = port.to_string();

    let sidecar_cmd = if cfg!(debug_assertions) {
        let python = root.join(".venv/bin/python");
        let backend_dir = root.join("anonimizer");
        handle.shell()
            .command(python.to_str().unwrap())
            .args([
                "-m", "uvicorn",
                "main:app",
                "--host", "127.0.0.1",
                "--port", &port_str,
                "--app-dir", backend_dir.to_str().unwrap(),
            ])
            .current_dir(&root)
            .env("REDACTGUARD_DEV", "1")
    } else {
        handle.shell()
            .sidecar("redactguard-server")
            .map_err(|e| format!("Failed to create API sidecar: {}", e))?
            .args(["api", "--port", &port_str])
    };

    let (mut rx, child) = sidecar_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn API server: {}", e))?;

    // Log output in background
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    log::info!("[API] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    log::warn!("[API] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    log::info!("[API] Process terminated: {:?}", payload);
                    break;
                }
                _ => {}
            }
        }
    });

    let state = handle.state::<SidecarState>();
    *state.api_child.lock().unwrap() = Some(child);

    Ok(())
}

async fn wait_for_health(port: u16) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/api/health", port);
    let start = std::time::Instant::now();

    loop {
        if start.elapsed() > HEALTH_CHECK_TIMEOUT {
            return Err("Backend health check timed out after 60s".to_string());
        }

        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => return Ok(()),
            _ => {
                tokio::time::sleep(HEALTH_CHECK_INTERVAL).await;
            }
        }
    }
}
