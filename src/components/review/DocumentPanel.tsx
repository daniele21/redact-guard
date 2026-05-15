import React from 'react';
import { PIIField } from '../../types';
import { PIIHighlight } from './PIIHighlight';

interface DocumentPanelProps {
  text: string;
  fields: PIIField[];
  redactionOverrides: Record<string, boolean>;
  onToggleRedaction: (fieldId: string) => void;
  pageNumber: number;
}

export function DocumentPanel({ 
  text, 
  fields, 
  redactionOverrides, 
  onToggleRedaction,
  pageNumber 
}: DocumentPanelProps) {
  
  // To replace text with React components, we need to split the string
  // based on the start/end offsets.
  // We sort fields by their start offset. If start/end are null, we can't reliably
  // highlight inline, so we just filter them out for the text panel (they still appear in sidebar).
  
  const validFields = fields.filter(f => f.start !== null && f.end !== null);
  validFields.sort((a, b) => (a.start as number) - (b.start as number));

  const renderText = () => {
    if (validFields.length === 0) {
      return <span className="whitespace-pre-wrap">{text}</span>;
    }

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    validFields.forEach((field, i) => {
      const start = field.start as number;
      const end = field.end as number;

      // Add text before this field
      if (start > lastIndex) {
        elements.push(
          <span key={`text-${i}`} className="whitespace-pre-wrap">
            {text.slice(lastIndex, start)}
          </span>
        );
      }

      // Add the highlighted field
      const fieldId = `${pageNumber}_${field.pii_type}_${field.value}`;
      // Default to redacted (true) unless explicitly overridden
      const isRedacted = redactionOverrides[fieldId] !== false;

      elements.push(
        <PIIHighlight 
          key={`hl-${i}`}
          field={field}
          isRedacted={isRedacted}
          onToggle={() => onToggleRedaction(fieldId)}
        />
      );

      lastIndex = end;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      elements.push(
        <span key="text-end" className="whitespace-pre-wrap">
          {text.slice(lastIndex)}
        </span>
      );
    }

    return elements;
  };

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-8 min-h-[600px] shadow-sm overflow-y-auto font-mono text-sm leading-relaxed">
      {renderText()}
    </div>
  );
}
