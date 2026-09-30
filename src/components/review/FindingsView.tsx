import React, { useMemo, useState } from 'react';
import {
  Check,
  Eye,
  Search,
  ShieldOff,
  UserCheck,
} from 'lucide-react';
import { DocumentState } from '../../hooks/useDocument';
import { PIIField, ReviewDecision } from '../../types';
import { fieldId } from './reviewIdentity';

interface FindingsViewProps {
  state: DocumentState;
  decisions: Record<string, ReviewDecision>;
  onSetDecision: (findingIds: string[], decision: ReviewDecision) => void;
  onOpenOccurrence: (page: number, start: number | null) => void;
}

interface EntityGroup {
  entityId: string;
  label: string;
  type: string;
  maskedValue: string;
  occurrences: Array<{ page: number; field: PIIField }>;
}

export function FindingsView({
  state,
  decisions,
  onSetDecision,
  onOpenOccurrence,
}: FindingsViewProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const summaryEntities = useMemo(
    () => new Map((state.summary?.entities ?? []).map(entity => [entity.entity_id, entity])),
    [state.summary],
  );

  const entities = useMemo(() => {
    const groups = new Map<string, EntityGroup>();

    for (const [pageValue, result] of Object.entries(state.analysisResults)) {
      const page = Number(pageValue);
      for (const field of result.pii_fields) {
        const existing = groups.get(field.entity_id);
        if (existing) {
          existing.occurrences.push({ page, field });
        } else {
          groups.set(field.entity_id, {
            entityId: field.entity_id,
            label: field.field_name,
            type: field.pii_type,
            maskedValue:
              summaryEntities.get(field.entity_id)?.masked_value ??
              maskFallback(field.value),
            occurrences: [{ page, field }],
          });
        }
      }
    }

    return [...groups.values()].sort(
      (a, b) => b.occurrences.length - a.occurrences.length || a.label.localeCompare(b.label),
    );
  }, [state.analysisResults, summaryEntities]);

  const types = [...new Set(entities.map(entity => entity.type))].sort();
  const filtered = entities.filter(entity => {
    const matchesType = typeFilter === 'all' || entity.type === typeFilter;
    const needle = query.trim().toLowerCase();
    const matchesQuery =
      !needle ||
      entity.label.toLowerCase().includes(needle) ||
      entity.maskedValue.toLowerCase().includes(needle) ||
      entity.type.toLowerCase().includes(needle);
    return matchesType && matchesQuery;
  });

  return (
    <div className="flex-1 overflow-y-auto bg-surface-container-low p-5 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Review queue
            </span>
            <h2 className="text-2xl font-bold text-on-surface mt-1">Sensitive findings</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Review unique sensitive items. A decision applies to every occurrence of that item.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 bg-surface border border-outline-variant rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-outline" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search findings"
                className="bg-transparent outline-none text-sm min-w-[180px]"
              />
            </label>
            <select
              value={typeFilter}
              onChange={event => setTypeFilter(event.target.value)}
              className="bg-surface border border-outline-variant rounded-xl px-3 py-2 text-sm"
            >
              <option value="all">All categories</option>
              {types.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl py-16 text-center">
            <UserCheck className="w-10 h-10 text-outline mx-auto mb-3" />
            <h3 className="font-bold text-on-surface">No matching findings</h3>
            <p className="text-sm text-on-surface-variant mt-1">
              Analyze the document or change the current filters.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(entity => {
              const findingIds = entity.occurrences.map(({ page, field }) => fieldId(field, page));
              const entityDecisions = findingIds.map(id => decisions[id] ?? 'redact');
              const decision = entityDecisions.every(value => value === entityDecisions[0])
                ? entityDecisions[0]
                : 'mixed';

              return (
                <article
                  key={entity.entityId}
                  className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm"
                >
                  <div className="flex flex-col xl:flex-row xl:items-center gap-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-2.5 py-1">
                          {entity.label}
                        </span>
                        <span className="text-[10px] font-mono text-outline bg-surface-container rounded-full px-2.5 py-1">
                          {entity.type}
                        </span>
                      </div>
                      <div className="text-lg font-bold text-on-surface font-mono">
                        {entity.maskedValue}
                      </div>
                      <p className="text-xs text-on-surface-variant mt-1">
                        {entity.occurrences.length} occurrence{entity.occurrences.length === 1 ? '' : 's'} ·{' '}
                        {new Set(entity.occurrences.map(item => item.page)).size} page
                        {new Set(entity.occurrences.map(item => item.page)).size === 1 ? '' : 's'}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {entity.occurrences.map(({ page, field }) => (
                          <button
                            key={fieldId(field, page)}
                            onClick={() => onOpenOccurrence(page, field.start)}
                            className="px-2.5 py-1 rounded-lg bg-surface-container text-xs font-semibold text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors"
                          >
                            Page {page}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <DecisionButton
                        active={decision === 'redact'}
                        label="Redact"
                        icon={<Check className="w-4 h-4" />}
                        onClick={() => onSetDecision(findingIds, 'redact')}
                      />
                      <DecisionButton
                        active={decision === 'keep'}
                        label="Keep"
                        icon={<Eye className="w-4 h-4" />}
                        onClick={() => onSetDecision(findingIds, 'keep')}
                      />
                      <DecisionButton
                        active={decision === 'not_pii'}
                        label="Not PII"
                        icon={<ShieldOff className="w-4 h-4" />}
                        onClick={() => onSetDecision(findingIds, 'not_pii')}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm'
          : 'flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container text-on-surface-variant border border-outline-variant font-semibold text-sm hover:border-primary/40'
      }
    >
      {icon}
      {label}
    </button>
  );
}

function maskFallback(value: string): string {
  if (!value) return '••••';
  if (value.length <= 4) return `${value.slice(0, 1)}•••`;
  return `${value.slice(0, 3)}••••${value.slice(-2)}`;
}
