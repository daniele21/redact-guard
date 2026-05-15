import React from 'react';
import { FileUp, Eye, Download } from 'lucide-react';

export function LandingHowItWorks() {
  const steps = [
    {
      icon: <FileUp className="w-6 h-6" />,
      title: "Upload & Select Profile",
      description: "Drop your PDF and choose a detection profile (Healthcare, Financial, etc.) to optimize the AI."
    },
    {
      icon: <Eye className="w-6 h-6" />,
      title: "Review Detections",
      description: "Our local LLM identifies sensitive fields. You have full control to keep or redact each finding."
    },
    {
      icon: <Download className="w-6 h-6" />,
      title: "Secure Export",
      description: "Download the fully redacted PDF. Your original data never touched a remote server."
    }
  ];

  return (
    <section className="py-16 px-4 border-y border-outline-variant/30 bg-surface-container-low/30">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-on-surface text-center mb-12">
          How RedactGuard Works
        </h2>
        
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="relative flex flex-col items-center text-center group">
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-1/2 w-full h-[2px] bg-outline-variant/30 -z-10" />
              )}
              
              <div className="w-20 h-20 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary mb-6 shadow-sm group-hover:scale-110 transition-transform duration-300">
                {step.icon}
              </div>
              
              <h3 className="text-lg font-bold text-on-surface mb-2">
                {index + 1}. {step.title}
              </h3>
              
              <p className="text-sm text-on-surface-variant leading-relaxed px-4">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
