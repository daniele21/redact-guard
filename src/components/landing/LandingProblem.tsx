import React from 'react';
import { AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';

export function LandingProblem() {
  return (
    <section className="py-16 px-4 bg-surface-container-lowest/50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-on-surface text-center mb-4">
          The Problem
        </h2>
        <p className="text-center text-on-surface-variant max-w-2xl mx-auto mb-12 leading-relaxed">
          You want to leverage frontier AI models like ChatGPT, Claude, or Gemini to analyze contracts, 
          medical records, or financial documents — but <strong className="text-on-surface">you can't share sensitive data</strong> with 
          cloud services.
        </p>

        <div className="grid md:grid-cols-3 gap-6 items-center">
          {/* Problem */}
          <div className="bg-error/5 border border-error/20 rounded-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-error/10 text-error flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-on-surface mb-2">Without RedactGuard</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Uploading documents to AI chatbots means sharing names, IDs, addresses, and confidential data 
              with third-party servers. Privacy breach risk is real.
            </p>
          </div>

          {/* Arrow */}
          <div className="hidden md:flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <ArrowRight className="w-8 h-8 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">RedactGuard</span>
            </div>
          </div>

          {/* Solution */}
          <div className="bg-success/5 border border-success/20 rounded-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-success/10 text-success flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-on-surface mb-2">With RedactGuard</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Anonymize locally first, then safely share with any AI. Sensitive data never leaves your device. 
              Get the insights you need — without the risk.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
