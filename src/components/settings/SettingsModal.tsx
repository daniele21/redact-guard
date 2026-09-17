import React from 'react';
import { X, Save, Plus, Trash2, Pencil, RotateCcw } from 'lucide-react';
import { useProfiles } from '../../hooks/useProfiles';
import { PIITypeDefinition } from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const toTypeId = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '_');

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { profiles, customTypes, loading, addCustomType, updateCustomType, removeCustomType } = useProfiles();
  const [newTypeName, setNewTypeName] = React.useState('');
  const [newTypeDesc, setNewTypeDesc] = React.useState('');
  const [editingName, setEditingName] = React.useState<string | null>(null);
  const [editTypeName, setEditTypeName] = React.useState('');
  const [editTypeDesc, setEditTypeDesc] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim() || !newTypeDesc.trim()) return;

    setIsSubmitting(true);
    setError('');
    try {
      await addCustomType(toTypeId(newTypeName), newTypeDesc.trim());
      setNewTypeName('');
      setNewTypeDesc('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (type: PIITypeDefinition) => {
    setEditingName(type.name);
    setEditTypeName(type.label || type.name.replace(/_/g, ' '));
    setEditTypeDesc(type.description);
    setError('');
  };

  const cancelEditing = () => {
    setEditingName(null);
    setEditTypeName('');
    setEditTypeDesc('');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingName || !editTypeName.trim() || !editTypeDesc.trim()) return;

    setIsSubmitting(true);
    setError('');
    try {
      await updateCustomType(editingName, toTypeId(editTypeName), editTypeDesc.trim());
      cancelEditing();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (name: string) => {
    setError('');
    try {
      await removeCustomType(name);
      if (editingName === name) cancelEditing();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-container-highest/60 backdrop-blur-sm transition-all duration-300">
      <div className="bg-surface-container-lowest w-full max-w-3xl rounded-2xl shadow-xl flex flex-col max-h-[90vh] border border-outline-variant transition-colors duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <div>
            <h2 className="text-xl font-semibold text-on-surface transition-colors">PII Taxonomy</h2>
            <p className="text-sm text-on-surface-variant transition-colors">
              Define what RedactGuard should treat as sensitive data without changing the detection engine.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface rounded-full transition-all"
            aria-label="Close PII taxonomy settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 flex flex-col gap-8">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium text-on-surface">PII definitions are configuration, not code.</p>
            <p className="text-sm text-on-surface-variant mt-1">
              Start from a domain profile, then add or edit organization-specific definitions. The active taxonomy is injected into the local detection prompt automatically.
            </p>
          </div>

          {/* Base Profiles section */}
          <section>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">Base profiles</h3>
                <p className="text-xs text-on-surface-variant mt-1">Reusable defaults for common document domains.</p>
              </div>
              <span className="text-xs text-on-surface-variant">Select during upload</span>
            </div>
            {loading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-20 bg-surface-container rounded-xl"></div>
                <div className="h-20 bg-surface-container rounded-xl"></div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {profiles.map(p => (
                  <div key={p.name} className="border border-outline-variant p-4 rounded-xl bg-surface transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-on-surface capitalize">{p.display_name}</h4>
                      <span className="text-xs font-medium px-2 py-1 bg-surface-container-high rounded-full text-on-surface-variant">
                        {p.pii_type_count} types
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant line-clamp-2">{p.description}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Custom Types section */}
          <section>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-pii-custom uppercase tracking-wider">Custom PII definitions</h3>
                <p className="text-xs text-on-surface-variant mt-1">Organization-specific rules layered on top of the selected base profile.</p>
              </div>
              <span className="text-xs text-on-surface-variant">Global · Applied automatically</span>
            </div>

            <div className="border border-outline-variant rounded-xl overflow-hidden bg-surface transition-colors">
              <div className="divide-y divide-outline-variant max-h-72 overflow-y-auto">
                {customTypes.length === 0 ? (
                  <div className="p-6 text-center text-sm text-on-surface-variant">
                    No custom PII definitions yet. Add one below to extend the taxonomy.
                  </div>
                ) : (
                  customTypes.map(type => (
                    <div key={type.name} className="p-4 hover:bg-surface-container-lowest transition-colors">
                      {editingName === type.name ? (
                        <form onSubmit={handleUpdate} className="flex flex-col gap-3">
                          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-start">
                            <input
                              type="text"
                              aria-label={`Edit name for ${type.label}`}
                              className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-pii-custom/50 focus:border-pii-custom transition-all"
                              value={editTypeName}
                              onChange={e => setEditTypeName(e.target.value)}
                              disabled={isSubmitting}
                              required
                            />
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                disabled={isSubmitting || !editTypeName.trim() || !editTypeDesc.trim()}
                                className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:bg-primary-container transition-all disabled:opacity-50"
                              >
                                <Save className="w-4 h-4" />
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditing}
                                disabled={isSubmitting}
                                className="inline-flex items-center gap-2 px-3 py-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg text-sm transition-all"
                              >
                                <RotateCcw className="w-4 h-4" />
                                Cancel
                              </button>
                            </div>
                          </div>
                          <textarea
                            aria-label={`Edit description for ${type.label}`}
                            rows={3}
                            className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-pii-custom/50 focus:border-pii-custom transition-all resize-y"
                            value={editTypeDesc}
                            onChange={e => setEditTypeDesc(e.target.value)}
                            disabled={isSubmitting}
                            required
                          />
                          <p className="text-xs text-on-surface-variant">
                            Write the definition as a clear instruction describing what the local model should identify.
                          </p>
                        </form>
                      ) : (
                        <div className="flex items-start gap-4 group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-medium text-on-surface">{type.label}</span>
                              <span className="text-xs font-mono text-outline px-1.5 py-0.5 bg-surface-container rounded">
                                {type.name}
                              </span>
                            </div>
                            <p className="text-sm text-on-surface-variant">{type.description}</p>
                          </div>
                          <div className="flex gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEditing(type)}
                              className="text-on-surface-variant hover:text-primary p-2 transition-all rounded-lg hover:bg-primary/10"
                              title="Edit custom PII definition"
                              aria-label={`Edit ${type.label}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRemove(type.name)}
                              className="text-on-surface-variant hover:text-error p-2 transition-all rounded-lg hover:bg-error/10"
                              title="Remove custom PII definition"
                              aria-label={`Remove ${type.label}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add form */}
              <div className="bg-surface-container p-4 border-t border-outline-variant transition-colors">
                <div className="mb-3">
                  <p className="text-sm font-medium text-on-surface">Add a PII definition</p>
                  <p className="text-xs text-on-surface-variant mt-1">No code change is required. New definitions become part of the detection prompt.</p>
                </div>
                <form onSubmit={handleAdd} className="flex flex-col gap-3">
                  {error && <div className="text-error text-sm font-medium" role="alert">{error}</div>}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      placeholder="Name (e.g. Employee ID)"
                      className="flex-1 px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-pii-custom/50 focus:border-pii-custom transition-all"
                      value={newTypeName}
                      onChange={e => setNewTypeName(e.target.value)}
                      disabled={isSubmitting}
                      required
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting || !newTypeName.trim() || !newTypeDesc.trim()}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:bg-primary-container transition-all disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      Add definition
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Description (what should the local model identify?)"
                    className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-pii-custom/50 focus:border-pii-custom resize-y"
                    value={newTypeDesc}
                    onChange={e => setNewTypeDesc(e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </form>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant flex justify-between items-center gap-4 bg-surface-container-lowest rounded-b-2xl">
          <p className="text-xs text-on-surface-variant">Taxonomy changes affect subsequent analyses and their cache keys.</p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-primary text-on-primary font-medium rounded-xl shadow-sm hover:bg-primary-container transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
