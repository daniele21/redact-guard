import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Lock, Brain, RefreshCw } from 'lucide-react';
import { DocumentState } from '../../hooks/useDocument';
import { DocumentPanel } from './DocumentPanel';
import { PIISidebar } from './PIISidebar';

interface ReviewStepProps {
  state: DocumentState;
  onAnalyzePage: (pageNumber: number, force?: boolean) => Promise<void>;
  onApplyRedactions: (overrides: Record<string, boolean>) => Promise<void>;
  onProceed: () => void;
}

export function ReviewStep({ state, onAnalyzePage, onApplyRedactions, onProceed }: ReviewStepProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [excludedFields, setExcludedFields] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  

  const totalPages = state.pages.length;
  const currentResult = state.analysisResults[currentPage];
  const currentPageData = state.pages.find(p => p.page_number === currentPage);
  const isAnalyzingCurrent = state.isAnalyzing;

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

  const toggleExclusion = (fieldId: string) => {
    setExcludedFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
        // Also ensure it's not redacted if excluded
        setOverrides(ov => ({ ...ov, [fieldId]: false }));
      }
      return next;
    });
  };

  const redactAll = () => {
    if (!currentResult) return;
    setOverrides(prev => {
      const next = { ...prev };
      currentResult.pii_fields.forEach(f => {
        const id = `${currentPage}_${f.pii_type}_${f.value}`;
        if (!excludedFields.has(id)) {
          next[id] = true;
        }
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

  const handleJumpToOccurrence = (start: number) => {
    const element = document.getElementById(`pii-${start}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a brief highlight effect
      element.classList.add('ring-4', 'ring-primary', 'ring-offset-2', 'rounded-sm', 'transition-all');
      setTimeout(() => {
        element.classList.remove('ring-4', 'ring-primary', 'ring-offset-2');
      }, 2000);
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

        <div className="flex-1 max-w-lg mx-8">
          <div className="flex items-center justify-center gap-6">
            {!currentResult ? (
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => onAnalyzePage(currentPage)}
                  disabled={state.isAnalyzing}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-on-primary rounded-full font-bold hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  <Brain className="w-5 h-5" />
                  Scan & Detect Page
                </button>
                <p className="text-[10px] text-on-surface-variant font-medium">
                  Trigger local LLM analysis for this page
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4 bg-surface-container-high rounded-2xl px-4 py-2 border border-outline-variant/50">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Analysis Complete</span>
                  <span className="text-xs text-on-surface-variant font-medium">
                    {currentResult.pii_fields.length} PII fields found
                  </span>
                </div>
                <div className="w-px h-8 bg-outline-variant/30" />
                <button
                  onClick={() => onAnalyzePage(currentPage, true)}
                  disabled={state.isAnalyzing}
                  className="flex items-center gap-2 px-3 py-1.5 bg-surface text-on-surface border border-outline-variant rounded-lg text-xs font-bold hover:bg-surface-container transition-colors disabled:opacity-50"
                  title="Re-scan ignoring cache"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${state.isAnalyzing ? 'animate-spin' : ''}`} />
                  Re-scan
                </button>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting || state.analyzedCount === 0}
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
              excludedFields={excludedFields}
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
            excludedFields={excludedFields}
            onToggleRedaction={toggleRedaction}
            onToggleExclusion={toggleExclusion}
            onRedactAll={redactAll}
            onKeepAll={keepAll}
            isAnalyzing={isAnalyzingCurrent}
            onJumpToOccurrence={handleJumpToOccurrence}
          />
        </div>
      </div>
    </div>
  );
}
