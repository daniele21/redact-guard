import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Cpu, FileText, LockKeyhole, Settings2, Shield, ShieldCheck } from 'lucide-react';
import { useDocument } from './hooks/useDocument';
import { useProfiles } from './hooks/useProfiles';
import { api } from './services/api';
import { WorkspaceHome } from './components/workspace/WorkspaceHome';
import { PolicyLibrary } from './components/workspace/PolicyLibrary';
import { ModelCenter } from './components/workspace/ModelCenter';
import { PrivacyPanel } from './components/workspace/PrivacyPanel';
import { ReviewStep } from './components/review/ReviewStep';
import { ExportStep } from './components/export/ExportStep';
import type { HealthResponse, ReviewDecision } from './types';

type Screen = 'home' | 'policy' | 'models' | 'privacy' | 'review' | 'export';
type RuntimePhase = 'starting' | 'ready' | 'offline' | 'error';

const initialProfile = (): string => {
  try { return window.localStorage.getItem('redactguard.activeProfile') || 'general'; }
  catch { return 'general'; }
};

export default function App() {
  const { state, upload, analyzePage, batchAnalyzePages, applyRedactions, reset } = useDocument();
  const { profiles } = useProfiles();
  const [screen, setScreen] = useState<Screen>('home');
  const [activeProfile, setActiveProfile] = useState(initialProfile);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [runtime, setRuntime] = useState<RuntimePhase>('starting');
  const [healthRequest, setHealthRequest] = useState(0);
  const [privacyNotice, setPrivacyNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const check = async (attempt: number) => {
      try {
        const next = await api.health();
        if (cancelled) return;
        setHealth(next);
        setRuntime(next.llm_status === 'online' ? 'ready' : 'offline');
      } catch {
        if (cancelled) return;
        if (attempt < 20) retryTimer = setTimeout(() => void check(attempt + 1), 1000);
        else setRuntime('error');
      }
    };
    void check(0);
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [healthRequest]);

  const refreshRuntime = useCallback(() => {
    setRuntime('starting');
    setHealthRequest(value => value + 1);
  }, []);

  const changeProfile = (name: string) => {
    setActiveProfile(name);
    try { window.localStorage.setItem('redactguard.activeProfile', name); } catch { /* persistence unavailable */ }
  };

  const openHome = () => setScreen('home');
  const openReview = () => { if (state.docId) setScreen('review'); };
  const discardDocument = () => {
    if (state.docId && !window.confirm('Chiudere il documento corrente? La sessione di revisione non sarà più disponibile in questa finestra.')) return;
    reset();
    setScreen('home');
  };
  const importFile = async (file: File) => {
    if (state.docId && !window.confirm('Importare un nuovo PDF e sostituire la sessione corrente?')) return;
    await upload(file, activeProfile);
    setScreen('review');
  };
  const applyAndExport = async (decisions: Record<string, ReviewDecision>) => {
    if (!state.docId) return;
    await applyRedactions(Object.entries(decisions).map(([field_id, decision]) => ({ field_id, decision })));
  };

  if (runtime === 'starting' && !health) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface text-on-surface" role="status">
      <Shield size={40} className="text-primary" aria-hidden="true" />
      <h1 className="text-xl font-semibold">Avvio di RedactGuard</h1>
      <p className="text-sm text-on-surface-variant">Collegamento al backend locale…</p>
    </div>;
  }

  if (runtime === 'error' && !health) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-surface px-6 text-center">
      <Shield size={38} className="text-warning" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Backend locale non disponibile</h1>
      <p className="max-w-md text-sm leading-6 text-on-surface-variant">Impossibile collegarsi al processo locale di RedactGuard. Nessun documento è stato caricato.</p>
      <button type="button" className="rg-primary-button" onClick={refreshRuntime}>Riprova</button>
    </div>;
  }

  const activeLabel = profiles.find(profile => profile.name === activeProfile)?.display_name ?? activeProfile;
  return (
    <div className="rg-shell flex min-h-screen flex-col bg-surface text-on-surface">
      <header className="rg-topbar sticky top-0 z-40 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-outline-variant/60 px-5 py-3 lg:px-9">
        <button type="button" className="flex items-center gap-2.5 text-left" onClick={openHome} aria-label="RedactGuard · Home">
          <span className="rounded-xl bg-primary/15 p-2 text-primary"><Shield size={20} aria-hidden="true" /></span>
          <span className="text-lg font-semibold tracking-tight">RedactGuard</span>
        </button>
        <nav aria-label="Navigazione principale" className="flex flex-wrap items-center gap-1 sm:gap-3">
          <button type="button" onClick={openHome} aria-current={screen === 'home' ? 'page' : undefined} className={'rg-nav-link ' + (screen === 'home' ? 'rg-nav-active' : '')}><FileText size={16} aria-hidden="true" /> Documenti</button>
          <button type="button" onClick={() => setScreen('policy')} aria-current={screen === 'policy' ? 'page' : undefined} className={'rg-nav-link ' + (screen === 'policy' ? 'rg-nav-active' : '')}><BookOpen size={16} aria-hidden="true" /> Libreria PII</button>
          <button type="button" onClick={() => setScreen('models')} aria-current={screen === 'models' ? 'page' : undefined} className={'rg-nav-link ' + (screen === 'models' ? 'rg-nav-active' : '')}><Cpu size={16} aria-hidden="true" /> Modello locale</button>
          <button type="button" onClick={() => setScreen('privacy')} aria-current={screen === 'privacy' ? 'page' : undefined} className={'rg-nav-link ' + (screen === 'privacy' ? 'rg-nav-active' : '')}><Settings2 size={16} aria-hidden="true" /> Privacy</button>
        </nav>
        <button type="button" onClick={() => setScreen('models')} className="flex items-center gap-2 rounded-full border border-outline-variant/70 px-3 py-2 text-xs text-on-surface-variant hover:border-primary/50" title="Dettagli del modello locale">
          <span className={'h-2 w-2 rounded-full ' + (runtime === 'ready' ? 'bg-success' : 'bg-warning')} aria-hidden="true" />
          <span className="hidden xl:inline">{runtime === 'ready' ? 'AI locale pronta' : 'AI locale da configurare'}</span>
          <span className="max-w-32 truncate">{health?.model ?? 'Korgis'}</span>
        </button>
      </header>
      {state.docId && screen !== 'review' && screen !== 'export' && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/40 bg-surface-container-low px-5 py-2 text-sm lg:px-9">
          <span className="truncate text-on-surface-variant">Documento aperto · {state.summary?.filename ?? 'Sessione in corso'} · policy {state.profile}</span>
          <div className="flex gap-3"><button type="button" onClick={openReview} className="font-medium text-primary">Riprendi revisione</button><button type="button" onClick={discardDocument} className="text-on-surface-variant hover:text-on-surface">Chiudi</button></div>
        </div>
      )}
      {screen === 'home' && <WorkspaceHome
        profileLabel={activeLabel}
        modelName={health?.model ?? 'Non disponibile'}
        runtimeReady={runtime === 'ready'}
        busy={state.isUploading}
        onImport={importFile}
        onPolicy={() => setScreen('policy')}
        onModel={() => setScreen('models')}
      />}
      {screen === 'policy' && <PolicyLibrary activeProfile={activeProfile} onChooseProfile={changeProfile} onBack={openHome} />}
      {screen === 'models' && <ModelCenter health={health} onBack={openHome} onRetry={refreshRuntime} />}
      {screen === 'privacy' && <PrivacyPanel onBack={openHome} onNotice={setPrivacyNotice} notice={privacyNotice} />}
      {screen === 'review' && state.docId && (
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/40 px-5 py-3 lg:px-9">
            <button type="button" onClick={openHome} className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface"><ArrowLeft size={16} aria-hidden="true" /> Documenti</button>
            <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
              <span className="flex items-center gap-1"><ShieldCheck size={14} aria-hidden="true" /> Policy di questo documento: {state.profile}</span>
              <span>{state.summary?.pages_analyzed ?? state.analyzedCount} / {state.pages.length} pagine analizzate</span>
            </div>
          </div>
          {runtime !== 'ready' && <p role="status" className="border-b border-warning/30 bg-warning/5 px-6 py-3 text-sm text-warning">Korgis non è pronto: puoi consultare il documento, ma l'analisi richiede un modello locale residente. <button type="button" className="underline" onClick={() => setScreen('models')}>Dettagli</button></p>}
          <ReviewStep state={state} onAnalyzePage={analyzePage} onBatchAnalyzePages={batchAnalyzePages} onApplyRedactions={applyAndExport} onProceed={() => setScreen('export')} />
        </main>
      )}
      {screen === 'export' && state.docId && <main className="flex-1 px-4 py-8"><ExportStep state={state} onReset={discardDocument} /></main>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/40 px-6 py-4 text-xs text-on-surface-variant lg:px-10">
        <span className="flex items-center gap-2"><LockKeyhole size={14} aria-hidden="true" /> AI e documenti sul dispositivo · revisione umana necessaria</span>
        <span>PDF in ingresso · Markdown protetto in uscita</span>
      </footer>
    </div>
  );
}
