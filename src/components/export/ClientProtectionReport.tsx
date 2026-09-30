import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { DocumentAnalysisSummary } from '../../types';

interface ClientProtectionReportProps {
  summary: DocumentAnalysisSummary;
  onBack: () => void;
  onDownload: () => void;
}

export function ClientProtectionReport({
  summary,
  onBack,
  onDownload,
}: ClientProtectionReportProps) {
  const status = getStatus(summary);
  const StatusIcon = status.icon;
  const maxCategory = Math.max(
    1,
    ...summary.categories.map(category => category.occurrence_count),
  );
  const exceptions = [
    summary.pages_failed
      ? `${summary.pages_failed} page${summary.pages_failed === 1 ? '' : 's'} failed analysis`
      : null,
    summary.pages_with_warnings
      ? `${summary.pages_with_warnings} page${summary.pages_with_warnings === 1 ? '' : 's'} completed with warnings`
      : null,
    summary.unresolved_findings
      ? `${summary.unresolved_findings} unresolved finding${summary.unresolved_findings === 1 ? '' : 's'}`
      : null,
    summary.decision_counts.keep
      ? `${summary.decision_counts.keep} occurrence${summary.decision_counts.keep === 1 ? '' : 's'} explicitly retained`
      : null,
    summary.decision_counts.not_pii
      ? `${summary.decision_counts.not_pii} occurrence${summary.decision_counts.not_pii === 1 ? '' : 's'} dismissed as not PII`
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="max-w-6xl mx-auto px-4 pb-12 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface font-semibold text-sm hover:bg-surface-container"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to export
        </button>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm"
        >
          <Download className="w-4 h-4" />
          Download client report
        </button>
      </div>

      <article className="bg-surface-container-lowest border border-outline-variant rounded-[2.5rem] shadow-sm overflow-hidden">
        <header className="px-6 md:px-10 py-7 md:py-9 border-b border-outline-variant bg-surface">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <ShieldCheck className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-[0.16em]">
                  Protection report
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-on-surface mt-3">
                {summary.filename}
              </h1>
              <p className="text-sm text-on-surface-variant mt-2">
                {summary.profile} policy · {summary.contract_version}
              </p>
            </div>

            <div className="inline-flex items-center gap-2 self-start px-3 py-2 rounded-full bg-success/10 text-success text-xs font-bold">
              <LockKeyhole className="w-4 h-4" />
              Processed locally
            </div>
          </div>
        </header>

        <div className="p-6 md:p-10 space-y-6">
          <section className={`rounded-3xl border p-6 ${status.cardClass}`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${status.iconClass}`}>
                  <StatusIcon className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                    Protection status
                  </span>
                  <h2 className="text-xl font-bold text-on-surface mt-1">
                    {status.title}
                  </h2>
                  <p className="text-sm text-on-surface-variant mt-1">
                    {status.description}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-surface-container-lowest/80 border border-outline-variant px-5 py-3 min-w-[160px]">
                <div className="text-2xl font-bold text-on-surface">
                  {summary.pages_analyzed}/{summary.pages_total}
                </div>
                <span className="text-xs text-on-surface-variant">pages analyzed</span>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ExecutiveMetric
              label="Sensitive items"
              value={summary.unique_sensitive_items}
              hint="Unique protected values"
            />
            <ExecutiveMetric
              label="Occurrences"
              value={summary.occurrences}
              hint="Detected source spans"
            />
            <ExecutiveMetric
              label="Affected pages"
              value={summary.affected_pages}
              hint={`of ${summary.pages_total} pages`}
            />
            <ExecutiveMetric
              label="Categories"
              value={summary.categories.length}
              hint="Sensitive data types"
            />
          </section>

          <section className="grid lg:grid-cols-[1.08fr_0.92fr] gap-5">
            <div className="rounded-3xl border border-outline-variant p-6">
              <div className="flex items-center gap-2 mb-5">
                <FileCheck2 className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-bold text-on-surface">Sensitive data footprint</h3>
                  <p className="text-xs text-on-surface-variant">
                    Categories detected in the document
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {summary.categories.length ? (
                  summary.categories.map(category => (
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
                ) : (
                  <p className="text-sm text-on-surface-variant">
                    No sensitive categories detected.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-outline-variant p-6">
              <h3 className="font-bold text-on-surface">Protection outcome</h3>
              <p className="text-xs text-on-surface-variant mt-1 mb-5">
                Final reviewer decisions
              </p>
              <OutcomeRow label="Redacted" value={summary.decision_counts.redact} tone="primary" />
              <OutcomeRow label="Explicitly retained" value={summary.decision_counts.keep} tone="warning" />
              <OutcomeRow label="Dismissed as not PII" value={summary.decision_counts.not_pii} tone="neutral" />
              <OutcomeRow label="Unresolved findings" value={summary.unresolved_findings} tone="neutral" />
            </div>
          </section>

          <section className="rounded-3xl border border-outline-variant p-6">
            <h3 className="font-bold text-on-surface">Exceptions requiring attention</h3>
            <p className="text-xs text-on-surface-variant mt-1 mb-4">
              Only material exceptions are surfaced in this client-facing view.
            </p>
            {exceptions.length ? (
              <div className="grid md:grid-cols-2 gap-2">
                {exceptions.map(exception => (
                  <div
                    key={exception}
                    className="flex items-start gap-2 rounded-xl bg-warning/5 border border-warning/15 p-3 text-sm text-on-surface-variant"
                  >
                    <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                    <span>{exception}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-success/5 border border-success/15 p-3 text-sm text-success">
                <CheckCircle2 className="w-4 h-4" />
                No review exceptions recorded.
              </div>
            )}
          </section>

          {summary.entities.length > 0 && (
            <details className="rounded-3xl border border-outline-variant overflow-hidden">
              <summary className="cursor-pointer list-none px-6 py-4 bg-surface-container-low font-bold text-on-surface">
                Masked review details
                <span className="block text-xs font-normal text-on-surface-variant mt-1">
                  Sensitive values remain masked in this report.
                </span>
              </summary>
              <div className="divide-y divide-outline-variant">
                {summary.entities.slice(0, 20).map(entity => (
                  <div key={entity.entity_id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-primary">
                        {entity.label}
                      </span>
                      <div className="font-mono font-semibold text-on-surface mt-1">
                        {entity.masked_value}
                      </div>
                    </div>
                    <div className="text-xs text-on-surface-variant sm:text-right">
                      {entity.occurrence_count} occurrence{entity.occurrence_count === 1 ? '' : 's'} · page{entity.pages.length === 1 ? '' : 's'} {entity.pages.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          <footer className="pt-4 border-t border-outline-variant flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-outline">
            <span>Read-only protection summary generated by RedactGuard.</span>
            <span>Raw sensitive values are intentionally excluded or masked.</span>
          </footer>
        </div>
      </article>
    </div>
  );
}

function ExecutiveMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface p-5">
      <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
      <div className="text-3xl font-bold text-on-surface mt-2">{value}</div>
      <span className="text-[11px] text-outline">{hint}</span>
    </div>
  );
}

function OutcomeRow({
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
    <div className="flex items-center justify-between py-3 border-b border-outline-variant last:border-b-0">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
        <span className="text-sm text-on-surface-variant">{label}</span>
      </div>
      <strong className="text-on-surface">{value}</strong>
    </div>
  );
}

function getStatus(summary: DocumentAnalysisSummary) {
  if (summary.pages_failed > 0 || summary.analysis_status === 'failed') {
    return {
      title: 'Analysis incomplete',
      description: `${summary.pages_failed} page${summary.pages_failed === 1 ? '' : 's'} could not be analyzed.`,
      icon: AlertTriangle,
      cardClass: 'bg-error/5 border-error/20',
      iconClass: 'bg-error/10 text-error',
    };
  }
  if (
    summary.unresolved_findings > 0 ||
    summary.pages_with_warnings > 0 ||
    summary.analysis_status === 'needs_attention'
  ) {
    return {
      title: 'Needs attention',
      description: 'The document was analyzed, but some findings require attention.',
      icon: AlertTriangle,
      cardClass: 'bg-warning/5 border-warning/20',
      iconClass: 'bg-warning/10 text-warning',
    };
  }
  if (summary.pages_analyzed === summary.pages_total && summary.pages_total > 0) {
    return {
      title: 'Protection review complete',
      description: 'All pages were analyzed and no unresolved findings remain.',
      icon: CheckCircle2,
      cardClass: 'bg-success/5 border-success/20',
      iconClass: 'bg-success/10 text-success',
    };
  }
  return {
    title: 'Analysis incomplete',
    description: `${summary.pages_analyzed} of ${summary.pages_total} pages were analyzed.`,
    icon: AlertTriangle,
    cardClass: 'bg-surface-container-low border-outline-variant',
    iconClass: 'bg-surface-container-high text-on-surface-variant',
  };
}
