import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { DocumentState, AppStep } from '../../hooks/useDocument';
import { DocumentPanel } from './DocumentPanel';
import { PIISidebar } from './PIISidebar';

interface ReviewStepProps {
  state: DocumentState;
  onApplyRedactions: (overrides: Record<string, boolean>) => Promise<void>;
  onProceed: () => void;
}

export function ReviewStep({ state, onApplyRedactions, onProceed }: ReviewStepProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [isExporting, setIsExporting] = useState(false);

  const totalPages = state.pages.length;
  const currentResult = state.analysisResults[currentPage];
  const currentPageData = state.pages.find(p => p.page_number === currentPage);
  const isAnalyzingCurrent = !currentResult && state.isAnalyzing;

  // Initialize overrides for newly analyzed pages
  useEffect(() => {
    if (currentResult) {
      setOverrides(prev => {
        const newOverrides = { ...prev };
        let changed = false;
        currentResult.pii_fields.forEach(field => {
          const id = `${currentPage}_${field.pii_type}_${field.value}`;
          if (newOverrides[id] === undefined) {
            newOverrides[id] = true; // default redact
            changed = true;
          }
        });
        return changed ? newOverrides : prev;
      });
    }
  }, [currentResult, currentPage]);

  const toggleRedaction = (fieldId: string) => {
    setOverrides(prev => ({
      ...prev,
      [fieldId]: !(prev[fieldId] ?? true)
    }));
  };

  const redactAll = () => {
    if (!currentResult) return;
    setOverrides(prev => {
      const next = { ...prev };
      currentResult.pii_fields.forEach(f => {
        next[`${currentPage}_${f.pii_type}_${f.value}`] = true;
      });
      return next;
    });
  };

  const keepAll = () => {
    if (!currentResult) return;
    setOverrides(prev => {
      const next = { ...prev };
      currentResult.pii_fields.forEach(f => {
        next[`${currentPage}_${f.pii_type}_${f.value}`] = false;
      });
      return next;
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onApplyRedactions(overrides);
      onProceed();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-surface p-4 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-4 bg-surface-container rounded-full p-1">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-full hover:bg-surface disabled:opacity-50 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-on-surface min-w-[80px] text-center">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, Math.min(totalPages, p + 1)))}
            disabled={currentPage === totalPages}
            className="p-2 rounded-full hover:bg-surface disabled:opacity-50 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 max-w-xs mx-8">
          <div className="h-2 bg-surface-container rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(state.analyzedCount / totalPages) * 100}%` }}
            />
          </div>
          <p className="text-xs text-center text-on-surface-variant mt-1 font-medium">
            {state.analyzedCount} of {totalPages} pages analyzed
          </p>
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting || state.analyzedCount < totalPages}
          className="flex items-center gap-2 px-6 py-2 bg-on-surface text-surface-container-lowest rounded-full font-medium hover:bg-on-surface-variant transition-colors disabled:opacity-50"
        >
          {isExporting ? (
             <div className="w-4 h-4 border-2 border-surface/30 border-t-surface rounded-full animate-spin" />
          ) : (
            <Lock className="w-4 h-4" />
          )}
          Apply & Export
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 p-6 min-h-0">
        <div className="flex-[2] min-w-0 overflow-y-auto">
          {currentPageData ? (
            <DocumentPanel 
              text={currentPageData.text}
              fields={currentResult?.pii_fields || []}
              redactionOverrides={overrides}
              onToggleRedaction={toggleRedaction}
              pageNumber={currentPage}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-outline">
              Page content not found
            </div>
          )}
        </div>
        <div className="flex-1 min-w-[320px] max-w-[400px]">
          <PIISidebar 
            fields={currentResult?.pii_fields || []}
            pageNumber={currentPage}
            cacheHit={currentResult?.cache_hit || false}
            redactionOverrides={overrides}
            onToggleRedaction={toggleRedaction}
            onRedactAll={redactAll}
            onKeepAll={keepAll}
            isAnalyzing={isAnalyzingCurrent}
          />
        </div>
      </div>
    </div>
  );
}
