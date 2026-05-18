use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;

mod sidecar;

struct SidecarState {
    api_child: Mutex<Option<CommandChild>>,
    llm_child: Mutex<Option<CommandChild>>,
    api_port: Mutex<u16>,
    llm_port: Mutex<u16>,
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
                        // Backend is ready — show the main window
                        if let Some(win) = handle.get_webview_window("main") {
                            let _ = win.show();
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to start backend: {}", e);
                        // Still show the window so the user sees an error state
                        if let Some(win) = handle.get_webview_window("main") {
                            let _ = win.show();
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_api_port, get_llm_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
