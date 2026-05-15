import React from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import { useProfiles } from '../../hooks/useProfiles';
import { PIITypeDefinition } from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { profiles, customTypes, loading, addCustomType, removeCustomType } = useProfiles();
  const [newTypeName, setNewTypeName] = React.useState('');
  const [newTypeDesc, setNewTypeDesc] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim() || !newTypeDesc.trim()) return;
    
    // Convert spaced name to snake_case id
    const id = newTypeName.trim().toLowerCase().replace(/\s+/g, '_');
    
    setIsSubmitting(true);
    setError('');
    try {
      await addCustomType(id, newTypeDesc.trim());
      setNewTypeName('');
      setNewTypeDesc('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (name: string) => {
    try {
      await removeCustomType(name);
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
            <h2 className="text-xl font-semibold text-on-surface transition-colors">Settings & PII Profiles</h2>
            <p className="text-sm text-on-surface-variant transition-colors">Configure how the LLM detects sensitive data</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 flex flex-col gap-8">
          
          {/* Base Profiles section */}
          <section>
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-4">Available Base Profiles</h3>
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
            <p className="text-xs text-on-surface-variant mt-3 italic">
              * Base profiles define the default PII types. You can select which one to use when uploading a document.
            </p>
          </section>

          {/* Custom Types section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-pii-custom uppercase tracking-wider">Custom PII Types</h3>
              <span className="text-xs text-on-surface-variant">Global · Applied to all analysis</span>
            </div>

            <div className="border border-outline-variant rounded-xl overflow-hidden bg-surface transition-colors">
              {/* List */}
              <div className="divide-y divide-outline-variant max-h-60 overflow-y-auto">
                {customTypes.length === 0 ? (
                  <div className="p-6 text-center text-sm text-on-surface-variant">
                    No custom types defined yet.
                  </div>
                ) : (
                  customTypes.map(type => (
                    <div key={type.name} className="p-4 flex items-start gap-4 hover:bg-surface-container-lowest transition-colors group">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-on-surface">{type.label}</span>
                          <span className="text-xs font-mono text-outline px-1.5 py-0.5 bg-surface-container rounded">
                            {type.name}
                          </span>
                        </div>
                        <p className="text-sm text-on-surface-variant">{type.description}</p>
                      </div>
                      <button
                        onClick={() => handleRemove(type.name)}
                        className="text-outline-variant hover:text-error p-2 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-error/10"
                        title="Remove custom type"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add form */}
              <div className="bg-surface-container p-4 border-t border-outline-variant transition-colors">
                <form onSubmit={handleAdd} className="flex flex-col gap-3">
                  {error && <div className="text-error text-sm font-medium">{error}</div>}
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Name (e.g. Company ID)"
                      className="flex-1 px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-pii-custom/50 focus:border-pii-custom transition-all"
                      value={newTypeName}
                      onChange={e => setNewTypeName(e.target.value)}
                      disabled={isSubmitting}
                      required
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting || !newTypeName || !newTypeDesc}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:bg-primary-container transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? <span className="animate-spin">⌛</span> : <Plus className="w-4 h-4" />}
                      Add Type
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Description (instructions for the LLM to find it)"
                    className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pii-custom/50 focus:border-pii-custom"
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
        <div className="px-6 py-4 border-t border-outline-variant flex justify-end bg-surface-container-lowest rounded-b-2xl">
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
