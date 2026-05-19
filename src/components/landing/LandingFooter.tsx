import React from 'react';

export function LandingFooter() {
  return (
    <footer className="py-12 px-4 border-t border-outline-variant/30 bg-surface-container-lowest text-center">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        {/* Mission statement */}
        <div className="max-w-2xl mx-auto">
          <p className="text-sm text-on-surface-variant leading-relaxed italic">
            "Our mission is to let everyone leverage the power of frontier AI without sacrificing privacy. 
            Your data stays yours — always."
          </p>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-4 border-t border-outline-variant/20">
          <div className="flex items-center gap-2">
            <img src="/favicon.png" alt="Logo" className="w-6 h-6" />
            <span className="font-bold text-on-surface">RedactGuard</span>
            <span className="text-xs text-outline ml-2">Privacy-first document anonymization</span>
          </div>
          
          <div className="text-xs text-outline">
            © {new Date().getFullYear()} RedactGuard. 100% local processing — no cloud, no tracking, no data collection.
          </div>
        </div>
      </div>
    </footer>
  );
}
