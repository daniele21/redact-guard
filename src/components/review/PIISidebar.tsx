import React from 'react';
import { PIIField } from '../../types';
import { PII_CATEGORIES } from '../../config/theme.config';
import { Shield, ShieldAlert, Zap, Eye, EyeOff, ShieldOff } from 'lucide-react';

interface PIISidebarProps {
  fields: PIIField[];
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
}

export function PIISidebar({
  fields,
  pageNumber,
  cacheHit,
  redactionOverrides,
  excludedFields,
  onToggleRedaction,
  onToggleExclusion,
  onRedactAll,
  onKeepAll,
  isAnalyzing,
  onJumpToOccurrence
}: PIISidebarProps) {

  // Group fields by category, then by value for cleaner display
  const groupedByCategory = fields.reduce((acc, field) => {
    const fieldId = `${pageNumber}_${field.pii_type}_${field.value}`;
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

  const excludedCount = fields.filter(f => excludedFields.has(`${pageNumber}_${f.pii_type}_${f.value}`)).length;
  const activeFieldsCount = fields.length - excludedCount;

  if (isAnalyzing) {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant p-6 h-full flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <h3 className="font-medium text-on-surface">Analyzing Page {pageNumber}</h3>
        <p className="text-sm text-on-surface-variant mt-2">Detecting sensitive entities...</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant flex flex-col h-full overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-outline-variant bg-surface">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-on-surface flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Detected Entities
          </h3>
          {cacheHit && (
            <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 bg-warning/10 text-warning rounded-full" title="Loaded from local cache instantly">
              <Zap className="w-3 h-3" /> Cached
            </span>
          )}
        </div>
        
        <div className="flex items-center justify-between text-sm text-on-surface-variant mb-4">
          <span>{activeFieldsCount} active fields</span>
          <span>{Object.keys(groupedByCategory).length} categories</span>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={onRedactAll}
            className="flex-1 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-sm font-medium transition-colors"
          >
            Redact All
          </button>
          <button 
            onClick={onKeepAll}
            className="flex-1 py-2 bg-surface-container-high text-on-surface hover:bg-outline-variant rounded-lg text-sm font-medium transition-colors"
          >
            Keep All
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeFieldsCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-on-surface-variant">
            <ShieldAlert className="w-10 h-10 mb-3 opacity-20" />
            <p>No active PII on this page.</p>
            {excludedCount > 0 && (
              <p className="text-xs mt-2 opacity-60">{excludedCount} items were excluded as non-PII</p>
            )}
          </div>
        ) : (
          Object.entries(groupedByCategory).map(([type, valueGroups]) => {
            const category = PII_CATEGORIES[type] || { color: 'pii-secret', label: type };
            const color = category.color;
            
            return (
              <div key={type} className="space-y-3">
                <h4 className={`text-xs font-semibold uppercase tracking-wider text-${color}`}>
                  {category.label}
                </h4>
                <div className="space-y-3">
                  {Object.entries(valueGroups).map(([value, info], valIdx) => {
                    const fieldId = `${pageNumber}_${type}_${value}`;
                    const isRedacted = redactionOverrides[fieldId] !== false;
                    
                    return (
                      <div 
                        key={`${fieldId}-${valIdx}`}
                        className={`
                          flex flex-col p-3 rounded-xl border transition-colors group
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
                            <p className="text-[10px] text-on-surface-variant truncate uppercase tracking-tighter opacity-70">
                              {info.field_name} • {info.occurrences.length} {info.occurrences.length === 1 ? 'occurrence' : 'occurrences'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onToggleExclusion(fieldId)}
                              className="p-2 rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                              title="Flag as non-PII (Exclude)"
                            >
                              <ShieldOff className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onToggleRedaction(fieldId)}
                              className={`
                                p-2 rounded-lg transition-colors
                                ${isRedacted 
                                  ? `text-${color} hover:bg-${color}/10` 
                                  : 'text-on-surface-variant hover:bg-surface-container-high'}
                              `}
                              title={isRedacted ? "Unredact" : "Redact"}
                            >
                              {isRedacted ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        
                        {/* Occurrences / Positions */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {info.occurrences.map((occ, occIdx) => (
                            <button
                              key={occIdx}
                              onClick={() => occ.start !== null && onJumpToOccurrence?.(occ.start)}
                              className={`
                                text-[10px] px-2 py-0.5 rounded border border-outline-variant flex items-center gap-1
                                hover:bg-surface hover:text-primary transition-all
                                ${occ.start === null ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                              `}
                              title={`Jump to position ${occ.start}-${occ.end}`}
                            >
                              <Zap className="w-2.5 h-2.5" />
                              {occ.start}-{occ.end}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
