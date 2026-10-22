import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Cpu, Info, LockKeyhole, RefreshCw, ServerOff, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';
import type { HealthResponse, LocalModelCatalog } from '../../types';

interface Props {
  health: HealthResponse | null;
  onBack: () => void;
  onRetry: () => void;
}

export function ModelCenter({ health, onBack, onRetry }: Props) {
  const [catalog, setCatalog] = useState<LocalModelCatalog | null>(null);
  const [candidate, setCandidate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const choices = catalog?.choices?.length ? catalog.choices : (catalog?.models ?? []).map(model => ({ model_id: model, startup_key: model, downloaded: true, resident: true }));
  const selectedChoice = choices.find(choice => choice.model_id === candidate);
  const canSelect = Boolean(selectedChoice?.downloaded && candidate !== catalog?.selected_model);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await api.getLocalModels();
      setCatalog(next);
      setCandidate(next.selected_model);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile verificare i modelli di Korgis.');
    } finally {
      setLoading(false);
    }
  }, []);

  // When Korgis finishes loading, refresh the resident catalog automatically.
  useEffect(() => { void refresh(); }, [refresh, health?.llm_status === 'online']);

  const save = async () => {
    if (!candidate || !catalog || candidate === catalog.selected_model) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const next = await api.selectLocalModel(candidate);
      setCatalog(next);
      setCandidate(next.selected_model);
      setNotice(next.selected_resident ? 'Modello selezionato e già residente.' : health?.korgis_mode === 'managed' ? 'Scelta salvata. Riavvia RedactGuard per caricare il modello con Korgis gestito.' : 'Scelta salvata. In modalità esterna, carica il modello in Korgis e aggiorna l’elenco.');
      onRetry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare il modello locale.');
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 lg:px-12">
      <button type="button" onClick={onBack} className="mb-8 flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft size={16} aria-hidden="true" /> Torna ai documenti
      </button>
      <div className="mb-5 flex items-center gap-3 text-primary"><Cpu size={22} aria-hidden="true" /> <span className="text-sm">AI locale · Korgis</span></div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Il modello giusto, una sola volta.</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-on-surface-variant">
        Scegli tra i modelli di testo registrati in Korgis, anche non ancora scaricati o residenti. I modelli non scaricati non sono selezionabili; l’attivazione dipende dalla modalità del runtime.
      </p>

      <section className="rg-context-card mt-8 rounded-3xl p-6 md:p-8" aria-label="Modello configurato">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-on-surface-variant">Modello attivo in RedactGuard</p>
            <h2 className="mt-2 break-all text-2xl font-medium">{catalog?.selected_model ?? health?.model ?? 'Da verificare'}</h2>
          </div>
          <span className={'rounded-full border px-3 py-1.5 text-xs ' +
            (catalog?.selected_resident ? 'border-success/40 text-success' : 'border-warning/40 text-warning')}>
            {catalog?.selected_resident ? 'Residente in Korgis' : health?.korgis_mode === 'managed' ? 'Non residente · riavvio necessario' : 'Non residente nel Korgis esterno'}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-5 text-xs text-on-surface-variant">
          <span className="flex items-center gap-2"><LockKeyhole size={15} aria-hidden="true" /> Inferenza locale</span>
          <span>Protocollo: {health?.korgis_protocol_version ?? 'Non disponibile'}</span>
          <span>Requisiti RAM e benchmark PII: <strong className="font-medium text-on-surface">non ancora qualificati</strong></span>
        </div>
      </section>

      <details className="mt-5 rounded-2xl border border-outline-variant/60 bg-surface-container-low/60 p-5">
        <summary className="cursor-pointer rounded-lg text-sm font-medium text-on-surface marker:text-primary focus-visible:outline-2 focus-visible:outline-primary">
          Informazioni tecniche del dispositivo e del runtime
        </summary>
        <div className="mt-5">
        <div className="mb-3 flex items-center gap-2"><Cpu size={17} className="text-primary" aria-hidden="true" /><h2 className="text-sm font-semibold">Il tuo hardware · fonte Korgis</h2></div>
        {catalog?.hardware ? (
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div><div className="text-xs text-on-surface-variant">Sistema</div><div className="mt-1">{[catalog.hardware.system, catalog.hardware.machine].filter(Boolean).join(' · ') || 'Non disponibile'}</div></div>
            <div><div className="text-xs text-on-surface-variant">CPU logiche</div><div className="mt-1">{catalog.hardware.logical_cpus ?? 'Non disponibile'}</div></div>
            <div><div className="text-xs text-on-surface-variant">Memoria totale rilevata</div><div className="mt-1">{catalog.hardware.total_memory_bytes ? (catalog.hardware.total_memory_bytes / 1024 ** 3).toFixed(1) + ' GiB' : 'Non disponibile'}</div></div>
          </div>
        ) : <p className="text-sm text-on-surface-variant">Identità hardware non disponibile dal runtime corrente.</p>}
        <p className="mt-3 text-xs text-on-surface-variant">Questi sono dati identificativi del computer restituiti dal runtime, non requisiti minimi o benchmark del modello.</p>
        <div className="mt-4 border-t border-outline-variant/50 pt-3 text-xs text-on-surface-variant">
          Korgis: {health?.korgis_mode === 'managed' ? 'gestito dall’app' : 'runtime esterno'} ·
          Compatibilità: {health?.korgis_compatibility ?? 'non verificata'} ·
          Provenienza delle metriche per richiesta: {health?.korgis_request_evidence_supported ? 'supportata' : 'non disponibile'}
        </div>
        </div>
      </details>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Catalogo modelli Korgis</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Registrati, scaricati e residenti sono stati diversi. La lista proviene dal runtime collegato.</p>
        </div>
        <button type="button" onClick={() => { void refresh(); onRetry(); }} disabled={loading || saving} className="rg-secondary-button flex items-center gap-2">
          <RefreshCw size={16} aria-hidden="true" /> Aggiorna elenco
        </button>
      </div>

      {loading ? <p role="status" className="mt-5 rounded-xl bg-surface-container-low p-5 text-sm text-on-surface-variant">Verifica dei modelli locali…</p>
      : !catalog?.discovery_available ? (
        <div role="status" className="mt-5 flex gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-5">
          <ServerOff size={20} className="shrink-0 text-warning" aria-hidden="true" />
          <div><h3 className="font-medium">Korgis non è raggiungibile</h3><p className="mt-1 text-sm leading-6 text-on-surface-variant">{health?.korgis_mode === 'managed' ? 'RedactGuard avvia Korgis automaticamente. Il modello potrebbe essere ancora in caricamento o aver riscontrato un errore; la scelta salvata non cambia.' : "La scelta salvata non cambia. Avvia Korgis esternamente e aggiorna l'elenco."}</p></div>
        </div>
      ) : !catalog.catalog_available && choices.length === 0 ? (
        <div role="status" className="mt-5 flex gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-5">
          <ServerOff size={20} className="shrink-0 text-warning" aria-hidden="true" />
          <div><h3 className="font-medium">Catalogo Korgis non disponibile</h3><p className="mt-1 text-sm leading-6 text-on-surface-variant">Il runtime risponde, ma non espone il catalogo dei modelli registrati. {health?.korgis_mode === 'external' ? 'In sviluppo RedactGuard si collega a Korgis esterno: potrebbe essere una versione precedente. ' : 'Verifica il Korgis gestito dalla build. '}Non significa che non esistano modelli scaricati.</p></div>
        </div>
      ) : choices.length === 0 ? (
        <div role="status" className="mt-5 rounded-2xl border border-outline-variant p-6 text-sm text-on-surface-variant">Il catalogo collegato non contiene modelli di testo compatibili. Verifica il registry Korgis.</div>
      ) : (
        <div className="mt-5 space-y-2">
          {!catalog.catalog_available && <p role="status" className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm text-on-surface-variant">Catalogo dei modelli registrati non disponibile: vengono mostrati soltanto i modelli residenti rilevabili dal runtime legacy.</p>}
          <div className="space-y-2" role="radiogroup" aria-label="Seleziona modello locale per i prossimi documenti">
          {choices.map(choice => (
            <label key={choice.startup_key} className={'flex items-center gap-4 rounded-2xl border p-4 transition-colors ' +
              (choice.downloaded ? 'cursor-pointer ' : 'opacity-60 ') +
              (candidate === choice.model_id ? 'border-primary/60 bg-primary/10' : 'border-outline-variant/60 bg-surface-container-lowest/70 hover:border-primary/30')}>
              <input type="radio" name="resident-model" value={choice.model_id}
                checked={candidate === choice.model_id} onChange={() => { setCandidate(choice.model_id); setNotice(''); }}
                disabled={saving || !choice.downloaded} className="accent-primary" />
              <div className="min-w-0 flex-1"><div className="break-all text-sm font-medium">{choice.model_id}</div>
                <div className="mt-1 text-xs text-on-surface-variant">{choice.resident ? 'Residente' : choice.downloaded ? 'Scaricato · richiede riavvio per l’attivazione' : 'Non scaricato · usare Korgis CLI per il download'} · prestazioni PII non qualificate</div></div>
              {catalog.selected_model === choice.model_id && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 size={15} aria-hidden="true" /> Salvato</span>}
            </label>
          ))}
          </div>
        </div>
      )}

      {catalog?.discovery_available && choices.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-lg text-xs leading-5 text-on-surface-variant">La selezione non modifica i job già avviati. Per caricare un modello non residente, riavvia l’app in modalità gestita oppure caricalo in Korgis esterno. Nessun download automatico.</p>
          <button type="button" className="rg-primary-button" onClick={() => { void save(); }}
            disabled={saving || loading || !canSelect}>
            {saving ? 'Salvataggio…' : 'Usa questo modello'}
          </button>
        </div>
      )}
      {notice && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-success"><ShieldCheck size={17} aria-hidden="true" /> {notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">{error}</p>}

      <div className="mt-9 flex items-start gap-3 text-on-surface-variant">
        <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-sm leading-6">I modelli non residenti vanno gestiti da Korgis: RedactGuard non abilita API amministrative prive di autenticazione. Non vengono mostrate classifiche di accuratezza, velocità o fabbisogno hardware senza benchmark misurati e riconducibili al modello e al dispositivo.</p>
      </div>
    </main>
  );
}
