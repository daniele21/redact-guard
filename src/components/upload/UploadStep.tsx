import React, { useCallback, useState } from 'react';
import { Upload, File as FileIcon, X, AlertCircle, Info, ChevronRight, FileText, HeartPulse, Landmark, Scale } from 'lucide-react';
import { useProfiles } from '../../hooks/useProfiles';
import { ProfileInfoModal } from './ProfileInfoModal';
import { LandingHero } from '../landing/LandingHero';
import { LandingProblem } from '../landing/LandingProblem';
import { LandingHowItWorks } from '../landing/LandingHowItWorks';
import { LandingFooter } from '../landing/LandingFooter';

interface UploadStepProps {
  onAnalyze: (file: File, profile: string) => void;
  isUploading: boolean;
}

export function UploadStep({ onAnalyze, isUploading }: UploadStepProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<string>('general');
  const [selectedInfoProfile, setSelectedInfoProfile] = useState<string | null>(null);
  const { profiles } = useProfiles();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateAndSetFile = (selectedFile: File) => {
    setError(null);
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file.');
      return;
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File size must be under 50MB.');
      return;
    }
    setFile(selectedFile);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    if (file) {
      onAnalyze(file, profile);
    }
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Hero Section */}
      <LandingHero />

      {/* Problem / Why section */}
      <LandingProblem />

      {/* Steps */}
      <LandingHowItWorks />

      {/* Main Tool Section */}
      <section className="py-12 px-4 max-w-5xl mx-auto w-full">
        <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-[2.5rem] shadow-2xl shadow-primary/5 overflow-hidden">
          <div className="grid lg:grid-cols-2">
            
            {/* Left: Configuration */}
            <div className="p-8 lg:p-12 bg-surface-container-low/50 border-r border-outline-variant/30">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-on-surface mb-1 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm">1</span>
                  What type of document is it?
                </h2>
                <p className="text-sm text-on-surface-variant">
                  Pick the profile closest to your document. The AI will know what to look for.
                </p>
              </div>

              {/* Profile cards */}
              <div className="space-y-2">
                {profiles.map(p => {
                  const meta: Record<string, { icon: React.ReactNode; hint: string }> = {
                    general:    { icon: <FileText className="w-5 h-5" />,    hint: 'Emails, CVs, letters, general forms' },
                    financial:  { icon: <Landmark className="w-5 h-5" />,    hint: 'Bank statements, financial contracts, policies' },
                    healthcare: { icon: <HeartPulse className="w-5 h-5" />,  hint: 'Medical reports, clinical records, prescriptions' },
                    legal:      { icon: <Scale className="w-5 h-5" />,       hint: 'Contracts, deeds, minutes, NDAs' },
                  };
                  const m = meta[p.name] ?? { icon: <FileText className="w-5 h-5" />, hint: '' };
                  const isSelected = profile === p.name;

                  return (
                    <div key={p.name} className="relative group">
                      <label
                        className={`
                          flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200
                          ${isUploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
                          ${isSelected
                            ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20'
                            : 'bg-surface border-outline-variant/50 hover:border-primary/40 hover:bg-surface-container-lowest'}
                        `}
                      >
                        <input
                          type="radio"
                          name="profile"
                          value={p.name}
                          checked={isSelected}
                          onChange={(e) => setProfile(e.target.value)}
                          disabled={isUploading}
                          className="hidden"
                        />

                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors
                          ${isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                          {m.icon}
                        </div>

                        {/* Text */}
                        <div className="flex-grow min-w-0">
                          <span className={`font-semibold block ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                            {p.display_name}
                          </span>
                          <span className="text-xs text-on-surface-variant block mt-0.5 truncate">{m.hint}</span>
                        </div>

                        {/* Category count */}
                        <span className={`text-xs font-bold shrink-0 px-2 py-1 rounded-full
                          ${isSelected ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-outline'}`}>
                          {p.pii_type_count} types
                        </span>
                      </label>

                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedInfoProfile(p.name); }}
                        disabled={isUploading}
                        className={`
                          absolute top-3.5 right-14 p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100
                          ${isSelected ? 'text-primary hover:bg-primary/10' : 'text-outline hover:bg-surface-container-high'}
                          ${isUploading ? '!opacity-0' : ''}
                        `}
                        title="View profile details"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {selectedInfoProfile && (
                <ProfileInfoModal 
                  profileName={selectedInfoProfile} 
                  onClose={() => setSelectedInfoProfile(null)} 
                />
              )}
            </div>

            {/* Right: Upload Area */}
            <div className="p-8 lg:p-12 flex flex-col">
              <div className="mb-8">
                <h2 className="text-xl font-bold text-on-surface mb-2 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm">2</span>
                  Upload Document
                </h2>
                <p className="text-sm text-on-surface-variant">
                  Your PDF will be analyzed locally. No data leaves this device.
                </p>
              </div>

              <div 
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`
                  flex-grow relative border-2 border-dashed rounded-[2rem] p-8 text-center transition-all duration-500
                  ${isUploading ? 'opacity-60 pointer-events-none' : ''}
                  ${dragActive 
                    ? 'border-primary bg-primary/5 scale-[1.01]' 
                    : file 
                      ? 'border-success/40 bg-success/5' 
                      : 'border-outline-variant bg-surface-container-lowest hover:border-primary/30 hover:bg-primary/[0.02]'
                  }
                `}
              >
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  accept=".pdf"
                  onChange={handleChange}
                  disabled={isUploading}
                />

                {!file ? (
                  <label 
                    htmlFor="file-upload"
                    className="cursor-pointer h-full flex flex-col items-center justify-center gap-5 min-h-[200px]"
                  >
                    <div className={`w-20 h-20 rounded-3xl flex items-center justify-center transition-all duration-500
                      ${dragActive ? 'bg-primary text-white shadow-xl shadow-primary/20 rotate-6' : 'bg-surface-container-high text-on-surface-variant'}
                    `}>
                      <Upload className="w-10 h-10" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-on-surface mb-1">
                        Select a PDF document
                      </p>
                      <p className="text-sm text-on-surface-variant">
                        Drag and drop or <span className="text-primary font-semibold hover:underline">browse files</span>
                      </p>
                    </div>
                  </label>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-6 min-h-[200px] animate-fade-in">
                    <div className="w-20 h-20 rounded-3xl bg-success/10 text-success flex items-center justify-center shadow-lg shadow-success/10">
                      <FileIcon className="w-10 h-10" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-on-surface truncate max-w-[240px] mx-auto">
                        {file.name}
                      </p>
                      <p className="text-sm text-on-surface-variant mt-1">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      onClick={() => setFile(null)}
                      className="text-xs font-semibold text-outline hover:text-error transition-colors flex items-center gap-1.5 py-1.5 px-3 rounded-full hover:bg-error/5"
                      disabled={isUploading}
                    >
                      <X className="w-3.5 h-3.5" /> Remove file
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 text-error bg-error/10 p-4 rounded-2xl animate-shake">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-semibold">{error}</p>
                </div>
              )}

              <div className="mt-8">
                <button
                  onClick={handleSubmit}
                  disabled={!file || isUploading}
                  className={`
                    w-full py-4 rounded-2xl text-lg font-bold flex items-center justify-center gap-3 transition-all duration-300
                    ${!file 
                      ? 'bg-surface-container-high text-outline cursor-not-allowed' 
                      : isUploading
                        ? 'bg-primary/80 text-white cursor-wait'
                        : 'bg-primary text-on-primary hover:bg-primary-container shadow-xl shadow-primary/20 hover:-translate-y-1'
                    }
                  `}
                >
                  {isUploading ? (
                    <>
                      <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Uploading & Extracting...</span>
                    </>
                  ) : (
                    <>
                      Upload & Continue
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}
