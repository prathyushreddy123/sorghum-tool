import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { SeverityDistributionItem } from '../types';

const COLORS: Record<number, string> = {
  1: '#4CAF50',
  2: '#8BC34A',
  3: '#FFC107',
  4: '#FF9800',
  5: '#D32F2F',
};

const LABELS: Record<number, string> = {
  1: 'None',
  2: 'Low',
  3: 'Mod',
  4: 'High',
  5: 'Sev',
};

interface Props {
  data: SeverityDistributionItem[];
}

export default function SeverityHistogram({ data }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    label: LABELS[d.score] || String(d.score),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value: number) => [value, 'Plots']}
          labelFormatter={(label: string) => `Severity: ${label}`}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.score} fill={COLORS[entry.score] || '#999'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
