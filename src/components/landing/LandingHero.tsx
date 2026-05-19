import React from 'react';
import { ShieldCheck, Lock, Zap, Brain } from 'lucide-react';

export function LandingHero() {
  return (
    <div className="text-center py-12 px-4">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-wider uppercase mb-6 animate-fade-in">
        <ShieldCheck className="w-4 h-4" />
        Privacy-First AI Tool
      </div>
      
      <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-on-surface tracking-tight leading-tight mb-6">
        Use ChatGPT & Claude <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-container">
          Without Exposing Sensitive Data
        </span>
      </h1>
      
      <p className="text-lg md:text-xl text-on-surface-variant max-w-2xl mx-auto mb-10 leading-relaxed">
        RedactGuard anonymizes your documents <strong className="text-on-surface">locally on your device</strong> before 
        you share them with frontier AI models. Get the full power of LLMs — without the privacy risk.
      </p>

      <div className="flex flex-wrap justify-center gap-8 text-sm font-medium text-on-surface-variant/80">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" />
          <span>100% Local Processing</span>
        </div>
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span>AI-Powered Detection</span>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span>Then Use Any LLM Safely</span>
        </div>
      </div>
    </div>
  );
}
