import React from 'react';
import { ShieldCheck, Lock, Zap } from 'lucide-react';

export function LandingHero() {
  return (
    <div className="text-center py-12 px-4">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-wider uppercase mb-6 animate-fade-in">
        <ShieldCheck className="w-4 h-4" />
        Local-First Privacy
      </div>
      
      <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-on-surface tracking-tight leading-tight mb-6">
        Anonymize Documents <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-container">
          Without Leaving Your Machine
        </span>
      </h1>
      
      <p className="text-lg md:text-xl text-on-surface-variant max-w-2xl mx-auto mb-10 leading-relaxed">
        RedactGuard uses state-of-the-art local AI to identify and redact sensitive information (PII) from your PDFs. 
        Zero data ever leaves your browser or backend.
      </p>

      <div className="flex flex-wrap justify-center gap-8 text-sm font-medium text-on-surface-variant/80">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" />
          <span>GDPR Compliant</span>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span>Real-time AI Inference</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>Enterprise Grade Security</span>
        </div>
      </div>
    </div>
  );
}
