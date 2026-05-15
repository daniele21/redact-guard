import React, { useState } from 'react';
import { PIIField, PageAnalysisResult } from '../../types';
import { PII_CATEGORIES } from '../../config/theme.config';
import { Shield, ShieldAlert, Zap, Eye, EyeOff, ShieldOff, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

interface PIISidebarProps {
  fields: PIIField[];
  allResults: Record<number, PageAnalysisResult>;
  pageNumber: number;
  cacheHit: boolean;
  redactionOverrides: Record<string, boolean>;
  excludedFields: Set<string>;
  onToggleRedaction: (fieldId: string) => void;
  onToggleExclusion: (fieldId: string) => void;
  onRedactAll: () => void;
  onKeepAll: () => void;
  isAnalyzing: boolean;
  onJumpToOccurrence?: (start: number) => void;
  onNavigateToPage?: (pageNum: number) => void;
}

export function PIISidebar({
  fields,
  allResults,
  pageNumber,
  cacheHit,
  redactionOverrides,
  excludedFields,
  onToggleRedaction,
  onToggleExclusion,
  onRedactAll,
  onKeepAll,
  isAnalyzing,
  onJumpToOccurrence,
  onNavigateToPage
}: PIISidebarProps) {
  const [viewMode, setViewMode] = useState<'current' | 'all'>('current');
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());

  const togglePageExpand = (pageNum: number) => {
    setExpandedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  // Group fields for a specific set of fields
  const getGroupedFields = (fieldsToGroup: PIIField[], pNum: number) => {
    return fieldsToGroup.reduce((acc, field) => {
      const fieldId = `${pNum}_${field.pii_type}_${field.value}`;
      if (excludedFields.has(fieldId)) return acc;

      if (!acc[field.pii_type]) acc[field.pii_type] = {};
      
      if (!acc[field.pii_type][field.value]) {
        acc[field.pii_type][field.value] = {
          field_name: field.field_name,
          occurrences: []
        };
      }
      
      acc[field.pii_type][field.value].occurrences.push({
        start: field.start,
        end: field.end
      });
      
      return acc;
    }, {} as Record<string, Record<string, { field_name: string, occurrences: Array<{start: number|null, end: number|null}> }>>);
  };

  const currentGrouped = getGroupedFields(fields, pageNumber);
  const excludedCount = fields.filter(f => excludedFields.has(`${pageNumber}_${f.pii_type}_${f.value}`)).length;
  const activeFieldsCount = fields.length - excludedCount;

  // Findings from other pages
  const otherPagesResults = Object.entries(allResults)
    .filter(([num]) => parseInt(num) !== pageNumber)
    .map(([num, result]) => ({ 
      pageNum: parseInt(num), 
      fields: result.pii_fields,
      activeCount: result.pii_fields.filter(f => !excludedFields.has(`${num}_${f.pii_type}_${f.value}`)).length
    }))
    .filter(p => p.fields.length > 0)
    .sort((a, b) => a.pageNum - b.pageNum);

  const totalFindingsAcrossPages = Object.values(allResults).reduce((sum, res) => sum + res.pii_fields.length, 0);

  if (isAnalyzing) {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant p-6 h-full flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <h3 className="font-medium text-on-surface">Analyzing Page {pageNumber}</h3>
        <p className="text-sm text-on-surface-variant mt-2">Detecting sensitive entities...</p>
      </div>
    );
  }

  const renderFieldList = (grouped: ReturnType<typeof getGroupedFields>, pNum: number, isCurrentPage: boolean) => {
    return Object.entries(grouped).map(([type, valueGroups]) => {
      const category = PII_CATEGORIES[type] || { color: 'pii-secret', label: type };
      const color = category.color;
      
      return (
        <div key={`${pNum}-${type}`} className="space-y-3">
          <h4 className={`text-[10px] font-bold uppercase tracking-widest text-${color}/70`}>
            {category.label}
          </h4>
          <div className="space-y-2">
            {Object.entries(valueGroups).map(([value, info], valIdx) => {
              const fieldId = `${pNum}_${type}_${value}`;
              const isRedacted = redactionOverrides[fieldId] !== false;
              
              return (
                <div 
                  key={`${fieldId}-${valIdx}`}
                  className={`
                    flex flex-col p-2.5 rounded-xl border transition-all group
                    ${isRedacted 
                      ? `bg-${color}/5 border-${color}/20` 
                      : 'bg-surface-container border-outline-variant opacity-60'}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className={`text-sm font-bold truncate ${isRedacted ? 'text-on-surface' : 'text-on-surface-variant line-through'}`}>
                        {value}
                      </p>
                      <p className="text-[9px] text-on-surface-variant truncate uppercase tracking-tighter opacity-70">
                        {info.field_name} • {info.occurrences.length} {info.occurrences.length === 1 ? 'occ' : 'occs'}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {isCurrentPage && (
                        <>
                          <button
                            onClick={() => onToggleExclusion(fieldId)}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                            title="Exclude from PII"
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onToggleRedaction(fieldId)}
                            className={`
                              p-1.5 rounded-lg transition-colors
                              ${isRedacted ? `text-${color} hover:bg-${color}/10` : 'text-on-surface-variant hover:bg-surface-container-high'}
                            `}
                          >
                            {isRedacted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </>
                      )}
                      {!isCurrentPage && (
                        <button
                          onClick={() => onNavigateToPage?.(pNum)}
                          className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                          title="Navigate to this page"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {isCurrentPage && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {info.occurrences.map((occ, occIdx) => (
                        <button
                          key={occIdx}
                          onClick={() => occ.start !== null && onJumpToOccurrence?.(occ.start)}
                          className={`
                            text-[9px] px-1.5 py-0.5 rounded border border-outline-variant flex items-center gap-1
                            hover:bg-surface hover:text-primary transition-all
                            ${occ.start === null ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                        >
                          <Zap className="w-2 h-2" />
                          {occ.start}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant flex flex-col h-full overflow-hidden shadow-sm">
      {/* View Mode Toggle */}
      <div className="flex p-1 bg-surface-container border-b border-outline-variant">
        <button
          onClick={() => setViewMode('current')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'current' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface/50'}`}
        >
          <Shield className="w-3.5 h-3.5" />
          Page {pageNumber}
        </button>
        <button
          onClick={() => setViewMode('all')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'all' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface/50'}`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          All Pages ({totalFindingsAcrossPages})
        </button>
      </div>

      {viewMode === 'current' ? (
        <>
          <div className="p-4 border-b border-outline-variant bg-surface">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-outline-variant uppercase tracking-widest">Active PII</span>
                <span className="text-xl font-bold text-on-surface">{activeFieldsCount}</span>
              </div>
              {cacheHit && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 bg-warning/10 text-warning rounded-full border border-warning/20">
                  <Zap className="w-2.5 h-2.5 fill-warning" /> CACHED
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={onRedactAll}
                className="flex-1 py-2 bg-primary text-on-primary hover:bg-primary/90 rounded-xl text-[10px] font-bold transition-all shadow-sm shadow-primary/20"
              >
                REDACT ALL
              </button>
              <button 
                onClick={onKeepAll}
                className="flex-1 py-2 bg-surface-container-high text-on-surface hover:bg-outline-variant rounded-xl text-[10px] font-bold transition-all border border-outline-variant"
              >
                KEEP ALL
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {activeFieldsCount === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mb-4">
                  <ShieldCheck className="w-8 h-8 text-outline-variant" />
                </div>
                <h4 className="font-bold text-on-surface">No active PII</h4>
                <p className="text-xs text-on-surface-variant mt-2">All findings have been reviewed or excluded.</p>
              </div>
            ) : (
              renderFieldList(currentGrouped, pageNumber, true)
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {otherPagesResults.length === 0 && activeFieldsCount === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
              <ShieldAlert className="w-10 h-10 mb-3" />
              <p className="text-sm font-medium">No PII detected in any page yet.</p>
            </div>
          ) : (
            <>
              {/* Current Page Summary in All View */}
              <div className="bg-primary/5 rounded-2xl border border-primary/20 overflow-hidden">
                <button 
                  onClick={() => togglePageExpand(pageNumber)}
                  className="w-full flex items-center justify-between p-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center text-xs font-bold">
                      {pageNumber}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-on-surface">Current Page</p>
                      <p className="text-[10px] text-primary/70 font-medium">{activeFieldsCount} active findings</p>
                    </div>
                  </div>
                  {expandedPages.has(pageNumber) ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-primary" />}
                </button>
                {expandedPages.has(pageNumber) && (
                  <div className="px-3 pb-3 pt-1 space-y-4 border-t border-primary/10">
                    {renderFieldList(currentGrouped, pageNumber, true)}
                  </div>
                )}
              </div>

              {/* Other Pages */}
              {otherPagesResults.map(p => (
                <div key={p.pageNum} className="bg-surface-container rounded-2xl border border-outline-variant overflow-hidden">
                  <button 
                    onClick={() => togglePageExpand(p.pageNum)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-surface-container-high transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-surface text-on-surface-variant rounded-lg flex items-center justify-center text-xs font-bold border border-outline-variant">
                        {p.pageNum}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-on-surface">Page {p.pageNum}</p>
                        <p className="text-[10px] text-on-surface-variant font-medium">{p.activeCount} findings</p>
                      </div>
                    </div>
                    {expandedPages.has(p.pageNum) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {expandedPages.has(p.pageNum) && (
                    <div className="px-3 pb-3 pt-1 space-y-4 border-t border-outline-variant bg-surface/30">
                      {renderFieldList(getGroupedFields(p.fields, p.pageNum), p.pageNum, false)}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ShieldCheck(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
