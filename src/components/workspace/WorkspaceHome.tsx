import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { ArrowRight, Cpu, FileText, FolderOpen, LockKeyhole, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import type { ImportError } from '../../hooks/useDocument';

interface Props {
  profileLabel: string;
  modelName: string;
  runtimeReady: boolean;
  busy: boolean;
  importingFile: string;
  onImport: (files: File[]) => Promise<{ added: number; errors: ImportError[] }>;
  onPolicy: () => void;
  onModel: () => void;
}

export function WorkspaceHome({ profileLabel, modelName, runtimeReady, busy, importingFile, onImport, onPolicy, onModel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [failures, setFailures] = useState<ImportError[]>([]);

  const select = (selected: File[]) => {
    setError('');
    setFailures([]);
    if (!selected.length) return;
    if (selected.length > 25) {
      setError('Seleziona fino a 25 PDF per volta.');
      return;
    }
    setFiles(selected);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    select(Array.from(event.target.files ?? []));
    event.target.value = '';
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    select(Array.from(event.dataTransfer.files));
  };

  const start = async () => {
    if (!files.length || busy) return;
    setError('');
    try {
      const outcome = await onImport(files);
      setFailures(outcome.errors);
      if (outcome.added > 0) setFiles([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Importazione non riuscita.');
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
          Importa uno o più PDF, rileva dati sensibili con AI locale e controlla ogni risultato prima di esportarlo.
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
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" multiple className="sr-only"
            onChange={handleInput} aria-label="Seleziona uno o più PDF" disabled={busy} />
          <div className="mb-5 rounded-2xl bg-primary/10 p-4 text-primary"><FolderOpen size={30} aria-hidden="true" /></div>
          {files.length ? (
            <>
              <h2 className="text-xl font-semibold">{files.length} {files.length === 1 ? 'documento selezionato' : 'documenti selezionati'}</h2>
              <ul className="mt-3 max-h-36 w-full max-w-md space-y-1 overflow-y-auto text-left text-sm">
                {files.map((file, index) => <li key={index} className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2">
                  <FileText size={14} className="shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-on-surface-variant">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                </li>)}
              </ul>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="rg-secondary-button">Cambia selezione</button>
                <button type="button" onClick={() => { void start(); }} disabled={busy} className="rg-primary-button flex items-center gap-2">
                  {busy ? 'Importazione in corso…' : 'Importa documenti'} <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
              {busy && <p role="status" className="mt-3 text-xs text-on-surface-variant">Importazione corrente: {importingFile}</p>}
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold">I tuoi prossimi documenti</h2>
              <p className="mt-2 text-sm text-on-surface-variant">Trascina PDF qui oppure selezionali dal computer, fino a 25 per volta.</p>
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="rg-primary-button mt-6">Importa PDF</button>
            </>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>}
      {failures.length > 0 && <div role="alert" className="mt-4 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
        <p className="font-semibold">Alcuni file non sono stati importati</p>
        <ul className="mt-2 space-y-1">{failures.map((item, index) => <li key={index}>{item.filename || 'Importazione'}: {item.message}</li>)}</ul>
      </div>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={onPolicy} className="rg-context-card group flex items-center gap-3 rounded-2xl px-5 py-4 text-left">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><SlidersHorizontal size={19} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1"><div className="text-xs text-on-surface-variant">Policy dei prossimi PDF</div><div className="truncate font-medium">{profileLabel}</div></div>
          <ArrowRight size={16} className="text-on-surface-variant group-hover:text-primary" aria-hidden="true" />
        </button>
        <button type="button" onClick={onModel} className="rg-context-card group flex items-center gap-3 rounded-2xl px-5 py-4 text-left">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Cpu size={19} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1"><div className="text-xs text-on-surface-variant">Modello attivo · {runtimeReady ? 'Pronto' : 'Richiede attenzione'}</div><div className="truncate font-medium">{modelName}</div></div>
          <ArrowRight size={16} className="text-on-surface-variant group-hover:text-primary" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-6 flex items-center gap-2 text-xs text-on-surface-variant"><ShieldCheck size={15} aria-hidden="true" /> Analisi indipendenti per PDF. L'esportazione rimane manuale per ogni documento.</div>
    </main>
  );
}
