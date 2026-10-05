use std::env;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::SidecarState;

const HEALTH_CHECK_INTERVAL: Duration = Duration::from_millis(500);
const API_HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(60);
const DEFAULT_KORGIS_STARTUP_TIMEOUT: Duration = Duration::from_secs(900);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum KorgisMode {
    External,
    Managed,
}

impl KorgisMode {
    fn from_env() -> Result<Self, String> {
        match env::var("KORGIS_MODE")
            .unwrap_or_else(|_| "external".to_string())
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "external" => Ok(Self::External),
            "managed" => Ok(Self::Managed),
            value => Err(format!(
                "Unsupported KORGIS_MODE={value}; expected external or managed"
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::External => "external",
            Self::Managed => "managed",
        }
    }
}

fn project_root(handle: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
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

/// Start RedactGuard and, when explicitly configured, its managed Korgis process.
///
/// Korgis stays a separate process and remains the owner of model acquisition,
/// model lifecycle, inference and resource telemetry.
pub async fn start_backend(handle: &AppHandle) -> Result<(), String> {
    let mode = KorgisMode::from_env()?;
    let model = env::var("KORGIS_MODEL").unwrap_or_else(|_| "nemotron-nano-4b".to_string());

    let korgis_base_url = match mode {
        KorgisMode::External => env::var("KORGIS_BASE_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:1235/v1".to_string()),
        KorgisMode::Managed => {
            let port = portpicker::pick_unused_port().ok_or_else(|| {
                "Could not allocate a loopback port for managed Korgis".to_string()
            })?;
            {
                let state = handle.state::<SidecarState>();
                *state.korgis_port.lock().unwrap() = Some(port);
            }

            log::info!(
                "Starting managed Korgis on port {} with model {}",
                port,
                model
            );
            start_korgis_server(handle, port, &model).await?;
            let root_url = format!("http://127.0.0.1:{port}");
            wait_for_http_health(
                &format!("{root_url}/health"),
                managed_korgis_startup_timeout(),
                "Korgis",
            )
            .await?;
            log::info!("Managed Korgis is ready on port {}", port);
            format!("{root_url}/v1")
        }
    };

    let api_port = if cfg!(debug_assertions) {
        8000u16
    } else {
        portpicker::pick_unused_port().unwrap_or(8000)
    };

    let state = handle.state::<SidecarState>();
    *state.api_port.lock().unwrap() = api_port;

    log::info!("Starting RedactGuard API server on port {}", api_port);
    start_api_server(handle, api_port, mode, &korgis_base_url, &model).await?;
    wait_for_http_health(
        &format!("http://127.0.0.1:{api_port}/api/health"),
        API_HEALTH_CHECK_TIMEOUT,
        "RedactGuard backend",
    )
    .await?;
    log::info!("RedactGuard backend is ready on port {}", api_port);

    Ok(())
}

async fn start_korgis_server(
    handle: &AppHandle,
    port: u16,
    model: &str,
) -> Result<(), String> {
    let root = project_root(handle);
    let port_str = port.to_string();

    let command = if cfg!(debug_assertions) {
        let python = env::var("KORGIS_PYTHON").map_err(|_| {
            "Managed Korgis development mode requires KORGIS_PYTHON".to_string()
        })?;
        handle
            .shell()
            .command(python)
            .args([
                "-m",
                "local_llm_server",
                "serve",
                "--host",
                "127.0.0.1",
                "--port",
                &port_str,
                "--model",
                model,
                "--enable-admin-api",
            ])
            .current_dir(&root)
    } else {
        handle
            .shell()
            .sidecar("redactguard-server")
            .map_err(|e| format!("Failed to create Korgis launcher sidecar: {e}"))?
            .args(["korgis", "--port", &port_str, "--model", model])
    };

    let (mut rx, child) = command
        .spawn()
        .map_err(|e| format!("Failed to spawn managed Korgis: {e}"))?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    log::info!("[Korgis] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    log::warn!("[Korgis] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    log::info!("[Korgis] Process terminated: {:?}", payload);
                    break;
                }
                _ => {}
            }
        }
    });

    let state = handle.state::<SidecarState>();
    *state.korgis_child.lock().unwrap() = Some(child);
    Ok(())
}

async fn start_api_server(
    handle: &AppHandle,
    port: u16,
    mode: KorgisMode,
    korgis_base_url: &str,
    model: &str,
) -> Result<(), String> {
    let root = project_root(handle);
    let port_str = port.to_string();

    let sidecar_cmd = if cfg!(debug_assertions) {
        let python = root.join(".venv/bin/python");
        let backend_dir = root.join("anonimizer");
        handle
            .shell()
            .command(python.to_str().unwrap())
            .args([
                "-m",
                "uvicorn",
                "main:app",
                "--host",
                "127.0.0.1",
                "--port",
                &port_str,
                "--app-dir",
                backend_dir.to_str().unwrap(),
            ])
            .current_dir(&root)
            .env("REDACTGUARD_DEV", "1")
            .env("KORGIS_MODE", mode.as_str())
            .env("KORGIS_BASE_URL", korgis_base_url)
            .env("KORGIS_MODEL", model)
    } else {
        handle
            .shell()
            .sidecar("redactguard-server")
            .map_err(|e| format!("Failed to create API sidecar: {e}"))?
            .args(["api", "--port", &port_str])
            .env("KORGIS_MODE", mode.as_str())
            .env("KORGIS_BASE_URL", korgis_base_url)
    };

    let (mut rx, child) = sidecar_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn RedactGuard API server: {e}"))?;

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

async fn wait_for_http_health(
    url: &str,
    timeout: Duration,
    label: &str,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let start = std::time::Instant::now();

    loop {
        if start.elapsed() > timeout {
            return Err(format!(
                "{label} health check timed out after {}s",
                timeout.as_secs()
            ));
        }

        match client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => return Ok(()),
            _ => tokio::time::sleep(HEALTH_CHECK_INTERVAL).await,
        }
    }
}

fn managed_korgis_startup_timeout() -> Duration {
    env::var("KORGIS_STARTUP_TIMEOUT_SECONDS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .map(Duration::from_secs)
        .unwrap_or(DEFAULT_KORGIS_STARTUP_TIMEOUT)
}
