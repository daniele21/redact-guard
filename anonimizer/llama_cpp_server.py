#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 1235
DEFAULT_MODEL = "nvidia/nemotron-3-nano-4b"

# Allineato allo screenshot LM Studio
DEFAULT_CONTEXT_SIZE = 36466
DEFAULT_N_GPU_LAYERS = 42
DEFAULT_N_THREADS = 8
DEFAULT_N_BATCH = 512
DEFAULT_N_UBATCH = 512

DEFAULT_TIMEOUT = 1200
DEFAULT_MODEL_PATH = (
    "/Users/moltisantid/.lmstudio/models/lmstudio-community/"
    "NVIDIA-Nemotron-3-Nano-4B-GGUF/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M.gguf"
)


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    content_length = int(handler.headers.get("Content-Length") or "0")
    if content_length <= 0:
        return {}

    raw_body = handler.rfile.read(content_length).decode("utf-8")
    value = json.loads(raw_body)

    if not isinstance(value, dict):
        raise ValueError("Request body must be a JSON object.")

    return value


def _normalize_messages(request_payload: dict[str, Any]) -> list[dict[str, str]]:
    """
    Accetta:
    1. payload LM Studio-like:
       {"system_prompt": "...", "input": "..."}

    2. payload OpenAI-compatible:
       {"messages": [{"role": "system", "content": "..."}, ...]}
    """
    raw_messages = request_payload.get("messages")

    if isinstance(raw_messages, list):
        messages: list[dict[str, str]] = []
        for item in raw_messages:
            if not isinstance(item, dict):
                continue

            role = str(item.get("role") or "").strip()
            content = item.get("content")

            if isinstance(content, list):
                parts = []
                for part in content:
                    if isinstance(part, str):
                        parts.append(part)
                    elif isinstance(part, dict) and isinstance(part.get("text"), str):
                        parts.append(part["text"])
                content = "\n".join(parts)

            content = str(content or "").strip()

            if role and content:
                messages.append({"role": role, "content": content})

        if messages:
            return messages

    system_prompt = str(request_payload.get("system_prompt") or "").strip()
    user_input = str(
        request_payload.get("input")
        or request_payload.get("text")
        or request_payload.get("prompt")
        or ""
    ).strip()

    if not user_input:
        raise ValueError("Missing required field: input")

    messages = []

    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    messages.append({"role": "user", "content": user_input})

    return messages


def _extract_choice_content(response: dict[str, Any]) -> str:
    choices = response.get("choices")

    if not isinstance(choices, list) or not choices:
        return ""

    first = choices[0]
    if not isinstance(first, dict):
        return ""

    message = first.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    text = item.get("text") or item.get("content")
                    if isinstance(text, str):
                        parts.append(text)
            return "\n".join(parts)

    text = first.get("text")
    if isinstance(text, str):
        return text

    return ""


def _strip_thinking_blocks(text: str) -> str:
    """
    Utile con modelli reasoning: se produce <think>...</think>
    prima del JSON, puliamo il contenuto esposto come output.
    """
    if "</think>" in text:
        text = text.split("</think>", 1)[1]
    return text.strip()


def _usage_to_stats(response: dict[str, Any], started_at: float, finished_at: float) -> dict[str, Any]:
    usage = response.get("usage") if isinstance(response.get("usage"), dict) else {}

    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    total_tokens = int(usage.get("total_tokens") or prompt_tokens + completion_tokens)

    elapsed = max(finished_at - started_at, 1e-6)
    tokens_per_second = completion_tokens / elapsed if completion_tokens else 0.0

    return {
        "input_tokens": prompt_tokens,
        "output_tokens": completion_tokens,
        "total_output_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "tokens_per_second": tokens_per_second,
        "time_total_seconds": elapsed,
    }


def _lmstudio_compatible_response(
    raw_response: dict[str, Any],
    *,
    model_name: str,
    started_at: float,
    finished_at: float,
    show_thinking: bool = False,
) -> dict[str, Any]:
    content = _extract_choice_content(raw_response)

    thinking = ""
    final_answer = content

    if "<think>" in content and "</think>" in content:
        before, rest = content.split("<think>", 1)
        thinking, after = rest.split("</think>", 1)
        final_answer = (before + after).strip()
        thinking = thinking.strip()

    exposed_content = content if show_thinking else final_answer

    raw_response.setdefault("model", model_name)

    payload = dict(raw_response)
    payload["output"] = exposed_content
    payload["response"] = exposed_content
    payload["content"] = exposed_content
    payload["raw_output"] = content
    payload["thinking"] = thinking
    payload["final_answer"] = final_answer
    payload["backend"] = "llama-cpp-python"
    payload["stats"] = _usage_to_stats(raw_response, started_at, finished_at)

    return payload


