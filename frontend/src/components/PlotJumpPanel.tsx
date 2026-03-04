import { useState, useRef, useEffect } from 'react';
import type { Plot } from '../types';

interface PlotJumpPanelProps {
  plots: Plot[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  scoredPlotIds?: Set<number>;
}

export default function PlotJumpPanel({ plots, currentIndex, onSelect, onClose, scoredPlotIds }: PlotJumpPanelProps) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = search.trim()
    ? plots.filter((p, _i) => {
        const q = search.toLowerCase();
        return p.plot_id.toLowerCase().includes(q) || p.genotype.toLowerCase().includes(q);
      })
    : plots;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[60vh] flex flex-col animate-slide-up">
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-neutral">Jump to Plot</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by plot ID or genotype..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 pb-4">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-4">No plots found</p>
          ) : (
            <div className="space-y-1">
              {filtered.map((plot) => {
                const idx = plots.indexOf(plot);
                const isCurrent = idx === currentIndex;
                const isScored = scoredPlotIds?.has(plot.id);
                return (
                  <button
                    key={plot.id}
                    onClick={() => { onSelect(idx); onClose(); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                      isCurrent ? 'bg-green-50 border border-green-300' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xs text-gray-400 w-8">{idx + 1}</span>
                    <span className="font-medium text-neutral flex-1 truncate">{plot.plot_id}</span>
                    <span className="text-xs text-gray-500 truncate max-w-[100px]">{plot.genotype}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      isScored ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {isScored ? 'Scored' : 'Unscored'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
