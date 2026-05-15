import React from 'react';
import { AppStep } from '../../hooks/useDocument';
import { Check, Upload, Search, Download } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: AppStep;
}

const STEPS = [
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'review', label: 'Review', icon: Search },
  { id: 'export', label: 'Export', icon: Download },
] as const;

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep);

  return (
    <div className="py-8 bg-surface">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between relative">
          {/* Connecting line */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-surface-container-high rounded-full -z-10" />
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full -z-10 transition-all duration-500 ease-in-out"
            style={{ width: `${(currentIndex / (STEPS.length - 1)) * 100}%` }}
          />

          {STEPS.map((step, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const Icon = step.icon;

            return (
              <div key={step.id} className="flex flex-col items-center gap-3">
                <div 
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center border-4 transition-all duration-300
                    ${isCompleted ? 'bg-primary border-primary text-white' : 
                      isCurrent ? 'bg-surface border-primary text-primary shadow-sm' : 
                      'bg-surface border-surface-container-high text-outline-variant'}
                  `}
                >
                  {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <span 
                  className={`text-sm font-medium transition-colors ${
                    isCurrent ? 'text-primary' :
                    isCompleted ? 'text-on-surface' :
                    'text-outline'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
