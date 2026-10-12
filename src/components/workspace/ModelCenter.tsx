import { ArrowLeft, Cpu, Info, LockKeyhole, RefreshCw, ServerOff } from 'lucide-react';
import type { HealthResponse } from '../../types';

interface Props {
  health: HealthResponse | null;
  onBack: () => void;
  onRetry: () => void;
}

export function ModelCenter({ health, onBack, onRetry }: Props) {
  const online = health?.llm_status === 'online';
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 lg:px-12">
      <button type="button" onClick={onBack} className="mb-8 flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface"><ArrowLeft size={16} aria-hidden="true" /> Torna ai documenti</button>
      <div className="mb-8 flex items-center gap-3 text-primary"><Cpu size={23} aria-hidden="true" /><span className="text-sm">AI locale · Korgis</span></div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Il tuo modello locale</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-on-surface-variant">Il modello configurato rimane attivo tra un documento e l'altro. Non è necessario sceglierlo a ogni importazione.</p>

      <section className="rg-context-card mt-9 rounded-3xl p-6 md:p-8" aria-label="Stato del modello configurato">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-on-surface-variant">Modello configurato nel backend</p>
            <h2 className="mt-2 break-all text-2xl font-medium">{health?.model ?? 'Non disponibile'}</h2>
          </div>
          <span className={'rounded-full border px-3 py-1.5 text-xs ' + (online ? 'border-success/30 text-success' : 'border-warning/40 text-warning')}>
            {online ? 'Pronto per l’analisi' : health?.llm_status === 'model_not_resident' ? 'Modello non residente' : 'Runtime non disponibile'}
          </span>
        </div>
        <div className="my-6 h-px bg-outline-variant/50" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs text-on-surface-variant">Esecuzione</p><p className="mt-2 flex items-center gap-2 text-sm"><LockKeyhole size={15} aria-hidden="true" /> Sul dispositivo</p></div>
          <div><p className="text-xs text-on-surface-variant">Identità runtime</p><p className="mt-2 break-all text-sm">{health?.korgis_protocol_version ?? 'Non disponibile'}</p></div>
          <div><p className="text-xs text-on-surface-variant">Prestazioni PII e requisiti hardware</p><p className="mt-2 text-sm">Nessuna misura qualificata collegata</p></div>
        </div>
        <button type="button" onClick={onRetry} className="rg-secondary-button mt-7 flex items-center gap-2"><RefreshCw size={16} aria-hidden="true" /> Aggiorna stato</button>
      </section>

      {!online && <div role="status" className="mt-5 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-5">
        <ServerOff size={21} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
        <div><h3 className="font-medium">Korgis richiede attenzione</h3>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">Il runtime deve essere avviato e il modello configurato deve essere residente. Puoi consultare e personalizzare le PII anche senza un modello disponibile. RedactGuard non sostituisce automaticamente il modello configurato.</p></div>
      </div>}
      <div className="mt-7 flex items-start gap-3 text-on-surface-variant">
        <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="max-w-3xl text-sm leading-6">Il catalogo con selezione persistente, controllo hardware e confronto benchmark verrà collegato alle API di Korgis e al benchmark RedactGuard prima di abilitare il cambio modello dall'interfaccia. Non mostriamo stime di qualità, RAM o compatibilità prive di evidenza. Attualmente la scelta si configura tramite Korgis e la configurazione locale dell'app.</p>
      </div>
    </main>
  );
}
