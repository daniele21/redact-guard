import React from 'react';
import { X, Info, ShieldCheck } from 'lucide-react';
import { ProfileDetail } from '../../types';
import { api } from '../../services/api';

interface ProfileInfoModalProps {
  profileName: string;
  onClose: () => void;
}

export function ProfileInfoModal({ profileName, onClose }: ProfileInfoModalProps) {
  const [detail, setDetail] = React.useState<ProfileDetail | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchDetail = async () => {
      try {
        const data = await api.getProfileDetail(profileName);
        setDetail(data);
      } catch (err) {
        console.error('Failed to fetch profile details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [profileName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-2xl max-h-[80vh] rounded-[32px] border border-outline-variant shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">
                {loading ? 'Loading Profile...' : detail?.display_name}
              </h2>
              <p className="text-sm text-on-surface-variant">PII Detection Strategy</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-surface-container-high flex items-center justify-center transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-on-surface-variant animate-pulse">Retrieving PII definitions...</p>
            </div>
          ) : detail ? (
            <>
              <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                <p className="text-on-surface leading-relaxed">{detail.description}</p>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold text-outline uppercase tracking-widest px-1">Detected Entities ({detail.pii_types.length})</h3>
                <div className="grid grid-cols-1 gap-3">
                  {detail.pii_types.map((type) => (
                    <div 
                      key={type.name}
                      className="group p-4 bg-surface-container-lowest rounded-2xl border border-outline-variant/50 hover:border-primary/30 transition-all"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                          <Info className="w-5 h-5 text-primary/70" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-on-surface">{type.label}</h4>
                            <span className="text-[10px] font-mono bg-surface-container-high px-1.5 py-0.5 rounded text-outline">
                              {type.name}
                            </span>
                          </div>
                          <p className="text-sm text-on-surface-variant leading-relaxed">
                            {type.description}
                          </p>
                          {type.examples.length > 0 && (
                            <div className="pt-2 flex flex-wrap gap-2">
                              {type.examples.map((ex, idx) => (
                                <span key={idx} className="text-[11px] px-2 py-0.5 bg-surface-container rounded-full text-on-surface-variant border border-outline-variant/30 italic">
                                  "{ex}"
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-error">Failed to load profile details.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-surface-container-low border-t border-outline-variant flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-on-surface text-surface rounded-full font-bold hover:opacity-90 transition-opacity shadow-lg"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
