import React from 'react';

export function LandingFooter() {
  return (
    <footer className="py-12 px-4 border-t border-outline-variant/30 bg-surface-container-lowest text-center">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <img src="/favicon.png" alt="Logo" className="w-6 h-6" />
          <span className="font-bold text-on-surface">RedactGuard</span>
        </div>
        
        <div className="text-sm text-on-surface-variant flex gap-8">
          <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-primary transition-colors">Documentation</a>
          <a href="#" className="hover:text-primary transition-colors">Enterprise</a>
        </div>
        
        <div className="text-xs text-outline">
          © {new Date().getFullYear()} RedactGuard. Local-first & Secure.
        </div>
      </div>
    </footer>
  );
}