def _load_llm(args: argparse.Namespace) -> Any:
    model_path = Path(args.model_path).expanduser()

    if not model_path.exists():
        raise SystemExit(f"Nemotron GGUF not found: {model_path}")

    try:
        from llama_cpp import Llama
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing dependency: llama-cpp-python. "
            "Install it with: pip install llama-cpp-python"
        ) from exc

    kwargs: dict[str, Any] = {
        "model_path": str(model_path),
        "n_ctx": args.ctx_size,
        "n_batch": args.n_batch,
        "n_ubatch": args.n_ubatch,
        "n_gpu_layers": args.n_gpu_layers,
        "n_threads": args.n_threads,
        "offload_kqv": args.offload_kqv,
        "flash_attn": args.flash_attn,
        "use_mmap": args.use_mmap,
        "verbose": args.verbose,
    }

    if args.chat_format:
        kwargs["chat_format"] = args.chat_format

    print(f"Loading Nemotron GGUF: {model_path}", flush=True)
    print(
        json.dumps(
            {
                "model": args.model,
                "ctx_size": args.ctx_size,
                "n_gpu_layers": args.n_gpu_layers,
                "n_threads": args.n_threads,
                "n_batch": args.n_batch,
                "n_ubatch": args.n_ubatch,
                "offload_kqv": args.offload_kqv,
                "flash_attn": args.flash_attn,
                "use_mmap": args.use_mmap,
                "chat_format": args.chat_format,
            },
            indent=2,
        ),
        flush=True,
    )

    llm = Llama(**kwargs)

    print("Model loaded.", flush=True)
    return llm


class NemotronLlamaCppServer(ThreadingHTTPServer):
    def __init__(
        self,
        server_address: tuple[str, int],
        handler_class: type[BaseHTTPRequestHandler],
        *,
        llm: Any,
        model_name: str,
        model_path: str,
        request_timeout: int,
        force_json: bool,
        enable_thinking: bool,
        show_thinking: bool,
    ) -> None:
        super().__init__(server_address, handler_class)
        self.llm = llm
        self.model_name = model_name
        self.model_path = model_path
        self.request_timeout = request_timeout
        self.force_json = force_json
        self.enable_thinking = enable_thinking
        self.show_thinking = show_thinking

        # llama-cpp-python non è pensato per generazioni concorrenti
        # sullo stesso oggetto Llama. Meglio serializzare.
        self.generation_lock = threading.Lock()


