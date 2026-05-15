import React, { useState } from 'react';
import { Shield, Settings } from 'lucide-react';
import { SettingsModal } from '../settings/SettingsModal';

interface NavbarProps {
  onReset: () => void;
}

export function Navbar({ onReset }: NavbarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <header className="bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={onReset}
            >
              <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-on-surface tracking-tight leading-none">
                  RedactGuard
                </h1>
                <p className="text-sm text-on-surface-variant font-medium mt-0.5">
                  Local-first document anonymization.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-colors"
                title="Settings & PII Profiles"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </>
  );
}
