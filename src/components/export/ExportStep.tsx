import React from 'react';
import { Download, CheckCircle2, RotateCcw } from 'lucide-react';
import { DocumentState } from '../../hooks/useDocument';
import { api } from '../../services/api';

interface ExportStepProps {
  state: DocumentState;
  onReset: () => void;
}

export function ExportStep({ state, onReset }: ExportStepProps) {
  
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

  const totalFieldsRedacted = state.redactedPages.reduce((acc, page) => {
    // This is an approximation since we don't return exact counts in the state yet,
    // but the backend does in RedactResponse. For now, we just show a generic success.
    return acc;
  }, 0);

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="bg-surface-container-lowest p-10 rounded-3xl border border-outline-variant text-center shadow-sm">
        <div className="w-20 h-20 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        
        <h2 className="text-3xl font-bold text-on-surface tracking-tight mb-3">
          Anonymization Complete
        </h2>
        
        <p className="text-on-surface-variant mb-10 max-w-md mx-auto leading-relaxed">
          Your document has been successfully processed. All selected sensitive information has been redacted and replaced with safe placeholders.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={handleDownload}
            className="flex items-center gap-3 px-8 py-4 bg-primary text-on-primary rounded-full font-semibold hover:bg-primary-container shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all w-full sm:w-auto justify-center"
          >
            <Download className="w-5 h-5" />
            Download Markdown
          </button>
          
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-6 py-4 bg-surface-container-high text-on-surface rounded-full font-medium hover:bg-outline-variant transition-colors w-full sm:w-auto justify-center"
          >
            <RotateCcw className="w-4 h-4" />
            Start Over
          </button>
        </div>
      </div>
      
      <div className="mt-8 text-center text-sm text-outline font-medium flex items-center justify-center gap-2">
        <ShieldIcon /> Processed entirely locally on your machine.
      </div>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}
