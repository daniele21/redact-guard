import React from 'react';

export default function Footer() {
  return (
    <footer className="w-full py-4 px-6 flex justify-between items-center bg-surface-container-low border-t border-outline-variant z-50">
      <p className="text-xs text-on-surface-variant">© 2024 RedactGuard Security Suite. All data processed locally.</p>
      <div className="flex gap-4">
        <a href="#" className="text-xs text-on-surface-variant hover:underline">Privacy Policy</a>
        <a href="#" className="text-xs text-on-surface-variant hover:underline">Terms of Service</a>
      </div>
    </footer>
  );
}
