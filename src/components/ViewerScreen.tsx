import React, { useState } from 'react';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, EyeOff, Eye, ArrowRight, ShieldCheck, User, MapPin, CreditCard, FileText } from 'lucide-react';

export default function ViewerScreen() {
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [entities, setEntities] = useState([
    { id: 1, name: 'Johnathan Doe', type: 'Name', icon: User, visible: true },
    { id: 2, name: 'j.doe@enterprise...', type: 'Email', icon: FileText, visible: true },
    { id: 3, name: 'Oct 24, 2024', type: 'Date', icon: MapPin, visible: true },
  ]);

  const toggleVisibility = (id: number) => {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, visible: !e.visible } : e));
  };

  return (
    <div className="flex h-full">
      {/* PDF Viewport */}
      <div className="flex-grow bg-surface-container-low flex flex-col items-center justify-start p-8 overflow-y-auto relative">
        {/* Floating Toolbar */}
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-surface/80 backdrop-blur-md px-4 py-2 rounded-full shadow-sm flex items-center gap-4 border border-outline-variant">
          <button type="button" className="p-1 rounded-full hover:bg-surface-container-highest" onClick={() => setZoom(Math.max(50, zoom - 10))}><ZoomOut className="w-5 h-5 text-on-surface-variant" /></button>
          <span className="w-12 text-center text-label-md text-on-surface-variant">{zoom}%</span>
          <button type="button" className="p-1 rounded-full hover:bg-surface-container-highest" onClick={() => setZoom(Math.min(200, zoom + 10))}><ZoomIn className="w-5 h-5 text-on-surface-variant" /></button>
          <div className="w-px h-4 bg-outline-variant" />
          <button type="button" className="p-1 rounded-full hover:bg-surface-container-highest" onClick={() => setPage(Math.max(1, page - 1))}><ChevronLeft className="w-5 h-5 text-on-surface-variant" /></button>
          <span className="w-32 text-center text-label-md text-on-surface-variant">Page {page} of 12</span>
          <button type="button" className="p-1 rounded-full hover:bg-surface-container-highest" onClick={() => setPage(Math.min(12, page + 1))}><ChevronRight className="w-5 h-5 text-on-surface-variant" /></button>
        </div>

        {/* Simulated PDF */}
        <div className="w-full max-w-[800px] mt-16 bg-white shadow-lg rounded-sm aspect-[1/1.414] p-16 text-[#1a1a1a]">
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-on-surface">Confidential Agreement</h1>
            <p>This Agreement is entered into... {' '}
              <span className={`${!entities[0].visible ? 'redaction-block' : 'bg-secondary-container/30'}`}>
                {!entities[0].visible ? '****' : entities[0].name}
              </span>
            </p>
            <p className="text-tertiary-container/50">
              <span className={`${!entities[2].visible ? 'redaction-block' : 'bg-secondary-container/30'}`}>
                {!entities[2].visible ? '****' : entities[2].name}
              </span>
            </p>
          </div>
        </div>
      </div>
      
      {/* Sidebar */}
      <aside className="w-[320px] bg-surface border-l border-outline-variant p-6 flex flex-col shadow-sm flex-shrink-0 z-30">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1 text-primary">
            <ShieldCheck className="w-5 h-5" />
            <h2 className="text-lg font-bold">Document Analysis</h2>
          </div>
          <p className="text-sm text-on-surface-variant">Precision Redaction Review</p>
        </div>

        <div className="space-y-4 mb-8">
          <h3 className="text-xs font-bold text-outline uppercase tracking-wider">Review Summary</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant">
              <p className="text-xs text-on-surface-variant">PII Found</p>
              <p className="text-xl font-bold text-primary">12</p>
            </div>
            <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant">
              <p className="text-xs text-on-surface-variant">Confidences</p>
              <p className="text-xl font-bold text-tertiary">98%</p>
            </div>
          </div>
        </div>

        <div className="flex-grow">
          <h3 className="text-xs font-bold text-outline uppercase tracking-wider mb-4">Sensitive Entities</h3>
          <div className="space-y-2">
            {entities.map(entity => (
              <div key={entity.id} className="p-3 bg-surface-container-high rounded-lg flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                   <entity.icon className="w-4 h-4 text-outline" />
                   <span className={!entity.visible ? 'line-through text-gray-400' : 'text-on-surface'}>{entity.name}</span>
                </div>
                <button type="button" className="p-1.5 rounded-full hover:bg-surface-container-highest" onClick={() => toggleVisibility(entity.id)}>
                  {entity.visible ? <EyeOff className="w-4 h-4 text-outline" /> : <Eye className="w-4 h-4 text-outline" />}
                </button>
              </div>
            ))}
          </div>
        </div>
        
        <div className="pt-6 border-t border-outline-variant mt-auto">
          <button type="button" className="w-full bg-primary text-on-primary py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors mb-4">
            <span>Finalize Document</span>
          </button>
          <button type="button" className="w-full border border-outline text-on-surface-variant py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-surface-container-high transition-colors">
            <span>Export Anonymized PDF</span>
          </button>
        </div>
      </aside>
    </div>
  );
};
