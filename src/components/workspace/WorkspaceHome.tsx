import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { ArrowRight, FileText, FolderOpen, LockKeyhole, ShieldCheck, SlidersHorizontal, Cpu } from 'lucide-react';

interface Props {
  profileLabel: string;
  modelName: string;
  runtimeReady: boolean;
  busy: boolean;
  onImport: (file: File) => Promise<void>;
  onPolicy: () => void;
  onModel: () => void;
}

export function WorkspaceHome({ profileLabel, modelName, runtimeReady, busy, onImport, onPolicy, onModel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const chooseFile = (next: File | undefined) => {
    if (!next) return;
    setError('');
    if (!next.name.toLowerCase().endsWith('.pdf')) {
      setError('Per ora RedactGuard supporta soltanto file PDF.');
      return;
    }
    if (next.size > 50 * 1024 * 1024) {
      setError('Il PDF supera il limite attuale di 50 MB.');
      return;
    }
    setFile(next);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    chooseFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 1) {
      setError('L’elaborazione multi-documento non è ancora disponibile. Seleziona un PDF.');
      return;
    }
    chooseFile(event.dataTransfer.files[0]);
  };

  const start = async () => {
    if (!file || busy) return;
    setError('');
    try {
      await onImport(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile importare il PDF.');
    }
  };

  return (
    <main className="rg-home mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-10 lg:px-12">
      <div className="mb-10 max-w-3xl">
        <div className="mb-5 flex items-center gap-2 text-sm text-success">
          <LockKeyhole size={16} aria-hidden="true" /> Elaborazione dei documenti sul dispositivo
        </div>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-on-surface sm:text-5xl">
          Proteggi ciò che condividi. <span className="text-primary">Mantieni il controllo.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-on-surface-variant">
          Importa un PDF, identifica le informazioni sensibili con AI locale e decidi cosa oscurare prima dell'esportazione.
        </p>
      </div>

      <div className="rg-home-drop rounded-[28px] p-2">
        <div
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={'flex min-h-64 flex-col items-center justify-center rounded-[22px] border-2 border-dashed px-6 py-10 text-center transition-colors ' +
            (dragging ? 'border-primary bg-primary/10' : 'border-outline-variant/70 bg-surface-container-low/30')}
        >
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="sr-only" onChange={handleInput} aria-label="Seleziona un documento PDF" />
          <div className="mb-5 rounded-2xl bg-primary/10 p-4 text-primary"><FolderOpen size={30} aria-hidden="true" /></div>
          {file ? (
            <>
              <h2 className="max-w-full truncate text-lg font-semibold">{file.name}</h2>
              <p className="mt-2 text-sm text-on-surface-variant">{(file.size / 1024 / 1024).toFixed(1)} MB · PDF selezionato</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button type="button" onClick={() => inputRef.current?.click()} className="rg-secondary-button">Cambia file</button>
                <button type="button" onClick={start} disabled={busy} className="rg-primary-button flex items-center gap-2">
                  {busy ? 'Importazione…' : 'Apri documento'} <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold">Il tuo prossimo documento</h2>
              <p className="mt-2 text-sm text-on-surface-variant">Trascina un PDF qui oppure selezionalo dal computer.</p>
              <button type="button" onClick={() => inputRef.current?.click()} className="rg-primary-button mt-6">Importa PDF</button>
            </>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={onPolicy} className="rg-context-card group flex items-center gap-3 rounded-2xl px-5 py-4 text-left">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><SlidersHorizontal size={19} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1"><div className="text-xs text-on-surface-variant">Policy usata per il prossimo PDF</div><div className="truncate font-medium">{profileLabel}</div></div>
          <ArrowRight size={16} className="text-on-surface-variant group-hover:text-primary" aria-hidden="true" />
        </button>
        <button type="button" onClick={onModel} className="rg-context-card group flex items-center gap-3 rounded-2xl px-5 py-4 text-left">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Cpu size={19} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1"><div className="text-xs text-on-surface-variant">Modello configurato · {runtimeReady ? 'Pronto' : 'Richiede attenzione'}</div><div className="truncate font-medium">{modelName}</div></div>
          <ArrowRight size={16} className="text-on-surface-variant group-hover:text-primary" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-6 flex items-center gap-2 text-xs text-on-surface-variant"><ShieldCheck size={15} aria-hidden="true" /> Il documento viene elaborato localmente. Verifica sempre il risultato prima di condividerlo.</div>
    </main>
  );
}
