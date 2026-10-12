import type { DocumentState } from '../../hooks/useDocument';

export interface ReviewReadiness {
  ready: boolean;
  reason: string;
}

/**
 * A UX gate, not an attestation of redaction accuracy.
 * The backend needs its own independent policy before export can be treated as enforced.
 */
export function reviewReadiness(state: DocumentState, visitedCount: number, busy: boolean): ReviewReadiness {
  const total = state.pages.length;
  const allAnalyzed = total > 0 && state.pages.every(page =>
    Boolean(state.analysisResults[page.page_number]) && !state.analysisErrors[page.page_number]
  );
  if (!allAnalyzed) return { ready: false, reason: 'Analizza tutte le pagine prima di esportare.' };

  const hasWarnings = Object.values(state.analysisResults).some(result =>
    Boolean(result.warning) || (result.diagnostics?.unresolved_items ?? 0) > 0
  );
  const summary = state.summary;
  const complete = Boolean(summary && summary.pages_analyzed === total &&
    summary.pages_failed === 0 && summary.pages_with_warnings === 0 &&
    summary.unresolved_findings === 0 && summary.analysis_status === 'complete');
  if (!complete || hasWarnings) {
    return { ready: false, reason: 'Risolvi gli errori, gli avvisi o i risultati non associati al testo.' };
  }
  if (visitedCount !== total) return { ready: false, reason: 'Apri tutte le pagine e verifica i rilevamenti.' };
  if (busy || state.isAnalyzing) return { ready: false, reason: 'Completa l’operazione in corso.' };
  return { ready: true, reason: '' };
}
