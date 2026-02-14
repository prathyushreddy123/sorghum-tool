const SEVERITY_COLORS: Record<number, string> = {
  1: '#4CAF50',
  2: '#8BC34A',
  3: '#FFC107',
  4: '#FF9800',
  5: '#D32F2F',
};

const LEVELS = [
  { score: 1, label: 'None', pct: '0%' },
  { score: 2, label: 'Low', pct: '1-10%' },
  { score: 3, label: 'Mod', pct: '11-25%' },
  { score: 4, label: 'High', pct: '26-50%' },
  { score: 5, label: 'Sev', pct: '>50%' },
];

interface Props {
  value: number | null;
  onChange: (score: number) => void;
}

export default function SeveritySelector({ value, onChange }: Props) {
  return (
    <div className="flex justify-between gap-2">
      {LEVELS.map(({ score, label, pct }) => {
        const selected = value === score;
        const color = SEVERITY_COLORS[score];
        const useLightText = score >= 4;
        return (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={`
              flex-1 py-3 rounded-lg border-2 min-h-[60px] flex flex-col items-center justify-center transition-colors
              ${!selected ? 'bg-white text-neutral' : ''}
            `}
            style={
              selected
                ? { backgroundColor: color, borderColor: color, color: useLightText ? '#fff' : '#333' }
                : { borderColor: color + '80' }
            }
          >
            <span className="text-2xl font-bold leading-tight">{score}</span>
            <span className="text-xs leading-tight">{label}</span>
            <span className="text-[10px] leading-tight opacity-70">{pct}</span>
          </button>
        );
      })}
    </div>
  );
}
