import React from 'react';
import { Upload, Search, History, CloudOff } from 'lucide-react';

export default function UploadScreen({ onUpload }: { onUpload: () => void }) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleUpload = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onUpload();
    }, 1500);
  };

  return (
    <div className="flex-grow flex flex-col items-center justify-center p-8">
      <div className="max-w-[800px] w-full flex flex-col gap-12 py-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-on-surface">Secure Document Anonymization</h1>
          <p className="text-on-surface-variant max-w-[600px] mx-auto">
            Professional-grade PII detection and redaction. All processing happens locally in your browser for maximum security.
          </p>
        </div>

        <div className="relative group">
          <div className="absolute -inset-4 bg-primary/5 rounded-[32px] blur-xl group-hover:bg-primary/10 transition-colors duration-500"></div>
          <div 
            className="relative bg-surface border-2 border-dashed border-outline-variant rounded-[24px] p-12 flex flex-col items-center justify-center min-h-[400px] transition-all hover:border-primary cursor-pointer shadow-sm"
            onClick={handleUpload}
          >
            <div className="bg-primary-container/10 w-20 h-20 rounded-full flex items-center justify-center mb-6">
              <Upload className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-on-surface mb-2">{isLoading ? 'Processing...' : 'Upload Document'}</h2>
            <p className="text-on-surface-variant mb-8">{isLoading ? 'Your document is being analyzed...' : 'Drag and drop your PDF here, or click to browse'}</p>
            <div className="flex flex-col items-center gap-4">
              <button 
                className="bg-primary text-on-primary px-8 py-3 rounded-lg font-bold flex items-center gap-2 transition-all shadow-md hover:bg-primary/90"
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : 'Select PDF File'}
              </button>
              <span className="text-xs font-semibold text-outline uppercase tracking-widest">Support for .pdf files</span>
            </div>
            <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-surface-container-high px-4 py-2 rounded-full border border-outline-variant">
              <span className="text-xs font-semibold text-on-surface-variant">End-to-end Local Encryption</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard icon={Search} title="Auto-Detection" description="AI-powered identification of names, dates, and sensitive IDs." />
          <FeatureCard icon={History} title="Audit Logs" description="Full traceability of every redaction made for compliance." />
          <FeatureCard icon={CloudOff} title="Offline First" description="Your documents never leave your computer. Privacy by design." />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="p-6 bg-surface-container-low rounded-xl border border-outline-variant/30 flex flex-col gap-2">
      <Icon className="w-5 h-5 text-primary" />
      <h3 className="text-sm font-bold text-on-surface">{title}</h3>
      <p className="text-xs text-on-surface-variant leading-relaxed">{description}</p>
    </div>
  );
}
