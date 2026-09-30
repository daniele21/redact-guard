import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Layers,
  ListChecks,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { DocumentState } from '../../hooks/useDocument';
import { ReviewDecision } from '../../types';
import { fieldId } from './reviewIdentity';

interface ReviewOverviewProps {
  state: DocumentState;
  decisions: Record<string, ReviewDecision>;
  onAnalyzeAll: () => void;
  onOpenFindings: () => void;
  onOpenDocument: () => void;
}

export function ReviewOverview({
  state,
  decisions,
  onAnalyzeAll,
  onOpenFindings,
  onOpenDocument,
}: ReviewOverviewProps) {
  const allOccurrences = useMemo(
    () =>
      Object.entries(state.analysisResults).flatMap(([page, result]) =>
        result.pii_fields.map(field => ({
          page: Number(page),
          field,
          decision: decisions[fieldId(field, Number(page))] ?? 'redact',
        })),
      ),
    [state.analysisResults, decisions],
  );

  const uniqueEntities = new Set(allOccurrences.map(item => item.field.entity_id)).size;
  const affectedPages = new Set(allOccurrences.map(item => item.page)).size;
  const categories = new Set(allOccurrences.map(item => item.field.pii_type)).size;
  const unresolved = Object.values(state.analysisResults).reduce(
    (total, result) => total + (result.diagnostics?.unresolved_items ?? 0),
    0,
  );
  const localDecisionCounts = allOccurrences.reduce(
    (acc, item) => {
      acc[item.decision] += 1;
      return acc;
    },
    { redact: 0, keep: 0, not_pii: 0 } as Record<ReviewDecision, number>,
  );

  const totalPages = state.summary?.pages_total ?? state.pages.length;
  const analyzedPages =
    state.summary?.pages_analyzed ?? Object.keys(state.analysisResults).length;
  const failedPages =
    state.summary?.pages_failed ?? Object.keys(state.analysisErrors).length;
  const warningPages =
    state.summary?.pages_with_warnings ??
    Object.values(state.analysisResults).filter(result => Boolean(result.warning)).length;
  const isFullyAnalyzed = totalPages > 0 && analyzedPages === totalPages && failedPages === 0;
  const needsAttention = failedPages > 0 || warningPages > 0 || unresolved > 0;

  const status = failedPages > 0
    ? {
        icon: AlertTriangle,
        title: 'Analysis incomplete',
        description: `${failedPages} page${failedPages === 1 ? '' : 's'} could not be analyzed.`,
        tone: 'error',
      }
    : isFullyAnalyzed && needsAttention
      ? {
          icon: AlertTriangle,
          title: 'Needs attention',
          description: 'The document was analyzed, but some findings require review.',
          tone: 'warning',
        }
      : isFullyAnalyzed
        ? {
            icon: CheckCircle2,
            title: 'Ready for review',
            description: 'Every page was analyzed successfully.',
            tone: 'success',
          }
        : {
            icon: FileSearch,
            title: 'Analysis in progress',
            description: `${analyzedPages} of ${totalPages} pages analyzed.`,
            tone: 'primary',
          };

  const StatusIcon = status.icon;
  const statusClasses = {
    error: {
      card: 'bg-error/5 border-error/20',
      text: 'text-error',
    },
    warning: {
      card: 'bg-warning/5 border-warning/20',
      text: 'text-warning',
    },
    success: {
      card: 'bg-success/5 border-success/20',
      text: 'text-success',
    },
    primary: {
      card: 'bg-primary/5 border-primary/20',
      text: 'text-primary',
    },
  }[status.tone];

  const maxCategory = Math.max(
    1,
    ...(state.summary?.categories ?? []).map(item => item.occurrence_count),
  );

  return (
    <div className="flex-1 overflow-y-auto bg-surface-container-low p-5 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-[2rem] p-6 md:p-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-primary mb-3">
                <ShieldCheck className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-[0.16em]">
                  Protection overview
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-on-surface">
                {state.summary?.filename ?? 'Document'}
              </h2>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-3 py-1 rounded-full bg-surface-container text-xs font-semibold text-on-surface-variant">
                  {state.profile} policy
                </span>
                <span className="px-3 py-1 rounded-full bg-success/10 text-success text-xs font-semibold flex items-center gap-1.5">
                  <LockKeyhole className="w-3.5 h-3.5" />
                  Processed locally
                </span>
                {state.summary?.contract_version && (
                  <span className="px-3 py-1 rounded-full bg-surface-container text-xs font-mono text-outline">
                    {state.summary.contract_version}
                  </span>
                )}
              </div>
            </div>

            <div className={`min-w-[250px] rounded-2xl border p-4 ${statusClasses.card}`}>
              <div className={`flex items-center gap-2 ${statusClasses.text}`}>
                <StatusIcon className="w-5 h-5" />
                <strong>{status.title}</strong>
              </div>
              <p className="text-sm text-on-surface-variant mt-2">{status.description}</p>
              <div className="mt-3 h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${totalPages ? (analyzedPages / totalPages) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[11px] text-outline mt-2">
                {analyzedPages} / {totalPages} pages analyzed
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Sensitive items', uniqueEntities, 'Unique values across the document'],
            ['Occurrences', allOccurrences.length, 'All detected source spans'],
            ['Affected pages', affectedPages, `of ${totalPages} pages`],
            ['Categories', categories, 'Sensitive data types'],
          ].map(([label, value, hint]) => (
            <div key={String(label)} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5">
              <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
              <div className="text-3xl font-bold text-on-surface mt-2">{value}</div>
              <span className="text-[11px] text-outline">{hint}</span>
            </div>
          ))}
        </section>

        <section className="grid lg:grid-cols-[1.1fr_0.9fr] gap-5">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[2rem] p-6">
            <div className="flex items-center gap-2 mb-5">
              <Layers className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-bold text-on-surface">Sensitive data footprint</h3>
                <p className="text-xs text-on-surface-variant">Occurrences by category</p>
              </div>
            </div>

            <div className="space-y-4">
              {(state.summary?.categories ?? []).length === 0 ? (
                <div className="py-10 text-center text-sm text-outline">
                  Analyze the document to populate the sensitive-data footprint.
                </div>
              ) : (
                state.summary?.categories.map(category => (
                  <div key={category.pii_type}>
                    <div className="flex items-center justify-between gap-4 mb-1.5">
                      <span className="text-sm font-semibold text-on-surface">
                        {category.label}
                      </span>
                      <span className="text-sm font-bold text-on-surface">
                        {category.occurrence_count}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{
                          width: `${(category.occurrence_count / maxCategory) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-[2rem] p-6">
            <div className="flex items-center gap-2 mb-5">
              <ListChecks className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-bold text-on-surface">Protection decisions</h3>
                <p className="text-xs text-on-surface-variant">Current review state</p>
              </div>
            </div>

            <div className="space-y-3">
              <DecisionRow label="Suggested for redaction" value={localDecisionCounts.redact} tone="primary" />
              <DecisionRow label="Explicitly retained" value={localDecisionCounts.keep} tone="warning" />
              <DecisionRow label="Dismissed as not PII" value={localDecisionCounts.not_pii} tone="neutral" />
              <div className="border-t border-outline-variant pt-3 mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface-container p-3">
                  <span className="text-[10px] uppercase tracking-wider text-outline font-bold">
                    Unresolved
                  </span>
                  <div className="text-xl font-bold text-on-surface mt-1">{unresolved}</div>
                </div>
                <div className="rounded-xl bg-surface-container p-3">
                  <span className="text-[10px] uppercase tracking-wider text-outline font-bold">
                    Failed pages
                  </span>
                  <div className="text-xl font-bold text-on-surface mt-1">{failedPages}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {Object.keys(state.analysisErrors).length > 0 && (
          <section className="bg-error/5 border border-error/20 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-error mt-0.5" />
              <div>
                <h3 className="font-bold text-error">Some pages require attention</h3>
                <div className="mt-2 space-y-1">
                  {Object.entries(state.analysisErrors).map(([page, error]) => (
                    <p key={page} className="text-sm text-on-surface-variant">
                      Page {page}: {error}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="flex flex-wrap justify-end gap-3 pb-4">
          {!isFullyAnalyzed ? (
            <button
              onClick={onAnalyzeAll}
              disabled={state.isAnalyzing}
              className="px-6 py-3 rounded-xl bg-primary text-on-primary font-bold disabled:opacity-50"
            >
              Analyze entire document
            </button>
          ) : (
            <button
              onClick={onOpenFindings}
              className="px-6 py-3 rounded-xl bg-primary text-on-primary font-bold"
            >
              Review findings
            </button>
          )}
          <button
            onClick={onOpenDocument}
            className="px-6 py-3 rounded-xl border border-outline-variant bg-surface text-on-surface font-bold"
          >
            Open document
          </button>
        </div>
      </div>
    </div>
  );
}

function DecisionRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'primary' | 'warning' | 'neutral';
}) {
  const dotClass =
    tone === 'primary'
      ? 'bg-primary'
      : tone === 'warning'
        ? 'bg-warning'
        : 'bg-outline';

  return (
    <div className="flex items-center justify-between rounded-xl bg-surface-container p-3">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
        <span className="text-sm text-on-surface-variant">{label}</span>
      </div>
      <strong className="text-on-surface">{value}</strong>
    </div>
  );
}
