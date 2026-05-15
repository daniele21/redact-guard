import React from 'react';
import { PIIField } from '../../types';
import { PII_CATEGORIES } from '../../config/theme.config';
import { Shield, ShieldAlert, Zap, Eye, EyeOff } from 'lucide-react';

interface PIISidebarProps {
  fields: PIIField[];
  pageNumber: number;
  cacheHit: boolean;
  redactionOverrides: Record<string, boolean>;
  onToggleRedaction: (fieldId: string) => void;
  onRedactAll: () => void;
  onKeepAll: () => void;
  isAnalyzing: boolean;
}

export function PIISidebar({
  fields,
  pageNumber,
  cacheHit,
  redactionOverrides,
  onToggleRedaction,
  onRedactAll,
  onKeepAll,
  isAnalyzing
}: PIISidebarProps) {

  // Group fields by category for cleaner display
  const groupedFields = fields.reduce((acc, field) => {
    if (!acc[field.pii_type]) acc[field.pii_type] = [];
    acc[field.pii_type].push(field);
    return acc;
  }, {} as Record<string, PIIField[]>);

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
          <span>{fields.length} fields found</span>
          <span>{Object.keys(groupedFields).length} categories</span>
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
        {fields.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-on-surface-variant">
            <ShieldAlert className="w-10 h-10 mb-3 opacity-20" />
            <p>No PII detected on this page.</p>
          </div>
        ) : (
          Object.entries(groupedFields).map(([type, typeFields]) => {
            const category = PII_CATEGORIES[type] || { color: 'pii-secret', label: type };
            const color = category.color;
            
            return (
              <div key={type} className="space-y-3">
                <h4 className={`text-xs font-semibold uppercase tracking-wider text-${color}`}>
                  {category.label}
                </h4>
                <div className="space-y-2">
                  {typeFields.map((field, idx) => {
                    const fieldId = `${pageNumber}_${field.pii_type}_${field.value}`;
                    const isRedacted = redactionOverrides[fieldId] !== false;
                    
                    return (
                      <div 
                        key={`${fieldId}-${idx}`}
                        className={`
                          flex items-center justify-between p-3 rounded-xl border transition-colors
                          ${isRedacted 
                            ? `bg-${color}/5 border-${color}/20` 
                            : 'bg-surface-container border-outline-variant opacity-60'}
                        `}
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <p className={`text-sm font-medium truncate ${isRedacted ? 'text-on-surface' : 'text-on-surface-variant line-through'}`}>
                            {field.value}
                          </p>
                          <p className="text-xs text-on-surface-variant truncate mt-0.5">
                            {field.field_name}
                          </p>
                        </div>
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
