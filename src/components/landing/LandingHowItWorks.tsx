import React from 'react';
import { FileUp, Eye, Download, Sparkles } from 'lucide-react';

export function LandingHowItWorks() {
  const steps = [
    {
      icon: <FileUp className="w-6 h-6" />,
      title: "Upload Your Document",
      description: "Drop your PDF and choose a detection profile (Healthcare, Financial, Legal, etc.). Everything stays on your device."
    },
    {
      icon: <Eye className="w-6 h-6" />,
      title: "Review & Confirm",
      description: "A local AI identifies names, IDs, addresses, and other sensitive fields. You decide what to redact — full control, no surprises."
    },
    {
      icon: <Download className="w-6 h-6" />,
      title: "Export Anonymized PDF",
      description: "Download the redacted document. Sensitive data is permanently removed from the exported file."
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: "Use with Any LLM",
      description: "Now safely upload the anonymized document to ChatGPT, Claude, Gemini, or any AI service — zero privacy risk."
    }
  ];

  return (
    <section className="py-16 px-4 border-y border-outline-variant/30 bg-surface-container-low/30">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-on-surface text-center mb-3">
          How It Works
        </h2>
        <p className="text-center text-on-surface-variant max-w-xl mx-auto mb-12">
          Four simple steps from sensitive document to safe AI interaction.
        </p>
        
        <div className="grid md:grid-cols-4 gap-6">
          {steps.map((step, index) => (
            <div key={index} className="relative flex flex-col items-center text-center group">
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-1/2 w-full h-[2px] bg-outline-variant/30 -z-10" />
              )}
              
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform duration-300 ${
                index === 3 
                  ? 'bg-success/10 text-success' 
                  : 'bg-surface-container-high text-primary'
              }`}>
                {step.icon}
              </div>
              
              <h3 className="text-lg font-bold text-on-surface mb-2">
                {index + 1}. {step.title}
              </h3>
              
              <p className="text-sm text-on-surface-variant leading-relaxed px-2">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
