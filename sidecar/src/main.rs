//! RedactGuard Python API sidecar launcher.
//!
//! The LLM runtime is intentionally external: Korgis owns model lifecycle and inference.

use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    let subcommand = args.get(1).map(|s| s.as_str()).unwrap_or("api");
    if subcommand != "api" {
        eprintln!(
            "Unknown subcommand: {}. Only 'api' is supported.",
            subcommand
        );
        return ExitCode::FAILURE;
    }
    let port = parse_port(&args);

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

    if !python_bin.exists() || !backend_dir.exists() {
        eprintln!("ERROR: RedactGuard sidecar resources are incomplete.");
        return ExitCode::FAILURE;
    }

    let mut cmd = build_command(&python_bin, &backend_dir, port);
    cmd.env("PYTHONPATH", &backend_dir);

    for key in [
        "KORGIS_BASE_URL",
        "KORGIS_MODEL",
        "LLM_TIMEOUT",
        "LLM_MAX_OUTPUT_TOKENS",
        "REDACTGUARD_DEV",
    ] {
        if let Ok(value) = env::var(key) {
            cmd.env(key, value);
        }
    }

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
            Ok(status) if status.success() => ExitCode::SUCCESS,
            Ok(_) => ExitCode::FAILURE,
            Err(e) => {
                eprintln!("ERROR: Failed to spawn process: {}", e);
                ExitCode::FAILURE
            }
        }
    }
}

fn resolve_paths(exe_dir: &Path) -> Option<(PathBuf, PathBuf)> {
    for (python, backend) in production_candidates(exe_dir)
        .into_iter()
        .chain(dev_candidates(exe_dir))
    {
        if python.exists() && backend.exists() {
            return Some((python, backend));
        }
    }
    None
}

fn production_candidates(exe_dir: &Path) -> Vec<(PathBuf, PathBuf)> {
    let macos_resources = exe_dir.join("../Resources");
    let linux_resources = exe_dir.join("../resources");
    let win_resources = exe_dir.join("resources");

    vec![
        (
            macos_resources.join("python/venv/bin/python"),
            macos_resources.join("backend"),
        ),
        (
            linux_resources.join(python_venv_bin()),
            linux_resources.join("backend"),
        ),
        (
            win_resources.join(python_venv_bin()),
            win_resources.join("backend"),
        ),
    ]
}

fn dev_candidates(exe_dir: &Path) -> Vec<(PathBuf, PathBuf)> {
    let from_binaries = exe_dir.join("../..");
    let from_target = exe_dir.join("../../..");

    vec![
        (
            from_binaries.join(dev_venv_bin()),
            from_binaries.join("anonimizer"),
        ),
        (
            from_target.join(dev_venv_bin()),
            from_target.join("anonimizer"),
        ),
    ]
}

fn python_venv_bin() -> &'static str {
    if cfg!(windows) {
        "python/venv/Scripts/python.exe"
    } else {
        "python/venv/bin/python"
    }
}

fn dev_venv_bin() -> &'static str {
    if cfg!(windows) {
        ".venv/Scripts/python.exe"
    } else {
        ".venv/bin/python"
    }
}

fn build_command(python_bin: &Path, backend_dir: &Path, port: u16) -> Command {
    let port_str = port.to_string();
    let mut cmd = Command::new(python_bin);
    cmd.args([
        "-m",
        "uvicorn",
        "main:app",
        "--host",
        "127.0.0.1",
        "--port",
        &port_str,
        "--app-dir",
    ]);
    cmd.arg(backend_dir);
    cmd
}

fn parse_port(args: &[String]) -> u16 {
    for (index, arg) in args.iter().enumerate() {
        if arg == "--port" {
            if let Some(value) = args.get(index + 1) {
                return value.parse().unwrap_or(8000);
            }
        }
    }
    if args.len() > 2 {
        if let Ok(port) = args[2].parse::<u16>() {
            return port;
        }
    }
    8000
}
