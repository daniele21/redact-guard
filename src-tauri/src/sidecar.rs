use std::env;
use std::fs;
use std::path::{Path, PathBuf};
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
        let default_mode = if cfg!(debug_assertions) {
            "external"
        } else {
            "managed"
        };
        match env::var("KORGIS_MODE")
            .unwrap_or_else(|_| default_mode.to_string())
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

/// Keep the startup key in sync with the backend's canonical local preference.
/// Only managed mode can control residency; external users manage Korgis themselves.
fn model_preference_path() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("REDACTGUARD_MODEL_PREFERENCE_FILE") {
        if path.is_empty() {
            return Err("REDACTGUARD_MODEL_PREFERENCE_FILE cannot be empty".to_string());
        }
        return Ok(PathBuf::from(path));
    }
    let home = env::var_os("HOME")
        .ok_or_else(|| "Cannot locate local model preference without HOME".to_string())?;
    Ok(PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("RedactGuard")
        .join("model-selection.json"))
}

fn valid_model_identifier(model: &str) -> bool {
    let bytes = model.as_bytes();
    (1..=160).contains(&bytes.len())
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || matches!(*b, b'_' | b'.' | b':' | b'/' | b'-'))
}

fn managed_launch_model(configured: &str, path: &Path) -> Result<String, String> {
    let saved = match fs::read_to_string(path) {
        Ok(raw) => {
            let value: serde_json::Value = serde_json::from_str(&raw)
                .map_err(|_| "Saved model preference contains invalid JSON".to_string())?;
            if value.get("version").and_then(|v| v.as_u64()) != Some(1) {
                return Err("Unsupported saved model preference version".to_string());
            }
            let model_id = value
                .get("model")
                .and_then(|model| model.as_str())
                .ok_or_else(|| "Saved model preference is missing the model key".to_string())?;
            if !valid_model_identifier(model_id) {
                return Err("Invalid saved model identifier".to_string());
            }
            // Korgis serves requests by public model ID, but bootstraps by
            // registry key. The API resolves and saves this mapping on selection.
            match value.get("startup_key") {
                Some(startup) => startup
                    .as_str()
                    .ok_or_else(|| "Saved Korgis startup key is invalid".to_string())?
                    .to_string(),
                None => model_id.to_string(), // v1 legacy file: Korgis may reject an unknown key.
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => configured.to_string(),
        Err(_) => return Err("Cannot read local model preference".to_string()),
    };
    if !valid_model_identifier(&saved) {
        return Err("Invalid saved model identifier; refusing to load another model".to_string());
    }
    Ok(saved)
}

/// Start RedactGuard and, when explicitly configured, its managed Korgis process.
///
/// Korgis stays a separate process and remains the owner of model acquisition,
/// model lifecycle, inference and resource telemetry.
pub async fn start_backend(handle: &AppHandle) -> Result<(), String> {
    let mode = KorgisMode::from_env()?;
    let configured = env::var("KORGIS_MODEL").unwrap_or_else(|_| "nemotron-nano-4b".to_string());
    let model = match mode {
        KorgisMode::Managed => managed_launch_model(&configured, &model_preference_path()?)?,
        KorgisMode::External => configured,
    };

    let korgis_base_url = match mode {
        KorgisMode::External => {
            env::var("KORGIS_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:1235/v1".to_string())
        }
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

async fn start_korgis_server(handle: &AppHandle, port: u16, model: &str) -> Result<(), String> {
    let root = project_root(handle);
    let port_str = port.to_string();

    let command = if cfg!(debug_assertions) {
        let python = env::var("KORGIS_PYTHON")
            .map_err(|_| "Managed Korgis development mode requires KORGIS_PYTHON".to_string())?;
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
            .env("KORGIS_MODEL", model)
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

async fn wait_for_http_health(url: &str, timeout: Duration, label: &str) -> Result<(), String> {
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

#[cfg(test)]
mod preference_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_preference(json: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before epoch")
            .as_nanos();
        let path = env::temp_dir().join(format!(
            "redactguard-model-preference-{}-{}.json",
            std::process::id(),
            stamp
        ));
        fs::write(&path, json).expect("create synthetic preference");
        path
    }

    #[test]
    fn absent_preference_uses_existing_configured_model() {
        let path = env::temp_dir().join(format!(
            "redactguard-absent-model-preference-{}.json",
            std::process::id()
        ));
        let _ = fs::remove_file(&path);
        assert_eq!(
            managed_launch_model("default-model", &path).unwrap(),
            "default-model"
        );
    }

    #[test]
    fn distinct_public_id_and_startup_registry_key_survive_restart() {
        let path = temporary_preference(
            r#"{"version":1,"model":"provider/model-revision","startup_key":"registry-model-q4"}"#,
        );
        assert_eq!(
            managed_launch_model("default-model", &path).unwrap(),
            "registry-model-q4"
        );
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn saved_preference_overrides_launcher_default_at_restart() {
        let path = temporary_preference(r#"{"version":1,"model":"test-model-b"}"#);
        assert_eq!(
            managed_launch_model("default-model", &path).unwrap(),
            "test-model-b"
        );
        fs::remove_file(&path).unwrap();
    }

    #[test]
    fn corrupted_or_incompatible_preferences_fail_closed() {
        for raw in [
            "{broken",
            r#"{"version":2,"model":"test-model-b"}"#,
            r#"{"version":1,"model":"../private"}"#,
            r#"{"version":1,"model":""}"#,
            r#"{"version":1,"model":123}"#,
            r#"{"version":1,"model":"valid-model","startup_key":"../private"}"#,
            r#"{"version":1,"model":"valid-model","startup_key":123}"#,
        ] {
            let path = temporary_preference(raw);
            assert!(managed_launch_model("default-model", &path).is_err());
            fs::remove_file(path).unwrap();
        }
    }

    #[test]
    fn model_key_validation_matches_backend_identifier_contract() {
        assert!(valid_model_identifier("nemotron-nano-4b-q8"));
        assert!(valid_model_identifier("registry/quantized:Q4_K_M"));
        assert!(!valid_model_identifier("model with spaces"));
        assert!(!valid_model_identifier("--model"));
        assert!(!valid_model_identifier("../anything"));
        assert!(!valid_model_identifier("é"));
        assert!(!valid_model_identifier(&"a".repeat(161)));
    }
}