class NemotronHandler(BaseHTTPRequestHandler):
    server_version = "NemotronLlamaCppPython/1.1"

    @property
    def app(self) -> NemotronLlamaCppServer:
        return self.server  # type: ignore[return-value]

    def do_GET(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"

        if path in {"/", "/health"}:
            _json_response(
                self,
                200,
                {
                    "ok": True,
                    "server": "nemotron-llama-cpp-python",
                    "backend": "llama-cpp-python",
                    "model": self.app.model_name,
                    "model_path": self.app.model_path,
                    "endpoints": [
                        "GET /api/v1/models",
                        "GET /v1/models",
                        "POST /api/v1/chat",
                        "POST /v1/chat/completions",
                    ],
                },
            )
            return

        if path in {"/api/v1/models", "/v1/models"}:
            now = int(time.time())
            _json_response(
                self,
                200,
                {
                    "object": "list",
                    "data": [
                        {
                            "id": self.app.model_name,
                            "object": "model",
                            "created": now,
                            "owned_by": "local",
                            "path": self.app.model_path,
                        }
                    ],
                },
            )
            return

        _json_response(self, 404, {"error": f"Unknown route: {self.path}"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path.rstrip("/")

        if path in {"/api/v1/chat", "/v1/chat/completions"}:
            self._handle_chat()
            return

        if path == "/api/v1/models/load":
            # LM Studio espone questo endpoint. Qui il modello è già caricato,
            # quindi rispondiamo in modo compatibile senza fare altro.
            _json_response(
                self,
                200,
                {
                    "ok": True,
                    "model": self.app.model_name,
                    "already_loaded": True,
                    "backend": "llama-cpp-python",
                },
            )
            return

        _json_response(self, 404, {"error": f"Unknown route: {self.path}"})

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def _handle_chat(self) -> None:
        started_at = time.perf_counter()

        try:
            request_payload = _read_json(self)
            messages = _normalize_messages(request_payload)

            max_tokens = request_payload.get(
                "max_tokens",
                request_payload.get("max_output_tokens"),
            )

            kwargs: dict[str, Any] = {
                "messages": messages,
                "temperature": float(request_payload.get("temperature", 0.0)),
                "top_p": float(request_payload.get("top_p", 1.0)),
                "top_k": int(request_payload.get("top_k", 40)),
                "min_p": float(request_payload.get("min_p", 0.05)),
                "repeat_penalty": float(request_payload.get("repeat_penalty", 1.0)),
                "presence_penalty": float(request_payload.get("presence_penalty", 0.0)),
                "frequency_penalty": float(request_payload.get("frequency_penalty", 0.0)),
                "stream": False,
                "model": str(request_payload.get("model") or self.app.model_name),
                "chat_template_kwargs": {
                    "enable_thinking": self.app.enable_thinking,
                },
            }

            if max_tokens is not None:
                kwargs["max_tokens"] = int(max_tokens)

            if request_payload.get("seed") is not None:
                kwargs["seed"] = int(request_payload["seed"])

            if request_payload.get("stop") is not None:
                kwargs["stop"] = request_payload["stop"]

            # Priorità:
            # 1. se il client passa response_format, usiamo quello;
            # 2. altrimenti, se --force-json è attivo, forziamo JSON object.
            if isinstance(request_payload.get("response_format"), dict):
                kwargs["response_format"] = request_payload["response_format"]
            elif self.app.force_json:
                kwargs["response_format"] = {"type": "json_object"}

            print("\n[SERVER DEBUG] Invoking create_chat_completion with arguments:")
            print(json.dumps({k: v for k, v in kwargs.items() if k != "messages"}, indent=2))
            
            with self.app.generation_lock:
                try:
                    raw_response = self.app.llm.create_chat_completion(**kwargs)
                except TypeError as exc:
                    if "chat_template_kwargs" in str(exc):
                        print("\n[SERVER WARNING] 'chat_template_kwargs' is not supported by your current llama-cpp-python version. Retrying without it...", file=sys.stderr)
                        kwargs.pop("chat_template_kwargs", None)
                        raw_response = self.app.llm.create_chat_completion(**kwargs)
                    else:
                        raise

            finished_at = time.perf_counter()

        except json.JSONDecodeError as exc:
            _json_response(self, 400, {"error": f"Invalid JSON request: {exc}"})
            return
        except ValueError as exc:
            _json_response(self, 400, {"error": str(exc)})
            return
        except Exception as exc:
            import traceback
            print("\n[SERVER ERROR] Exception occurred during inference:", file=sys.stderr)
            traceback.print_exc()
            _json_response(self, 500, {"error": f"Nemotron inference failed: {exc}"})
            return

        if not isinstance(raw_response, dict):
            _json_response(self, 500, {"error": "llama-cpp-python returned a non-object response."})
            return

        response = _lmstudio_compatible_response(
            raw_response,
            model_name=kwargs["model"],
            started_at=started_at,
            finished_at=finished_at,
            show_thinking=self.app.show_thinking,
        )

        _json_response(self, 200, response)


def parse_args() -> argparse.Namespace:
    # Load shared config if exists
    config_path = Path(__file__).parent.parent / "config.json"
    shared_config = {}
    if config_path.exists():
        try:
            with open(config_path, "r") as f:
                shared_config = json.load(f)
        except Exception:
            pass
    
    llm_conf = shared_config.get("server", {}).get("llm", {})

    parser = argparse.ArgumentParser(
        description=(
            "Server HTTP locale per Nemotron GGUF via llama-cpp-python. "
            "Espone API compatibile con il payload usato da LM Studio /api/v1/chat."
        )
    )

    parser.add_argument("--host", default=os.getenv("NEMOTRON_PROXY_HOST", DEFAULT_HOST))
    parser.add_argument("--port", type=int, default=int(os.getenv("NEMOTRON_PROXY_PORT", str(llm_conf.get("port", DEFAULT_PORT)))))
    parser.add_argument("--model", default=os.getenv("NEMOTRON_MODEL", shared_config.get("server", {}).get("llm_model", DEFAULT_MODEL)))
    parser.add_argument(
        "--model-path",
        default=os.getenv("NEMOTRON_GGUF_PATH", llm_conf.get("model_path", DEFAULT_MODEL_PATH)),
    )

    parser.add_argument(
        "--ctx-size",
        type=int,
        default=int(os.getenv("LLAMA_CPP_CTX_SIZE", str(llm_conf.get("ctx_size", DEFAULT_CONTEXT_SIZE)))),
    )
    parser.add_argument(
        "--n-gpu-layers",
        type=int,
        default=int(os.getenv("LLAMA_CPP_N_GPU_LAYERS", str(llm_conf.get("n_gpu_layers", DEFAULT_N_GPU_LAYERS)))),
    )
    parser.add_argument(
        "--n-threads",
        type=int,
        default=int(os.getenv("LLAMA_CPP_N_THREADS", str(llm_conf.get("n_threads", DEFAULT_N_THREADS)))),
    )
    parser.add_argument(
        "--n-batch",
        type=int,
        default=int(os.getenv("LLAMA_CPP_N_BATCH", str(llm_conf.get("n_batch", DEFAULT_N_BATCH)))),
    )
    parser.add_argument(
        "--n-ubatch",
        type=int,
        default=int(os.getenv("LLAMA_CPP_N_UBATCH", str(llm_conf.get("n_ubatch", DEFAULT_N_UBATCH)))),
    )

    parser.add_argument("--chat-format", default=os.getenv("LLAMA_CPP_CHAT_FORMAT"))

    parser.add_argument("--timeout", type=int, default=int(os.getenv("LLAMA_CPP_TIMEOUT", DEFAULT_TIMEOUT)))

    parser.add_argument(
        "--force-json",
        action=argparse.BooleanOptionalAction,
        default=os.getenv("LLAMA_CPP_FORCE_JSON", "true").lower() in {"1", "true", "yes", "on"},
        help="Force response_format={type: json_object} unless the request overrides it.",
    )
    parser.add_argument(
        "--flash-attn",
        action=argparse.BooleanOptionalAction,
        default=os.getenv("LLAMA_CPP_FLASH_ATTN", "true").lower() in {"1", "true", "yes", "on"},
    )
    parser.add_argument(
        "--offload-kqv",
        action=argparse.BooleanOptionalAction,
        default=os.getenv("LLAMA_CPP_OFFLOAD_KQV", "true").lower() in {"1", "true", "yes", "on"},
    )
    parser.add_argument(
        "--use-mmap",
        action=argparse.BooleanOptionalAction,
        default=os.getenv("LLAMA_CPP_USE_MMAP", "true").lower() in {"1", "true", "yes", "on"},
    )
    parser.add_argument(
    "--enable-thinking",
    action=argparse.BooleanOptionalAction,
    default=os.getenv("LLAMA_CPP_ENABLE_THINKING", "true").lower() in {"1", "true", "yes", "on"},
)

    parser.add_argument(
        "--show-thinking",
        action=argparse.BooleanOptionalAction,
        default=os.getenv("LLAMA_CPP_SHOW_THINKING", "false").lower() in {"1", "true", "yes", "on"},
    )

    parser.add_argument("--verbose", action="store_true")

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    llm = _load_llm(args)

    try:
        server = NemotronLlamaCppServer(
            (args.host, args.port),
            NemotronHandler,
            llm=llm,
            model_name=args.model,
            model_path=str(Path(args.model_path).expanduser()),
            request_timeout=args.timeout,
            force_json=args.force_json,
            enable_thinking=args.enable_thinking,
            show_thinking=args.show_thinking,
        )
    except OSError as exc:
        raise SystemExit(
            f"Could not bind http://{args.host}:{args.port}: {exc}. "
            "Choose a free port with --port."
        ) from exc

    def shutdown(signum: int, _frame: Any) -> None:
        print(f"\nReceived signal {signum}; stopping server.", flush=True)
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(
        f"Nemotron llama-cpp-python server listening on "
        f"http://{args.host}:{args.port}/api/v1/chat",
        flush=True,
    )

    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()