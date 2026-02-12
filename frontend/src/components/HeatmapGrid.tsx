import type { HeatmapData } from '../types';

const SEVERITY_COLORS: Record<number, string> = {
  1: '#4CAF50',
  2: '#8BC34A',
  3: '#FFC107',
  4: '#FF9800',
  5: '#D32F2F',
};

const SEVERITY_LABELS: Record<number, string> = {
  1: 'None (0%)',
  2: 'Low (1-10%)',
  3: 'Mod (11-25%)',
  4: 'High (26-50%)',
  5: 'Sev (>50%)',
};

interface Props {
  data: HeatmapData;
  onCellClick?: (plotPk: number) => void;
}

export default function HeatmapGrid({ data, onCellClick }: Props) {
  // Build a 2D lookup: grid[row][col] = cell
  const grid = new Map<string, (typeof data.cells)[0]>();
  for (const cell of data.cells) {
    grid.set(`${cell.row}-${cell.column}`, cell);
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
                const severity = cell.ergot_severity;
                const bg = severity ? SEVERITY_COLORS[severity] : '#E0E0E0';
                return (
                  <button
                    key={col}
                    onClick={() => onCellClick?.(cell.plot_pk)}
                    title={`${cell.plot_id}\n${cell.genotype}\nSeverity: ${severity ?? 'Unscored'}`}
                    className="aspect-square rounded flex items-center justify-center text-xs font-bold cursor-pointer hover:ring-2 hover:ring-neutral transition-shadow min-w-[32px]"
                    style={{ backgroundColor: bg, color: severity && severity >= 4 ? '#fff' : severity ? '#333' : '#999' }}
                  >
                    {severity ?? '—'}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-3 justify-center">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="flex items-center gap-1 text-xs">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: SEVERITY_COLORS[s] }}
            />
            <span className="text-gray-600">{s} - {SEVERITY_LABELS[s]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 text-xs">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#E0E0E0' }} />
          <span className="text-gray-600">Unscored</span>
        </div>
      </div>
    </div>
  );
}
