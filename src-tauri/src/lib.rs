use std::sync::Mutex;
use tauri_plugin_shell::process::CommandChild;

mod sidecar;

struct SidecarState {
    api_child: Mutex<Option<CommandChild>>,
    api_port: Mutex<u16>,
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        if let Some(child) = self.api_child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

#[tauri::command]
fn get_api_port(state: tauri::State<SidecarState>) -> u16 {
    *state.api_port.lock().unwrap()
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
            api_port: Mutex::new(8000),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match sidecar::start_backend(&handle).await {
                    Ok(()) => log::info!("Backend started successfully"),
                    Err(e) => log::error!("Failed to start backend: {}", e),
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_api_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
