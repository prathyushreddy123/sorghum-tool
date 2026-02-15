import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { HeatmapCell } from '../types';

const SEVERITY_COLORS: Record<number, string> = {
  1: '#4CAF50',
  2: '#8BC34A',
  3: '#FFC107',
  4: '#FF9800',
  5: '#D32F2F',
};

const UNSCORED_COLOR = '#E0E0E0';

interface Props {
  trialId: number;
  rows: number;
  columns: number;
  cells: HeatmapCell[];
}

export default function MiniFieldPlan({ trialId, rows, columns, cells }: Props) {
  const navigate = useNavigate();
  const [popup, setPopup] = useState<HeatmapCell | null>(null);

  const totalPlots = cells.length;

  // Build grid lookup: grid[row][col] = cell
  const grid: (HeatmapCell | null)[][] = [];
  for (let r = 1; r <= rows; r++) {
    const row: (HeatmapCell | null)[] = [];
    for (let c = 1; c <= columns; c++) {
      row.push(cells.find((cell) => cell.row === r && cell.column === c) || null);
    }
    grid.push(row);
  }

  function getCellColor(cell: HeatmapCell | null): string {
    if (!cell || cell.ergot_severity === null) return UNSCORED_COLOR;
    return SEVERITY_COLORS[cell.ergot_severity] || UNSCORED_COLOR;
  }

  function handleCellClick(cell: HeatmapCell | null) {
    if (!cell) return;
    if (totalPlots > 100) {
      setPopup(popup?.plot_pk === cell.plot_pk ? null : cell);
    } else {
      navigate(`/trials/${trialId}/collect/${cell.plot_pk}`);
    }
  }

  // Determine display mode
  const mode: 'full' | 'abbrev' | 'dot' = totalPlots < 30 ? 'full' : totalPlots <= 100 ? 'abbrev' : 'dot';

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="border-collapse mx-auto" style={{ minWidth: 'fit-content' }}>
          <tbody>
            {grid.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => {
                  const bg = getCellColor(cell);
                  const scored = cell && cell.ergot_severity !== null;
                  const useLightText = scored && cell.ergot_severity! >= 4;

                  if (mode === 'dot') {
                    return (
                      <td key={ci} className="p-0.5">
                        <button
                          onClick={() => handleCellClick(cell)}
                          className="w-4 h-4 rounded-full border border-gray-300 hover:scale-125 transition-transform"
                          style={{ backgroundColor: bg }}
                          title={cell?.plot_id || ''}
                        />
                      </td>
                    );
                  }

                  return (
                    <td key={ci} className="p-0.5">
                      <button
                        onClick={() => handleCellClick(cell)}
                        className={`rounded text-center font-medium border border-gray-200 transition-all hover:scale-105 hover:shadow-md ${
                          mode === 'full'
                            ? 'w-14 h-10 text-[10px]'
                            : 'w-10 h-8 text-[9px]'
                        }`}
                        style={{
                          backgroundColor: bg,
                          color: !cell ? '#999' : useLightText ? '#fff' : '#333',
                        }}
                      >
                        {cell
                          ? mode === 'full'
                            ? cell.plot_id
                            : cell.plot_id.replace(/^[A-Za-z]*0*/, '').slice(0, 3) || cell.plot_id.slice(-3)
                          : ''}
                      </button>
                    </td>
                  );
                })}
                <td className="pl-1 text-[10px] text-gray-400 align-middle">R{ri + 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Popup for large trials (100+ plots) */}
      {popup && mode === 'dot' && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-10 min-w-[200px]">
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-sm text-neutral">{popup.plot_id}</span>
            <button onClick={() => setPopup(null)} className="text-gray-400 text-xs p-1">✕</button>
          </div>
          <p className="text-xs text-gray-500">{popup.genotype}</p>
          <p className="text-xs text-gray-500 mb-2">
            Severity: {popup.ergot_severity !== null ? popup.ergot_severity : 'Not scored'}
          </p>
          <button
            onClick={() => navigate(`/trials/${trialId}/collect/${popup.plot_pk}`)}
            className="w-full py-2 text-sm font-medium text-primary bg-green-50 rounded-lg border border-primary"
          >
            Go to Plot →
          </button>
        </div>
      )}
    </div>
  );
}
