import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Lock, 
  Brain, 
  RefreshCw, 
  CheckSquare, 
  Square, 
  Play, 
  Layers, 
  Grid, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  Sparkles 
} from 'lucide-react';
import { DocumentState } from '../../hooks/useDocument';
import { DocumentPanel } from './DocumentPanel';
import { PIISidebar } from './PIISidebar';

// Fixed skeleton line widths for grid card miniatures (avoids randomness in render)
const SKELETON_WIDTHS = [82, 95, 71, 88, 64, 90, 76, 93, 68, 85, 73, 79, 91, 67, 86, 80, 72, 94, 62, 87, 77, 89, 66, 83, 70, 92, 75, 96, 63, 84, 78, 91];

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
  const [viewMode, setViewMode] = useState<'document' | 'grid'>('document');
  const [recentlyCompletedPages, setRecentlyCompletedPages] = useState<Set<number>>(new Set());
  const prevAnalysisResultsRef = useRef<Record<number, unknown>>({});
  

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

  // Detect newly completed pages and flash a "done" overlay briefly
  useEffect(() => {
    const prev = prevAnalysisResultsRef.current;
    const current = state.analysisResults;
    const newlyCompleted: number[] = Object.keys(current)
      .map(Number)
      .filter(pageNum => !prev[pageNum]);

    if (newlyCompleted.length > 0) {
      setRecentlyCompletedPages(existing => {
        const next = new Set(existing);
        newlyCompleted.forEach(p => next.add(p));
        return next;
      });
      newlyCompleted.forEach(pageNum => {
        setTimeout(() => {
          setRecentlyCompletedPages(existing => {
            const next = new Set(existing);
            next.delete(pageNum);
            return next;
          });
        }, 2200);
      });
    }

    prevAnalysisResultsRef.current = current;
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
        <div className="flex items-center gap-4">
          {viewMode === 'document' && (
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
          )}

          {/* Segmented View Switcher */}
          <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant/30">
            <button
              onClick={() => setViewMode('document')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'document' ? 'bg-primary text-on-primary shadow-md shadow-primary/10' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              <FileText className="w-3.5 h-3.5" />
              Editor
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'grid' ? 'bg-primary text-on-primary shadow-md shadow-primary/10' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              <Grid className="w-3.5 h-3.5" />
              Grid View
            </button>
          </div>
          
          {viewMode === 'document' && (
            <button
              onClick={() => setIsSelectionMode(!isSelectionMode)}
              className={`p-2.5 rounded-full transition-all ${isSelectionMode ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
              title="Toggle Page Selection Mode"
            >
              <CheckSquare className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 flex justify-center px-4">
          {viewMode === 'grid' ? (
            <div className="flex items-center gap-4 bg-surface-container-high rounded-2xl px-6 py-2 border border-outline-variant/50 animate-in fade-in zoom-in duration-300">
              <span className="text-xs font-bold text-on-surface-variant">
                {selectedPages.size} of {totalPages} Pages Selected
              </span>
              <div className="w-px h-6 bg-outline-variant/30" />
              <div className="flex gap-2">
                <button onClick={selectAllPages} className="text-xs font-bold text-on-surface hover:text-primary transition-colors">Select All</button>
                <button onClick={deselectAllPages} className="text-xs font-bold text-on-surface hover:text-primary transition-colors">Clear</button>
              </div>
              <div className="w-px h-6 bg-outline-variant/30" />
              <button
                onClick={analyzeSelected}
                disabled={selectedPages.size === 0 || isAnalyzing}
                className="flex items-center gap-2 px-4 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold hover:bg-primary/95 transition-all disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Scan Selected ({selectedPages.size})
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
          ) : isSelectionMode ? (
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
        {viewMode === 'grid' ? (
          <div className="flex-1 overflow-y-auto p-6 bg-surface-container-low/30 rounded-3xl border border-outline-variant/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {state.pages.map(p => {
                const result = state.analysisResults[p.page_number];
                const isSelected = selectedPages.has(p.page_number);
                const isCurrent = currentPage === p.page_number;
                const isPending = state.pendingPages.includes(p.page_number);
                const isPageAnalyzing = state.currentAnalyzingPage === p.page_number;
                const isRecentlyDone = recentlyCompletedPages.has(p.page_number);
                const isLoadingState = isPending || isPageAnalyzing;
                
                return (
                  <div
                    key={p.page_number}
                    className={`
                      relative group flex flex-col aspect-[3/4.2] rounded-2xl border transition-all duration-300 overflow-hidden bg-surface shadow-sm hover:shadow-xl hover:scale-[1.02] cursor-pointer
                      ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-outline-variant hover:border-primary/50'}
                      ${isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''}
                      ${isRecentlyDone ? 'ring-2 ring-success/60 border-success/40' : ''}
                    `}
                    onClick={() => {
                      setCurrentPage(p.page_number);
                      setViewMode('document');
                    }}
                  >
                    {/* Checkbox button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePageSelection(p.page_number);
                      }}
                      className="absolute top-3 right-3 z-20 p-1.5 rounded-lg bg-surface/90 backdrop-blur-sm border border-outline-variant hover:border-primary transition-all text-on-surface shadow-sm"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4.5 h-4.5 text-primary" />
                      ) : (
                        <Square className="w-4.5 h-4.5 text-outline" />
                      )}
                    </button>

                    {/* Miniature Page Content */}
                    <div className="flex-1 p-3 pt-9 font-mono text-[6.5px] leading-[1.2] text-on-surface-variant overflow-hidden select-none relative">
                      {isLoadingState ? (
                        /* Skeleton shimmer lines */
                        <div className="space-y-1 h-full overflow-hidden">
                          {SKELETON_WIDTHS.slice(0, 24).map((w, i) => (
                            <div
                              key={i}
                              className="h-1.5 rounded-full bg-on-surface/8 animate-pulse"
                              style={{ width: `${w}%`, animationDelay: `${(i % 6) * 80}ms` }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-0.5 h-full overflow-hidden">
                          {p.text.split('\n').slice(0, 32).map((line, idx) => {
                            if (!result) {
                              return <div key={idx} className="truncate tracking-tight opacity-65">{line || ' '}</div>;
                            }
                            
                            const words = line.split(' ');
                            return (
                              <div key={idx} className="truncate tracking-tight flex flex-wrap gap-x-0.5 gap-y-0 opacity-90">
                                {words.map((word, wIdx) => {
                                  const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
                                  const isPII = result.pii_fields.some(f => f.value.toLowerCase().includes(cleanWord.toLowerCase()) && cleanWord.length > 2);
                                  if (isPII && cleanWord.length > 0) {
                                    return (
                                      <span key={wIdx} className="bg-primary/30 text-primary px-0.5 rounded-[1px] font-bold text-[5.5px]">
                                        {word}
                                      </span>
                                    );
                                    
                                  }
                                  return <span key={wIdx} className="opacity-70">{word}</span>;
                                })}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
                    </div>

                    {/* Status Badge */}
                    <div className="p-3 border-t border-outline-variant bg-surface-container/50 flex items-center justify-between text-xs z-10">
                      <div className="flex items-center gap-1.5">
                        {isPageAnalyzing ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <span className="font-bold text-primary animate-pulse">Scanning...</span>
                          </>
                        ) : isPending ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-outline/20 border-t-on-surface-variant rounded-full animate-spin" />
                            <span className="font-medium text-on-surface-variant">Queued</span>
                          </>
                        ) : result ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                            <span className="font-bold text-success">{result.pii_fields.length} PII</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 text-outline" />
                            <span className="text-on-surface-variant">Not Scanned</span>
                          </>
                        )}
                      </div>
                      
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-surface-container-high rounded border border-outline-variant text-on-surface-variant">
                        Page {p.page_number}
                      </span>
                    </div>

                    {/* Hover actions overlay — hidden while loading */}
                    {!isLoadingState && (
                      <div className="absolute inset-0 bg-surface/50 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-all duration-300 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAnalyzePage(p.page_number, !!result);
                          }}
                          disabled={isAnalyzing}
                          className="p-2.5 rounded-full bg-primary text-on-primary shadow-lg hover:scale-110 active:scale-95 transition-all"
                          title={result ? "Re-scan Page" : "Scan Page"}
                        >
                          <RefreshCw className={`w-4 h-4 ${isPageAnalyzing ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentPage(p.page_number);
                            setViewMode('document');
                          }}
                          className="p-2.5 rounded-full bg-surface text-on-surface border border-outline-variant shadow-lg hover:scale-110 active:scale-95 transition-all"
                          title="Open in Editor"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Scanning active overlay */}
                    {isPageAnalyzing && (
                      <div className="absolute inset-0 bg-primary/5 flex flex-col items-center justify-center z-20 pointer-events-none">
                        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin mb-2" />
                        <span className="text-[9px] font-bold text-primary tracking-wide uppercase animate-pulse">Scanning</span>
                      </div>
                    )}

                    {/* Recently completed flash overlay */}
                    {isRecentlyDone && (
                      <div className="absolute inset-0 bg-success/10 flex flex-col items-center justify-center z-25 pointer-events-none animate-in fade-in duration-300">
                        <div className="bg-success text-on-primary rounded-2xl px-3 py-2 flex items-center gap-2 shadow-lg shadow-success/20">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-[10px] font-bold tracking-wide uppercase">Done</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
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
              
              <div className="flex-1 overflow-y-auto relative">
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

                {/* Document view scanning/pending overlay for current page */}
                {(state.currentAnalyzingPage === currentPage || state.pendingPages.includes(currentPage)) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface/70 backdrop-blur-[2px] z-20 rounded-xl animate-in fade-in duration-200">
                    {state.currentAnalyzingPage === currentPage ? (
                      <>
                        <div className="w-10 h-10 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-bold text-primary animate-pulse">Analyzing page {currentPage}…</span>
                          <span className="text-xs text-on-surface-variant">AI is detecting PII fields</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-8 h-8 border-[3px] border-on-surface-variant/20 border-t-on-surface-variant rounded-full animate-spin" />
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-bold text-on-surface-variant">Page {currentPage} is queued</span>
                          <span className="text-xs text-on-surface-variant/70">Waiting for previous pages to finish</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Recently completed flash for current page */}
                {recentlyCompletedPages.has(currentPage) && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="bg-success text-on-primary rounded-full px-4 py-2 flex items-center gap-2 shadow-lg shadow-success/20">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-xs font-bold">Scan complete</span>
                    </div>
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
          </>
        )}
      </div>
    </div>
  );
}
