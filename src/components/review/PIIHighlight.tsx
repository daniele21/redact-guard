import React from 'react';
import { PIIField } from '../../types';
import { PII_CATEGORIES } from '../../config/theme.config';

interface PIIHighlightProps {
  key?: React.Key;
  field: PIIField;
  isRedacted: boolean;
  onToggle: () => void;
}

export function PIIHighlight({ field, isRedacted, onToggle }: PIIHighlightProps) {
  const category = PII_CATEGORIES[field.pii_type] || { color: 'pii-secret', label: field.pii_type };
  const colorClass = category.color;

  return (
    <span 
      onClick={onToggle}
      className={`
        inline-flex items-center mx-0.5 px-1.5 rounded-md cursor-pointer transition-all duration-200 border-b-2
        ${isRedacted 
          ? 'bg-surface-container-high text-on-surface-variant border-outline-variant line-through opacity-70'
          : `bg-${colorClass}/10 text-on-surface border-${colorClass}/50 hover:bg-${colorClass}/20`
        }
      `}
      title={`${field.field_name} (${category.label})\nClick to toggle redaction`}
    >
      {isRedacted ? field.redacted_value : field.value}
    </span>
  );
}
