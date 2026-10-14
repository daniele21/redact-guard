import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileSearch, LockKeyhole, PanelRightClose, PanelRightOpen, Search, ShieldOff } from 'lucide-react';
import type { DocumentState } from '../../hooks/useDocument';
import type { PIIField, ReviewDecision } from '../../types';
import { DocumentPanel } from './DocumentPanel';
import { fieldId } from './reviewIdentity';
import { reviewReadiness } from './reviewGate';

export interface ReviewDraft {
  decisions: Record<string, ReviewDecision>;
  visitedPages: number[];
}

interface Props {
  state: DocumentState;
  onAnalyzePage: (page: number, force?: boolean) => Promise<void>;
  onBatchAnalyzePages: (pages: number[], force?: boolean) => Promise<void>;
  onApplyRedactions: (decisions: Record<string, ReviewDecision>) => Promise<void>;
  onProceed: () => void;
  initialDraft?: ReviewDraft;
  onDraftChange?: (docId: string, draft: ReviewDraft) => void;
}

interface Group {
  id: string;
  label: string;
  type: string;
  masked: string;
  occurrences: Array<{ page: number; field: PIIField }>;
}

const maskValue = (value: string): string => {
  if (!value) return '••••';
  return value.length <= 4 ? value[0] + '•••' : value.slice(0, 2) + '••••' + value.slice(-2);
};

