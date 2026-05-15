import React, { useState } from 'react';
import { Shield, Settings, Sun, Moon } from 'lucide-react';
import { SettingsModal } from '../settings/SettingsModal';
import { useTheme } from '../../hooks/useTheme';

interface NavbarProps {
  onReset: () => void;
}

export function Navbar({ onReset }: NavbarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <header className="bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-40 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={onReset}
            >
              <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center group-hover:bg-primary/10 transition-all duration-300 overflow-hidden p-1.5">
                <img 
                  src={theme === 'light' ? '/favicon.png' : '/favicon-dark.png'} 
                  alt="RedactGuard Logo" 
                  className="w-full h-full object-contain" 
                />
              </div>
              <div>
                <h1 className="text-xl font-bold text-on-surface tracking-tight leading-none transition-colors duration-300">
                  RedactGuard
                </h1>
                <p className="text-sm text-on-surface-variant font-medium mt-0.5 transition-colors duration-300">
                  Local-first document anonymization.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleTheme}
                className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-all duration-300"
                title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              >
                {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </button>
              
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-all duration-300"
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
