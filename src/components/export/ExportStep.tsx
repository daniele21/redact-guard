import React, { useState } from 'react';
import { Download, CheckCircle2, RotateCcw, Copy, Check, FileText, ShieldCheck, Eye, ShieldOff } from 'lucide-react';
import { DocumentState } from '../../hooks/useDocument';
import { api } from '../../services/api';

interface ExportStepProps {
  state: DocumentState;
  onReset: () => void;
}

export function ExportStep({ state, onReset }: ExportStepProps) {
  const [copied, setCopied] = useState(false);
  
  const handleDownload = () => {
    if (!state.docId) return;
    const url = api.exportDocumentUrl(state.docId);
    // Create an invisible anchor to trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const combinedText = state.redactedPages
    .sort((a, b) => a.page_number - b.page_number)
    .map(p => p.text)
    .join('\n\n---\n\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(combinedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto mt-8 px-4 pb-12 animate-fade-in">
      <div className="bg-surface-container-lowest p-8 md:p-10 rounded-[2.5rem] border border-outline-variant shadow-sm flex flex-col gap-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          
          <h2 className="text-2xl md:text-3xl font-bold text-on-surface tracking-tight mb-2">
            Anonymization Complete
          </h2>
          
          <p className="text-on-surface-variant max-w-md mx-auto leading-relaxed text-sm md:text-base">
            Your document has been successfully processed. All selected sensitive information has been redacted.
          </p>
        </div>

        {state.summary && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                Redacted
              </div>
              <div className="text-2xl font-bold text-on-surface mt-2">
                {state.summary.decision_counts.redact}
              </div>
              <p className="text-xs text-on-surface-variant mt-1">Protected occurrences</p>
            </div>
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-4">
              <div className="flex items-center gap-2 text-on-surface-variant text-xs font-bold uppercase tracking-wider">
                <Eye className="w-4 h-4" />
                Retained
              </div>
              <div className="text-2xl font-bold text-on-surface mt-2">
                {state.summary.decision_counts.keep}
              </div>
              <p className="text-xs text-on-surface-variant mt-1">Explicitly kept</p>
            </div>
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-4">
              <div className="flex items-center gap-2 text-on-surface-variant text-xs font-bold uppercase tracking-wider">
                <ShieldOff className="w-4 h-4" />
                Not PII
              </div>
              <div className="text-2xl font-bold text-on-surface mt-2">
                {state.summary.decision_counts.not_pii}
              </div>
              <p className="text-xs text-on-surface-variant mt-1">Dismissed findings</p>
            </div>
            <div className="bg-success/5 border border-success/15 rounded-2xl p-4">
              <div className="text-success text-xs font-bold uppercase tracking-wider">
                Coverage
              </div>
              <div className="text-2xl font-bold text-on-surface mt-2">
                {state.summary.pages_analyzed}/{state.summary.pages_total}
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                {state.summary.unresolved_findings === 0
                  ? 'No unresolved findings'
                  : `${state.summary.unresolved_findings} unresolved`}
              </p>
            </div>
          </div>
        )}

        {/* Preview Section */}
        <div className="flex flex-col border border-outline-variant rounded-2xl bg-surface-container-low overflow-hidden shadow-inner">
          <div className="px-5 py-3 border-b border-outline-variant bg-surface-container-high flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-on-surface uppercase tracking-wider">Document Preview</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[10px] md:text-xs font-medium text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded-full">
                {state.redactedPages.length} {state.redactedPages.length === 1 ? 'page' : 'pages'}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-container transition-colors"
              >
                {copied ? (
                  <><Check className="w-3.5 h-3.5" /> Copied</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> Copy Text</>
                )}
              </button>
            </div>
          </div>
          <div className="h-[300px] md:h-[450px] overflow-y-auto p-6 md:p-8 font-mono text-xs md:text-sm whitespace-pre-wrap text-on-surface leading-relaxed">
            {combinedText || (
              <div className="h-full flex items-center justify-center text-outline-variant italic">
                No redacted content available.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <button
            onClick={handleDownload}
            className="flex items-center gap-3 px-8 py-4 bg-primary text-on-primary rounded-full font-bold hover:bg-primary-container shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all w-full sm:w-auto justify-center"
          >
            <Download className="w-5 h-5" />
            Download Protected Markdown
          </button>
          
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-6 py-4 bg-surface-container-high text-on-surface rounded-full font-bold hover:bg-outline-variant transition-colors w-full sm:w-auto justify-center"
          >
            <RotateCcw className="w-4 h-4" />
            Start Over
          </button>
        </div>
      </div>
      
      <div className="mt-8 text-center text-xs text-outline font-medium flex items-center justify-center gap-2">
        <ShieldIcon /> Processed locally. Review decisions and protection outcome remain on this device.
      </div>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}
