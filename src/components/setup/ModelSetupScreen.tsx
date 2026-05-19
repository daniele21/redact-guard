import React, { useState, useEffect } from 'react';

interface DownloadProgress {
  downloaded_mb: number;
  total_mb: number;
  percent: number;
}

type Phase = 'prompt' | 'downloading' | 'done' | 'error';

interface Props {
  onReady: () => void;
}

export function ModelSetupScreen({ onReady }: Props) {
  const [phase, setPhase] = useState<Phase>('prompt');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (phase !== 'downloading') return;

    let unlisten1: (() => void) | undefined;
    let unlisten2: (() => void) | undefined;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const { invoke } = await import('@tauri-apps/api/core');

        unlisten1 = await listen<DownloadProgress>('model-download-progress', (e) => {
          setProgress(e.payload);
        });

        unlisten2 = await listen('model-download-complete', () => {
          setPhase('done');
          setTimeout(onReady, 1200);
        });

        await invoke('download_model');
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    })();

    return () => {
      unlisten1?.();
      unlisten2?.();
    };
  }, [phase, onReady]);

  if (phase === 'prompt') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.607L5 14.5m14.8.5l1.196 4.786a1.5 1.5 0 01-1.45 1.914H4.454a1.5 1.5 0 01-1.45-1.914L4.2 15m0 0l.393-1.571" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-on-surface mb-2">AI Model Required</h1>
          <p className="text-on-surface-variant mb-6">
            RedactGuard runs entirely on your device — no data is sent to the cloud.
            To detect PII, it needs a local AI model.
          </p>

          <div className="bg-surface-variant rounded-xl p-4 mb-6 border border-outline-variant">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-on-primary font-bold text-xs">AI</span>
              </div>
              <div>
                <p className="font-semibold text-on-surface text-sm">NVIDIA Nemotron 3 Nano 4B</p>
                <p className="text-on-surface-variant text-xs mt-0.5">
                  Quantized GGUF · Q4_K_M · ~2.5 GB · Runs 100% locally
                </p>
                <p className="text-on-surface-variant text-xs mt-2">
                  Fast, privacy-preserving model optimised for document analysis and PII detection.
                  No GPU required — works on Apple Silicon with Metal acceleration.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface-variant/50 rounded-lg p-3 mb-6 flex items-start gap-2 border border-outline-variant">
            <svg className="w-4 h-4 text-on-surface-variant flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-on-surface-variant">
              The model is downloaded once to <code className="bg-surface rounded px-1 font-mono">~/.redactguard/models/</code> and reused on every launch.
              You need ~2.5 GB of free disk space and an internet connection.
            </p>
          </div>

          <button
            onClick={() => setPhase('downloading')}
            className="w-full bg-primary text-on-primary font-semibold py-3 px-6 rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Nemotron (~2.5 GB)
          </button>

          <p className="text-xs text-center text-on-surface-variant mt-3">
            Source: Hugging Face · lmstudio-community
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'downloading') {
    const pct = progress?.percent ?? 0;
    const dlMb = progress?.downloaded_mb ?? 0;
    const totalMb = progress?.total_mb ?? 2500;

    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-primary animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-on-surface mb-1">Downloading AI Model</h1>
          <p className="text-on-surface-variant text-sm mb-6">
            NVIDIA Nemotron 3 Nano 4B · Please keep the app open
          </p>

          <div className="w-full bg-surface-variant rounded-full h-3 mb-3 overflow-hidden">
            <div
              className="bg-primary h-3 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>

          <div className="flex justify-between text-sm text-on-surface-variant">
            <span>{dlMb.toFixed(0)} MB / {totalMb.toFixed(0)} MB</span>
            <span>{pct.toFixed(1)}%</span>
          </div>

          {!progress && (
            <p className="text-xs text-on-surface-variant mt-4 text-center animate-pulse">
              Connecting to Hugging Face…
            </p>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-on-surface mb-2">Model Ready</h1>
          <p className="text-on-surface-variant text-sm">Starting RedactGuard…</p>
        </div>
      </div>
    );
  }

  // error
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center">
        <div className="w-16 h-16 bg-error/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
          <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M6 20h12a2 2 0 002-2V8l-5-5H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-on-surface mb-2">Download Failed</h1>
        <p className="text-on-surface-variant text-sm mb-6 font-mono bg-surface-variant rounded p-2 text-left break-all">{errorMsg}</p>
        <button
          onClick={() => { setPhase('downloading'); setErrorMsg(''); setProgress(null); }}
          className="bg-primary text-on-primary font-semibold py-2 px-6 rounded-xl hover:bg-primary/90 transition-all"
        >
          Retry Download
        </button>
      </div>
    </div>
  );
}
