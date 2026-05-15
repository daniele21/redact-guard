import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Lock, Brain, RefreshCw, CheckSquare, Square, Play, Layers } from 'lucide-react';
import { DocumentState } from '../../hooks/useDocument';
import { DocumentPanel } from './DocumentPanel';
import { PIISidebar } from './PIISidebar';

interface ReviewStepProps {
  state: DocumentState;
  onAnalyzePage: (pageNumber: number, force?: boolean) => Promise<void>;
  onBatchAnalyzePages: (pageNumbers: number[], force?: boolean) => Promise<void>;
  onApplyRedactions: (overrides: Record<string, boolean>) => Promise<void>;
  onProceed: () => void;
}

export function ReviewStep({ state, onAnalyzePage, onBatchAnalyzePages, onApplyRedactions, onProceed }: ReviewStepProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [excludedFields, setExcludedFields] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  

  const totalPages = state.pages.length;
  const currentResult = state.analysisResults[currentPage];
  const currentPageData = state.pages.find(p => p.page_number === currentPage);
  const isAnalyzing = state.isAnalyzing;

  // Initialize overrides for newly analyzed pages
  useEffect(() => {
    Object.entries(state.analysisResults).forEach(([pageStr, result]) => {
      const pNum = parseInt(pageStr);
      setOverrides(prev => {
        const newOverrides = { ...prev };
        let changed = false;
        result.pii_fields.forEach(field => {
          const id = `${pNum}_${field.pii_type}_${field.value}`;
          if (newOverrides[id] === undefined) {
            newOverrides[id] = true; // default redact
            changed = true;
          }
        });
        return changed ? newOverrides : prev;
      });
    });
  }, [state.analysisResults]);

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

  const togglePageSelection = (pageNum: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const selectAllPages = () => {
    const all = new Set<number>();
    for (let i = 1; i <= totalPages; i++) all.add(i);
    setSelectedPages(all);
  };

  const deselectAllPages = () => {
    setSelectedPages(new Set());
  };

  const analyzeSelected = () => {
    if (selectedPages.size === 0) return;
    onBatchAnalyzePages(Array.from(selectedPages));
    setIsSelectionMode(false);
  };

  const analyzeAll = () => {
    const all = [];
    for (let i = 1; i <= totalPages; i++) all.push(i);
    onBatchAnalyzePages(all);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-surface p-4 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-4 bg-surface-container rounded-full p-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || isAnalyzing}
              className="p-2 rounded-full hover:bg-surface disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-on-surface min-w-[80px] text-center">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, Math.min(totalPages, p + 1)))}
              disabled={currentPage === totalPages || isAnalyzing}
              className="p-2 rounded-full hover:bg-surface disabled:opacity-50 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          
          <button
            onClick={() => setIsSelectionMode(!isSelectionMode)}
            className={`p-2.5 rounded-full transition-all ${isSelectionMode ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
            title="Toggle Page Selection Mode"
          >
            <CheckSquare className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex justify-center px-4">
          {isSelectionMode ? (
            <div className="flex items-center gap-4 bg-surface-container-high rounded-2xl px-6 py-2 border border-primary/30 animate-in fade-in zoom-in duration-300">
              <span className="text-sm font-bold text-primary">{selectedPages.size} pages selected</span>
              <div className="w-px h-6 bg-outline-variant/30" />
              <div className="flex gap-2">
                <button onClick={selectAllPages} className="text-xs font-bold text-on-surface hover:text-primary transition-colors">Select All</button>
                <button onClick={deselectAllPages} className="text-xs font-bold text-on-surface hover:text-primary transition-colors">None</button>
              </div>
              <div className="w-px h-6 bg-outline-variant/30" />
              <button
                onClick={analyzeSelected}
                disabled={selectedPages.size === 0 || isAnalyzing}
                className="flex items-center gap-2 px-4 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Run Selected
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              {!currentResult ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onAnalyzePage(currentPage)}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2 px-6 py-2 bg-primary text-on-primary rounded-full font-bold hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50"
                  >
                    <Brain className="w-5 h-5" />
                    Scan Page {currentPage}
                  </button>
                  <button
                    onClick={analyzeAll}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2 px-4 py-2 bg-surface text-on-surface border border-outline-variant rounded-full font-bold hover:bg-surface-container transition-all disabled:opacity-50"
                  >
                    <Layers className="w-5 h-5" />
                    Scan All Pages
                  </button>
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => onAnalyzePage(currentPage, true)}
                      disabled={isAnalyzing}
                      className="flex items-center gap-2 px-3 py-1.5 bg-surface text-on-surface border border-outline-variant rounded-lg text-xs font-bold hover:bg-surface-container transition-colors disabled:opacity-50"
                      title="Re-scan ignoring cache"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                      Re-scan
                    </button>
                    <button
                      onClick={analyzeAll}
                      disabled={isAnalyzing}
                      className="flex items-center gap-2 px-3 py-1.5 bg-surface text-on-surface border border-outline-variant rounded-lg text-xs font-bold hover:bg-surface-container transition-colors disabled:opacity-50"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Scan All
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
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
        <div className="flex-[2] min-w-0 flex flex-col gap-4">
          {isSelectionMode && (
            <div className="bg-surface-container p-4 rounded-2xl border border-primary/20 flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {state.pages.map(p => (
                <button
                  key={p.page_number}
                  onClick={() => togglePageSelection(p.page_number)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border
                    ${selectedPages.has(p.page_number) 
                      ? 'bg-primary text-on-primary border-primary shadow-md' 
                      : 'bg-surface text-on-surface-variant border-outline-variant hover:border-primary/50'}
                  `}
                >
                  {selectedPages.has(p.page_number) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  Page {p.page_number}
                </button>
              ))}
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto">
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
        </div>
        
        <div className="flex-1 min-w-[320px] max-w-[400px]">
          <PIISidebar 
            fields={currentResult?.pii_fields || []}
            allResults={state.analysisResults}
            pageNumber={currentPage}
            cacheHit={currentResult?.cache_hit || false}
            redactionOverrides={overrides}
            excludedFields={excludedFields}
            onToggleRedaction={toggleRedaction}
            onToggleExclusion={toggleExclusion}
            onRedactAll={redactAll}
            onKeepAll={keepAll}
            isAnalyzing={isAnalyzing}
            onJumpToOccurrence={handleJumpToOccurrence}
            onNavigateToPage={(p) => setCurrentPage(p)}
          />
        </div>
      </div>
    </div>
  );
}
