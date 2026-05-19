//! RedactGuard Sidecar Launcher
//!
//! Cross-platform binary that launches the Python backend services (API or LLM).
//! Tauri invokes this as an external binary with the subcommand and port.

use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();

    let subcommand = args.get(1).map(|s| s.as_str()).unwrap_or("api");

    // Parse port from args: look for "--port" followed by a value, or positional after subcommand
    let port = parse_port(&args, subcommand);

    let exe_dir = env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    let (python_bin, backend_dir) = match resolve_paths(&exe_dir) {
        Some(paths) => paths,
        None => {
            eprintln!("ERROR: Cannot locate Python environment or backend directory.");
            eprintln!("  Searched relative to: {}", exe_dir.display());
            return ExitCode::FAILURE;
        }
    };

    if !python_bin.exists() {
        eprintln!("ERROR: Python binary not found at: {}", python_bin.display());
        return ExitCode::FAILURE;
    }

    if !backend_dir.exists() {
        eprintln!("ERROR: Backend directory not found at: {}", backend_dir.display());
        return ExitCode::FAILURE;
    }

    let mut cmd = build_command(subcommand, &python_bin, &backend_dir, port);

    // Set PYTHONPATH to include backend dir
    cmd.env("PYTHONPATH", &backend_dir);

    // Propagate environment variables from parent
    if let Ok(val) = env::var("LLM_ENDPOINT") {
        cmd.env("LLM_ENDPOINT", val);
    }
    if let Ok(val) = env::var("REDACTGUARD_DEV") {
        cmd.env("REDACTGUARD_DEV", val);
    }

    // Replace current process on Unix, spawn on Windows
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let err = cmd.exec();
        eprintln!("ERROR: Failed to exec: {}", err);
        ExitCode::FAILURE
    }

    #[cfg(windows)]
    {
        match cmd.status() {
            Ok(status) => {
                if status.success() {
                    ExitCode::SUCCESS
                } else {
                    ExitCode::FAILURE
                }
            }
            Err(e) => {
                eprintln!("ERROR: Failed to spawn process: {}", e);
                ExitCode::FAILURE
            }
        }
    }
}

/// Resolve Python binary and backend directory paths.
/// Tries production layout first, then falls back to dev layout.
fn resolve_paths(exe_dir: &Path) -> Option<(PathBuf, PathBuf)> {
    // Production layout:
    //   macOS:   .app/Contents/MacOS/redactguard-server  →  ../Resources/python/venv/bin/python
    //   Linux:   <install>/bin/redactguard-server        →  ../resources/python/venv/bin/python
    //   Windows: <install>/redactguard-server.exe        →  ../resources/python/venv/Scripts/python.exe

    let candidates = production_candidates(exe_dir);

    for (python, backend) in &candidates {
        if python.exists() && backend.exists() {
            return Some((python.clone(), backend.clone()));
        }
    }

    // Dev fallback: exe is in src-tauri/binaries/ or target/debug/
    let dev_candidates = dev_candidates(exe_dir);

    for (python, backend) in &dev_candidates {
        if python.exists() && backend.exists() {
            return Some((python.clone(), backend.clone()));
        }
    }

    None
}

fn production_candidates(exe_dir: &Path) -> Vec<(PathBuf, PathBuf)> {
    let mut candidates = Vec::new();

    // macOS: exe is in .app/Contents/MacOS/, resources in .app/Contents/Resources/
    let macos_resources = exe_dir.join("../Resources");
    candidates.push((
        macos_resources.join("python/venv/bin/python"),
        macos_resources.join("backend"),
    ));

    // Linux/Windows: exe is alongside resources/ directory or one level up
    let linux_resources = exe_dir.join("../resources");
    candidates.push((
        linux_resources.join(python_venv_bin()),
        linux_resources.join("backend"),
    ));

    // Windows alternative: resources next to exe
    let win_resources = exe_dir.join("resources");
    candidates.push((
        win_resources.join(python_venv_bin()),
        win_resources.join("backend"),
    ));

    candidates
}

fn dev_candidates(exe_dir: &Path) -> Vec<(PathBuf, PathBuf)> {
    let mut candidates = Vec::new();

    // From src-tauri/binaries/ → project root is ../../
    let from_binaries = exe_dir.join("../..");
    candidates.push((
        from_binaries.join(dev_venv_bin()),
        from_binaries.join("anonimizer"),
    ));

    // From target/debug/ or target/release/ → project root is ../../../
    let from_target = exe_dir.join("../../..");
    candidates.push((
        from_target.join(dev_venv_bin()),
        from_target.join("anonimizer"),
    ));

    // From sidecar/target/debug/ → project root is ../../../
    candidates.push((
        from_target.join(dev_venv_bin()),
        from_target.join("anonimizer"),
    ));

    candidates
}

/// Returns the relative path to python inside the venv, platform-specific.
fn python_venv_bin() -> &'static str {
    if cfg!(windows) {
        "python/venv/Scripts/python.exe"
    } else {
        "python/venv/bin/python"
    }
}

/// Returns the relative path to the dev venv python.
fn dev_venv_bin() -> &'static str {
    if cfg!(windows) {
        ".venv/Scripts/python.exe"
    } else {
        ".venv/bin/python"
    }
}

fn build_command(subcommand: &str, python_bin: &Path, backend_dir: &Path, port: u16) -> Command {
    let port_str = port.to_string();

    match subcommand {
        "api" => {
            let mut cmd = Command::new(python_bin);
            cmd.args([
                "-m", "uvicorn",
                "main:app",
                "--host", "127.0.0.1",
                "--port", &port_str,
                "--app-dir",
            ]);
            cmd.arg(backend_dir);
            cmd
        }
        "llm" => {
            let script = backend_dir.join("llama_cpp_server.py");
            let mut cmd = Command::new(python_bin);
            cmd.arg(&script);
            cmd.args(["--port", &port_str]);
            cmd
        }
        _ => {
            eprintln!("Unknown subcommand: {}. Use 'api' or 'llm'.", subcommand);
            std::process::exit(1);
        }
    }
}

fn parse_port(args: &[String], subcommand: &str) -> u16 {
    let default_port: u16 = if subcommand == "llm" { 1235 } else { 8000 };

    // Look for --port VALUE
    for (i, arg) in args.iter().enumerate() {
        if arg == "--port" {
            if let Some(val) = args.get(i + 1) {
                return val.parse().unwrap_or(default_port);
            }
        }
    }

    // Positional: command port (e.g., "api 8080" or "api --port 8080")
    // Check if args[2] looks like a port number
    if args.len() > 2 {
        if let Ok(p) = args[2].parse::<u16>() {
            return p;
        }
    }

    default_port
}
