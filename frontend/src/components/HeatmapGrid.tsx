import { memo } from 'react';
import type { HeatmapData, HeatmapCell, Trait } from '../types';

// For numeric traits: green → yellow → red gradient
function numericColor(value: number, min: number, max: number): string {
  if (max === min) return '#FFC107';
  const t = (value - min) / (max - min); // 0 = low, 1 = high
  // Green (#4CAF50) → Yellow (#FFC107) → Red (#D32F2F)
  if (t <= 0.5) {
    const r = Math.round(76 + (255 - 76) * (t * 2));
    const g = Math.round(175 + (193 - 175) * (t * 2));
    const b = Math.round(80 + (7 - 80) * (t * 2));
    return `rgb(${r},${g},${b})`;
  } else {
    const t2 = (t - 0.5) * 2;
    const r = Math.round(255 + (211 - 255) * t2);
    const g = Math.round(193 + (47 - 193) * t2);
    const b = Math.round(7 + (47 - 7) * t2);
    return `rgb(${r},${g},${b})`;
  }
}

// Fixed colors for categorical values 1-9 (ergot-style)
const CATEGORICAL_COLORS: Record<string, string> = {
  '1': '#4CAF50',
  '2': '#8BC34A',
  '3': '#FFC107',
  '4': '#FF9800',
  '5': '#D32F2F',
  '6': '#9C27B0',
  '7': '#2196F3',
  '8': '#00BCD4',
  '9': '#FF5722',
};

const STATUS_BORDER: Record<string, string> = {
  flagged: 'ring-2 ring-red-500',
  skipped: 'opacity-40',
  border: 'ring-2 ring-dashed ring-gray-400',
  active: '',
};

function getCellBg(cell: HeatmapCell, trait: Trait | null, allNumericValues: number[]): string {
  if (!cell.value) return '#E0E0E0';

  if (trait?.data_type === 'categorical') {
    return CATEGORICAL_COLORS[cell.value] || '#90CAF9';
  }

  if (cell.numeric_value !== null) {
    const min = allNumericValues.length > 0 ? Math.min(...allNumericValues) : 0;
    const max = allNumericValues.length > 0 ? Math.max(...allNumericValues) : 1;
    return numericColor(cell.numeric_value, min, max);
  }

  return '#90CAF9'; // text-only fallback
}

interface Props {
  data: HeatmapData;
  onCellClick?: (plotPk: number) => void;
}

function HeatmapGrid({ data, onCellClick }: Props) {
  const grid = new Map<string, HeatmapCell>();
  for (const cell of data.cells) {
    grid.set(`${cell.row}-${cell.column}`, cell);
  }

  // Pre-compute min/max for numeric gradient
  const numericValues = data.cells
    .map((c) => c.numeric_value)
    .filter((v): v is number => v !== null);

  const isNumeric = data.trait?.data_type === 'integer' || data.trait?.data_type === 'float';
  const isCategorical = data.trait?.data_type === 'categorical';

  // Build legend entries
  const legendEntries: { color: string; label: string }[] = [];
  if (isCategorical && data.trait) {
    const cats: string[] = data.trait.categories ? JSON.parse(data.trait.categories) : [];
    const labels: string[] = data.trait.category_labels ? JSON.parse(data.trait.category_labels) : [];
    cats.forEach((cat, i) => {
      legendEntries.push({
        color: CATEGORICAL_COLORS[cat] || '#90CAF9',
        label: labels[i] ? `${cat} – ${labels[i]}` : cat,
      });
    });
  }

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        {/* Column headers */}
        <div
          className="grid gap-1 mb-1"
          style={{ gridTemplateColumns: `2rem repeat(${data.columns}, minmax(2.5rem, 1fr))` }}
        >
          <div />
          {Array.from({ length: data.columns }, (_, i) => (
            <div key={i} className="text-center text-xs text-gray-500 font-medium">
              C{i + 1}
            </div>
          ))}
        </div>

        {/* Rows */}
        {Array.from({ length: data.rows }, (_, rowIdx) => {
          const row = rowIdx + 1;
          return (
            <div
              key={row}
              className="grid gap-1 mb-1"
              style={{ gridTemplateColumns: `2rem repeat(${data.columns}, minmax(2.5rem, 1fr))` }}
            >
              <div className="text-xs text-gray-500 font-medium flex items-center justify-center">
                R{row}
              </div>
              {Array.from({ length: data.columns }, (_, colIdx) => {
                const col = colIdx + 1;
                const cell = grid.get(`${row}-${col}`);
                if (!cell) {
                  return <div key={col} className="aspect-square rounded" />;
                }
                const bg = getCellBg(cell, data.trait, numericValues);
                const statusCls = STATUS_BORDER[cell.plot_status] || '';
                const hasValue = cell.value !== null;
                const textColor = hasValue && (cell.numeric_value ?? 0) > (numericValues.length > 0 ? (Math.max(...numericValues) * 0.6) : 3) ? '#fff' : '#333';

                return (
                  <button
                    key={col}
                    onClick={() => onCellClick?.(cell.plot_pk)}
                    title={`${cell.plot_id}\n${cell.genotype}\n${data.trait?.label ?? 'Value'}: ${cell.value ?? 'Unscored'}\nStatus: ${cell.plot_status}`}
                    className={`aspect-square rounded flex items-center justify-center text-xs font-bold cursor-pointer hover:ring-2 hover:ring-neutral transition-shadow min-w-[32px] ${statusCls}`}
                    style={{ backgroundColor: bg, color: hasValue ? textColor : '#999' }}
                  >
                    {cell.plot_status === 'skipped' ? '—' : (cell.value ?? '·')}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {isCategorical && legendEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 justify-center">
          {legendEntries.map((e) => (
            <div key={e.label} className="flex items-center gap-1 text-xs">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: e.color }} />
              <span className="text-gray-600">{e.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 text-xs">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#E0E0E0' }} />
            <span className="text-gray-600">Unscored</span>
          </div>
        </div>
      )}

      {isNumeric && numericValues.length > 1 && (
        <div className="flex items-center gap-2 mt-3 justify-center text-xs text-gray-600">
          <span>{Math.min(...numericValues).toFixed(1)}</span>
          <div className="h-3 w-32 rounded" style={{
            background: 'linear-gradient(to right, #4CAF50, #FFC107, #D32F2F)'
          }} />
          <span>{Math.max(...numericValues).toFixed(1)}</span>
          <span className="text-gray-400">{data.trait?.unit ?? ''}</span>
        </div>
      )}

      {/* Status legend */}
      <div className="flex flex-wrap gap-3 mt-2 justify-center text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded ring-2 ring-red-500" style={{ backgroundColor: '#fee2e2' }} />
          <span>Flagged</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded opacity-40 bg-gray-300" />
          <span>Skipped</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded ring-2 ring-dashed ring-gray-400" style={{ backgroundColor: '#f3f4f6' }} />
          <span>Border</span>
        </div>
      </div>
    </div>
  );
}

export default memo(HeatmapGrid);
