import React, { useCallback, useState } from 'react';
import { Upload, File as FileIcon, X, AlertCircle } from 'lucide-react';
import { useProfiles } from '../../hooks/useProfiles';

interface UploadStepProps {
  onAnalyze: (file: File, profile: string) => void;
  isUploading: boolean;
}

export function UploadStep({ onAnalyze, isUploading }: UploadStepProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<string>('healthcare');
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
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Profile Selector */}
      <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant">
        <label className="block text-sm font-semibold text-on-surface mb-2">
          Select PII Detection Profile
        </label>
        <p className="text-sm text-on-surface-variant mb-4">
          Choose the domain that best matches your document. This optimizes the AI for specific sensitive data types.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {profiles.map(p => (
            <label 
              key={p.name}
              className={`
                flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                ${profile === p.name 
                  ? 'bg-primary/10 border-primary text-primary shadow-sm' 
                  : 'bg-surface border-outline-variant text-on-surface hover:border-primary/50'}
              `}
            >
              <input 
                type="radio" 
                name="profile" 
                value={p.name} 
                checked={profile === p.name}
                onChange={(e) => setProfile(e.target.value)}
                className="hidden"
              />
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center
                ${profile === p.name ? 'border-primary' : 'border-outline'}
              `}>
                {profile === p.name && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <span className="font-medium capitalize">{p.display_name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Dropzone */}
      <div 
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-300
          ${dragActive 
            ? 'border-primary bg-primary/5 scale-[1.02]' 
            : file 
              ? 'border-success/50 bg-success/5' 
              : 'border-outline-variant bg-surface hover:bg-surface-container-lowest hover:border-outline'
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
            className="cursor-pointer flex flex-col items-center gap-4"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
              ${dragActive ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'}
            `}>
              <Upload className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xl font-medium text-on-surface mb-1">
                Drag and drop your PDF here
              </p>
              <p className="text-on-surface-variant">
                or <span className="text-primary hover:underline">browse files</span> (max 50MB)
              </p>
            </div>
          </label>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-success/10 text-success flex items-center justify-center">
              <FileIcon className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xl font-medium text-on-surface truncate max-w-sm mx-auto">
                {file.name}
              </p>
              <p className="text-on-surface-variant mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              onClick={() => setFile(null)}
              className="text-sm text-outline hover:text-error transition-colors flex items-center gap-1"
              disabled={isUploading}
            >
              <X className="w-4 h-4" /> Remove file
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-error bg-error/10 p-4 rounded-xl">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Action */}
      <div className="flex justify-center pt-4">
        <button
          onClick={handleSubmit}
          disabled={!file || isUploading}
          className={`
            px-8 py-4 rounded-full text-lg font-semibold flex items-center gap-3 transition-all
            ${!file 
              ? 'bg-surface-container-high text-outline cursor-not-allowed' 
              : isUploading
                ? 'bg-primary/80 text-white cursor-wait'
                : 'bg-primary text-on-primary hover:bg-primary-container shadow-lg hover:shadow-xl hover:-translate-y-0.5'
            }
          `}
        >
          {isUploading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing Document...
            </>
          ) : (
            <>
              Analyze Document
              <span className="text-primary-container-lowest">→</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
