//! RedactGuard local process launcher.
//!
//! The launcher can start the RedactGuard API or a separately packaged Korgis
//! runtime. Korgis remains a separate process and retains model/runtime ownership.

use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    match args.get(1).map(|s| s.as_str()).unwrap_or("api") {
        "api" => run_api(&args),
        "korgis" => run_korgis(&args),
        subcommand => {
            eprintln!("Unknown subcommand: {subcommand}. Supported: api, korgis.");
            ExitCode::FAILURE
        }
    }
}

fn run_api(args: &[String]) -> ExitCode {
    let port = parse_u16_arg(args, "--port").unwrap_or(8000);
    let exe_dir = executable_dir();

    let (python_bin, backend_dir) = match resolve_api_paths(&exe_dir) {
        Some(paths) => paths,
        None => {
            eprintln!("ERROR: Cannot locate RedactGuard Python environment or backend.");
            eprintln!("  Searched relative to: {}", exe_dir.display());
            return ExitCode::FAILURE;
        }
    };

    let mut cmd = build_api_command(&python_bin, &backend_dir, port);
    cmd.env("PYTHONPATH", &backend_dir);

    for key in [
        "KORGIS_MODE",
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

    exec_command(cmd, "RedactGuard API")
}

fn run_korgis(args: &[String]) -> ExitCode {
    let port = parse_u16_arg(args, "--port").unwrap_or(1235);
    let model = arg_value(args, "--model")
        .or_else(|| env::var("KORGIS_MODEL").ok())
        .unwrap_or_else(|| "nemotron-nano-4b".to_string());
    let exe_dir = executable_dir();

    let python_bin = match resolve_korgis_python(&exe_dir) {
        Some(path) => path,
        None => {
            eprintln!("ERROR: Cannot locate the managed Korgis Python environment.");
            eprintln!("  Provide KORGIS_PYTHON for development or package resources/korgis/venv.");
            return ExitCode::FAILURE;
        }
    };

    let cmd = build_korgis_command(&python_bin, port, &model);
    exec_command(cmd, "Korgis")
}

fn executable_dir() -> PathBuf {
    env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn resolve_api_paths(exe_dir: &Path) -> Option<(PathBuf, PathBuf)> {
    for (python, backend) in api_production_candidates(exe_dir)
        .into_iter()
        .chain(api_dev_candidates(exe_dir))
    {
        if python.exists() && backend.exists() {
            return Some((python, backend));
        }
    }
    None
}

fn resolve_korgis_python(exe_dir: &Path) -> Option<PathBuf> {
    if let Ok(explicit) = env::var("KORGIS_PYTHON") {
        let path = PathBuf::from(explicit);
        if path.exists() {
            return Some(path);
        }
    }

    korgis_production_candidates(exe_dir)
        .into_iter()
        .find(|path| path.exists())
}

fn api_production_candidates(exe_dir: &Path) -> Vec<(PathBuf, PathBuf)> {
    resource_roots(exe_dir)
        .into_iter()
        .map(|resources| (resources.join(python_venv_bin()), resources.join("backend")))
        .collect()
}

fn korgis_production_candidates(exe_dir: &Path) -> Vec<PathBuf> {
    resource_roots(exe_dir)
        .into_iter()
        .map(|resources| resources.join(korgis_venv_bin()))
        .collect()
}

fn resource_roots(exe_dir: &Path) -> Vec<PathBuf> {
    vec![
        exe_dir.join("../Resources"),
        exe_dir.join("../resources"),
        exe_dir.join("resources"),
    ]
}

fn api_dev_candidates(exe_dir: &Path) -> Vec<(PathBuf, PathBuf)> {
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

fn korgis_venv_bin() -> &'static str {
    if cfg!(windows) {
        "korgis/venv/Scripts/python.exe"
    } else {
        "korgis/venv/bin/python"
    }
}

fn dev_venv_bin() -> &'static str {
    if cfg!(windows) {
        ".venv/Scripts/python.exe"
    } else {
        ".venv/bin/python"
    }
}

fn build_api_command(python_bin: &Path, backend_dir: &Path, port: u16) -> Command {
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

fn build_korgis_command(python_bin: &Path, port: u16, model: &str) -> Command {
    let port_str = port.to_string();
    let mut cmd = Command::new(python_bin);
    cmd.args([
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
    ]);
    cmd
}

fn parse_u16_arg(args: &[String], flag: &str) -> Option<u16> {
    arg_value(args, flag).and_then(|value| value.parse::<u16>().ok())
}

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|arg| arg == flag)
        .and_then(|index| args.get(index + 1))
        .cloned()
}

fn exec_command(mut cmd: Command, label: &str) -> ExitCode {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let err = cmd.exec();
        eprintln!("ERROR: Failed to exec {label}: {err}");
        ExitCode::FAILURE
    }

    #[cfg(windows)]
    {
        match cmd.status() {
            Ok(status) if status.success() => ExitCode::SUCCESS,
            Ok(_) => ExitCode::FAILURE,
            Err(error) => {
                eprintln!("ERROR: Failed to spawn {label}: {error}");
                ExitCode::FAILURE
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_named_port_and_model_arguments() {
        let args = vec![
            "launcher".to_string(),
            "korgis".to_string(),
            "--port".to_string(),
            "4321".to_string(),
            "--model".to_string(),
            "demo-model".to_string(),
        ];
        assert_eq!(parse_u16_arg(&args, "--port"), Some(4321));
        assert_eq!(arg_value(&args, "--model").as_deref(), Some("demo-model"));
    }

    #[test]
    fn korgis_command_keeps_runtime_as_separate_module_process() {
        let command = build_korgis_command(Path::new("/tmp/python"), 1235, "demo");
        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert_eq!(
            args,
            vec![
                "-m",
                "local_llm_server",
                "serve",
                "--host",
                "127.0.0.1",
                "--port",
                "1235",
                "--model",
                "demo",
                "--enable-admin-api",
            ]
        );
    }
}
