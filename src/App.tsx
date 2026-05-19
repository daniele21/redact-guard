import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { StepIndicator } from './components/layout/StepIndicator';
import { UploadStep } from './components/upload/UploadStep';
import { ReviewStep } from './components/review/ReviewStep';
import { ExportStep } from './components/export/ExportStep';
import { useDocument } from './hooks/useDocument';
import { api } from './services/api';

function App() {
  const { step, setStep, state, upload, analyzePage, batchAnalyzePages, applyRedactions, reset } = useDocument();
  const [isBackendReady, setIsBackendReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const maxAttempts = 30;
    const interval = 1000;

    async function pollHealth(attempt: number) {
      if (cancelled) return;
      try {
        await api.health();
        if (!cancelled) setIsBackendReady(true);
      } catch {
        if (cancelled) return;
        if (attempt >= maxAttempts) {
          setIsBackendReady(false);
        } else {
          setTimeout(() => pollHealth(attempt + 1), interval);
        }
      }
    }

    pollHealth(0);
    return () => { cancelled = true; };
  }, []);

  const handleApplyAndExport = async (overrides: Record<string, boolean>) => {
    if (!state.docId) return;
    
    // Convert Record<string, boolean> to RedactRequestItem[]
    const fieldsToRedact = Object.entries(overrides).map(([id, redact]) => ({
      field_id: id,
      redact
    }));
    
    await applyRedactions(fieldsToRedact);
  };

  if (isBackendReady === null) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 text-center">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-6"></div>
        <h1 className="text-xl font-semibold text-on-surface mb-2">Starting RedactGuard...</h1>
        <p className="text-on-surface-variant text-sm">Loading AI model and backend services</p>
      </div>
    );
  }

  if (isBackendReady === false) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-on-surface mb-2">Backend Server Offline</h1>
        <p className="text-on-surface-variant max-w-md">
          Could not connect to the backend after 30 seconds. Please restart the application.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <Navbar onReset={reset} />
      
      <main className="flex-1 flex flex-col">
        <StepIndicator currentStep={step} />
        
        <div className="flex-1 w-full relative">
          {step === 'upload' && (
            <div className="absolute inset-0 overflow-y-auto px-4 py-8">
              <UploadStep 
                onAnalyze={upload}
                isUploading={state.isUploading}
              />
            </div>
          )}
          
          {step === 'review' && (
            <div className="absolute inset-0">
              <ReviewStep 
                state={state}
                onAnalyzePage={analyzePage}
                onBatchAnalyzePages={batchAnalyzePages}
                onApplyRedactions={handleApplyAndExport}
                onProceed={() => setStep('export')}
              />
            </div>
          )}
          
          {step === 'export' && (
            <div className="absolute inset-0 overflow-y-auto px-4 py-8">
              <ExportStep 
                state={state}
                onReset={reset}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