export function ReviewStep({ state, onAnalyzePage, onBatchAnalyzePages, onApplyRedactions, onProceed, initialDraft, onDraftChange }: Props) {
  const [page, setPage] = useState(1);
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>(() => initialDraft?.decisions ?? {});
  const [visitedPages, setVisitedPages] = useState<Set<number>>(() => new Set(initialDraft?.visitedPages ?? []));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [visibleGroups, setVisibleGroups] = useState(40);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const resultRef = useRef(state.analysisResults);
  const decisionsResultRef = useRef(state.analysisResults);

  const result = state.analysisResults[page];
  const pageData = state.pages.find(item => item.page_number === page);
  const total = state.pages.length;

  // New or re-run detection invalidates the old page-visit evidence.
  useEffect(() => {
    const changed = resultRef.current !== state.analysisResults;
    resultRef.current = state.analysisResults;
    setVisitedPages(previous => {
      if (changed) return state.analysisResults[page] && !state.analysisErrors[page] ? new Set([page]) : new Set();
      if (!state.analysisResults[page] || state.analysisErrors[page] || previous.has(page)) return previous;
      const next = new Set(previous);
      next.add(page);
      return next;
    });
  }, [state.analysisResults, state.analysisErrors, page]);

  useEffect(() => {
    if (state.docId) onDraftChange?.(state.docId, { decisions, visitedPages: Array.from(visitedPages) });
  }, [state.docId, decisions, visitedPages, onDraftChange]);

  // A repeated analysis invalidates prior keep/not_pii decisions for the
  // changed pages. New suggestions revert to the privacy-safe redact default.
  useEffect(() => {
    const prior = decisionsResultRef.current;
    decisionsResultRef.current = state.analysisResults;
    const changedPages = Object.entries(state.analysisResults)
      .filter(([number, result]) => prior[Number(number)] !== result)
      .map(([number]) => Number(number));
    if (!changedPages.length) return;
    setDecisions(previous => {
      const next = { ...previous };
      for (const number of changedPages) {
        for (const field of prior[number]?.pii_fields ?? []) delete next[fieldId(field, number)];
        for (const field of state.analysisResults[number].pii_fields) next[fieldId(field, number)] = 'redact';
      }
      return next;
    });
  }, [state.analysisResults]);

  // Privacy-safe initial decision: redact every valid model-proposed finding.
  useEffect(() => {
    setDecisions(previous => {
      const next = { ...previous };
      let changed = false;
      Object.entries(state.analysisResults).forEach(([pageValue, response]) => {
        response.pii_fields.forEach(field => {
          const id = fieldId(field, Number(pageValue));
          if (next[id] === undefined) { next[id] = 'redact'; changed = true; }
        });
      });
      return changed ? next : previous;
    });
  }, [state.analysisResults]);

  const groups = useMemo(() => {
    const entities = new Map<string, Group>();
    const masked = new Map((state.summary?.entities ?? []).map(item => [item.entity_id, item.masked_value]));
    Object.entries(state.analysisResults).forEach(([pageValue, response]) => {
      const pageNumber = Number(pageValue);
      response.pii_fields.forEach(field => {
        const id = field.entity_id;
        const existing = entities.get(id);
        if (existing) existing.occurrences.push({ page: pageNumber, field });
        else entities.set(id, {
          id,
          label: field.field_name,
          type: field.pii_type,
          masked: masked.get(id) ?? maskValue(field.value),
          occurrences: [{ page: pageNumber, field }],
        });
      });
    });
    return Array.from(entities.values()).sort((a, b) =>
      b.occurrences.length - a.occurrences.length || a.label.localeCompare(b.label));
  }, [state.analysisResults, state.summary]);

  const shownGroups = groups.filter(group =>
    [group.label, group.type, group.masked].join(' ').toLowerCase().includes(query.toLowerCase()));

  const overrides = useMemo(() => Object.fromEntries(
    Object.entries(decisions).map(([id, decision]) => [id, decision === 'redact'])
  ) as Record<string, boolean>, [decisions]);
  const excluded = useMemo(() => new Set(
    Object.entries(decisions).filter(([, decision]) => decision === 'not_pii').map(([id]) => id)
  ), [decisions]);

  const setGroupDecision = (group: Group, decision: ReviewDecision) => {
    setError('');
    setDecisions(previous => {
      const next = { ...previous };
      group.occurrences.forEach(({ page: sourcePage, field }) => {
        next[fieldId(field, sourcePage)] = decision;
      });
      return next;
    });
  };

  const toggleOccurrence = (id: string) => {
    setError('');
    setDecisions(previous => ({ ...previous, [id]: previous[id] === 'keep' ? 'redact' : 'keep' }));
  };

  const gate = reviewReadiness(state, visitedPages.size, saving);
  const canExport = gate.ready;
  const exportReason = gate.reason;

  const exportReviewed = async () => {
    if (!canExport) return;
    if (!window.confirm('Confermi di aver verificato tutte le pagine e le scelte? L’AI può non individuare ogni informazione sensibile.')) return;
    setSaving(true);
    setError('');
    try {
      await onApplyRedactions(decisions);
      onProceed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile applicare le decisioni.');
    } finally {
      setSaving(false);
    }
  };

  const changePage = (next: number) => {
    setPage(Math.max(1, Math.min(total, next)));
  };

  const jumpTo = (group: Group) => {
    const target = group.occurrences[0];
    setSelectedId(group.id);
    setPage(target.page);
    // The active source is deliberately the only area where full document content is shown.
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Revisione documento">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-9">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Revisione del documento</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Controlla i rilevamenti nel contesto e decidi cosa proteggere.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
          <span className="flex items-center gap-1"><FileSearch size={15} aria-hidden="true" /> {state.summary?.pages_analyzed ?? state.analyzedCount}/{total} pagine analizzate</span>
          <span>{groups.length} entità rilevate</span>
          <span>{visitedPages.size}/{total} pagine aperte</span>
          <button type="button" aria-expanded={inspectorOpen} aria-controls="pii-inspector"
            onClick={() => setInspectorOpen(current => !current)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-outline-variant px-3 py-2 text-xs text-on-surface hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-primary">
            {inspectorOpen ? <PanelRightClose size={16} aria-hidden="true" /> : <PanelRightOpen size={16} aria-hidden="true" />}
            {inspectorOpen ? 'Nascondi rilevamenti' : 'Mostra rilevamenti'}
          </button>
        </div>
      </div>

      <div className={'grid min-h-0 flex-1 gap-4 px-4 pb-4 lg:px-8 ' + (inspectorOpen ? 'min-[900px]:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1')}>
        <div className="flex min-h-0 flex-col gap-3">
          <div className="rg-context-card flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-3 text-sm">
              <button type="button" aria-label="Pagina precedente" disabled={page <= 1 || state.isAnalyzing} onClick={() => changePage(page - 1)} className="rounded-lg p-2 hover:bg-surface-container-high disabled:opacity-40"><ChevronLeft size={18} /></button>
              <span className="min-w-20 text-center font-medium">Pagina {page} / {total}</span>
              <button type="button" aria-label="Pagina successiva" disabled={page >= total || state.isAnalyzing} onClick={() => changePage(page + 1)} className="rounded-lg p-2 hover:bg-surface-container-high disabled:opacity-40"><ChevronRight size={18} /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void onAnalyzePage(page, Boolean(result))} disabled={state.isAnalyzing || !pageData} className="rg-secondary-button">
                {result ? 'Rianalizza pagina' : 'Analizza pagina'}
              </button>
              <button type="button" onClick={() => void onBatchAnalyzePages(state.pages.map(item => item.page_number))} disabled={state.isAnalyzing || !total} className="rg-secondary-button">
                {state.isAnalyzing ? 'Analisi in corso…' : 'Analizza tutte'}
              </button>
            </div>
          </div>

          {state.analysisErrors[page] && <div role="alert" className="flex items-center gap-2 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error"><AlertTriangle size={19} aria-hidden="true" /> Analisi della pagina non riuscita: {state.analysisErrors[page]}</div>}
          {!state.analysisErrors[page] && result?.warning && <div role="alert" className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning"><AlertTriangle size={19} aria-hidden="true" /> {result.warning}</div>}
          {state.isAnalyzing && <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm text-primary">Analisi locale in corso {state.currentAnalyzingPage ? '· pagina ' + state.currentAnalyzingPage : ''}…</p>}

          <div className="min-h-[260px] flex-1 overflow-y-auto rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-2 lg:min-h-[320px]">
            {pageData ? <DocumentPanel
              text={pageData.text}
              fields={result?.pii_fields ?? []}
              redactionOverrides={overrides}
              excludedFields={excluded}
              onToggleRedaction={toggleOccurrence}
              pageNumber={page}
            /> : <div className="flex min-h-[400px] items-center justify-center text-sm text-on-surface-variant">Nessuna pagina disponibile</div>}
          </div>
          <p className="text-xs text-on-surface-variant">Testo originale estratto dal PDF, visibile solo nel documento locale. Le evidenziazioni indicano la decisione di export (blu: oscura; ambra: mantieni). La lista laterale resta mascherata. L'AI può non trovare tutti i dati sensibili.</p>
        </div>

        {inspectorOpen && <aside id="pii-inspector" aria-label="Rilevamenti e decisioni" className="rg-context-card flex min-h-[260px] flex-col rounded-2xl p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Rilevamenti</h2>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">Valori mascherati nell’elenco. Scegli una voce per verificarla nel documento.</p>
          </div>
          <label className="mb-4 flex items-center gap-2 rounded-xl border border-outline-variant px-3 py-2.5">
            <Search size={17} className="text-on-surface-variant" aria-hidden="true" />
            <span className="sr-only">Cerca rilevamenti</span>
            <input value={query} onChange={event => { setQuery(event.target.value); setVisibleGroups(40); }} placeholder="Cerca tipo o categoria…" className="w-full bg-transparent text-sm outline-none placeholder:text-on-surface-variant" />
          </label>
          <div className="max-h-[54vh] flex-1 space-y-2 overflow-y-auto pr-1">
            {shownGroups.length ? shownGroups.slice(0, visibleGroups).map(group => {
              const groupDecisions = group.occurrences.map(item => decisions[fieldId(item.field, item.page)] ?? 'redact');
              const decision = groupDecisions.every(item => item === groupDecisions[0]) ? groupDecisions[0] : 'mixed';
              const selected = selectedId === group.id;
              return (
                <article key={group.id} className={'rounded-xl border p-3 ' + (selected ? 'border-primary/60 bg-primary/5' : 'border-outline-variant/60')}>
                  <button type="button" onClick={() => jumpTo(group)} className="mb-3 w-full text-left">
                    <span className="block text-xs text-on-surface-variant">{group.label} · {group.occurrences.length} occorrenze</span>
                    <span className="mt-1 block truncate font-mono text-sm text-on-surface">{group.masked}</span>
                    <span className="mt-1 block text-xs text-primary">Vai al contesto · pagina {group.occurrences[0].page} <ArrowRight size={12} className="inline" aria-hidden="true" /></span>
                  </button>
                  <div className="grid grid-cols-3 gap-1" role="group" aria-label={'Decisione per tutte le occorrenze di ' + group.label}>
                    <button type="button" onClick={() => setGroupDecision(group, 'redact')} aria-pressed={decision === 'redact'} className={'rounded-lg px-1 py-2 text-xs ' + (decision === 'redact' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant')}><Check size={13} className="mx-auto mb-1" aria-hidden="true" />Oscura</button>
                    <button type="button" onClick={() => setGroupDecision(group, 'keep')} aria-pressed={decision === 'keep'} className={'rounded-lg px-1 py-2 text-xs ' + (decision === 'keep' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant')}><Eye size={13} className="mx-auto mb-1" aria-hidden="true" />Mantieni</button>
                    <button type="button" onClick={() => setGroupDecision(group, 'not_pii')} aria-pressed={decision === 'not_pii'} className={'rounded-lg px-1 py-2 text-xs ' + (decision === 'not_pii' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant')}><ShieldOff size={13} className="mx-auto mb-1" aria-hidden="true" />Non PII</button>
                  </div>
                </article>
              );
            }) : <p className="rounded-xl bg-surface-container-low p-5 text-sm text-on-surface-variant">{groups.length ? 'Nessuna corrispondenza.' : 'Nessun rilevamento. Analizza il documento prima di interpretare questo risultato.'}</p>}
            {shownGroups.length > visibleGroups && <button type="button" onClick={() => setVisibleGroups(count => count + 40)} className="w-full rounded-xl border border-outline-variant px-4 py-3 text-sm text-primary hover:bg-surface-container-high">Mostra altri rilevamenti ({shownGroups.length - visibleGroups})</button>}
          </div>
        </aside>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant/60 bg-surface-container-lowest/95 px-5 py-4 lg:px-9">
        <div className="min-w-0">
          {canExport ? <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 size={18} aria-hidden="true" /> Pagine analizzate e aperte per revisione</p>
            : <p role="status" className="flex items-start gap-2 text-sm text-warning"><AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> {exportReason}</p>}
          <p className="mt-1 text-xs text-on-surface-variant">La verifica umana è necessaria: nessuna analisi AI garantisce di trovare tutti i dati sensibili.</p>
          {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
        </div>
        <button type="button" onClick={() => void exportReviewed()} disabled={!canExport} className="rg-primary-button flex items-center gap-2">
          <LockKeyhole size={16} aria-hidden="true" /> {saving ? 'Applicazione…' : 'Conferma ed esporta'} <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
