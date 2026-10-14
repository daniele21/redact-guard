import type { PIIField } from '../../types';

interface PIIHighlightProps {
  field: PIIField;
  isRedacted: boolean;
  onToggle: () => void;
}

// The source canvas shows original text so inspection does not change the
// default-safe 'redact' decision. Inspector lists remain masked.
export function PIIHighlight({ field, isRedacted, onToggle }: PIIHighlightProps) {
  const decision = isRedacted ? 'Oscura' : 'Mantieni';
  const action = isRedacted ? 'mantenere' : 'oscurare';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={field.field_name + '. Decisione attuale: ' + decision + '. Attiva per ' + action + '.'}
      aria-pressed={!isRedacted}
      title={field.field_name + ' · ' + decision + ' nell’export · Cambia decisione'}
      className={
        'mx-0.5 inline rounded-md border-b-2 px-1 py-0.5 font-medium transition-colors ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
        (isRedacted
          ? 'border-primary bg-primary/15 text-on-surface hover:bg-primary/25'
          : 'border-warning bg-warning/10 text-on-surface hover:bg-warning/20')
      }
    >
      {field.value}
    </button>
  );
}
