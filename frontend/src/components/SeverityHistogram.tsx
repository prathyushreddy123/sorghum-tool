import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { DistributionItem } from '../types';

// Color palette for categorical distribution bars
const BAR_COLORS = ['#4CAF50', '#8BC34A', '#FFC107', '#FF9800', '#D32F2F', '#9C27B0', '#2196F3', '#00BCD4', '#FF5722'];

interface Props {
  data: DistributionItem[];
  title?: string;
}

export default function SeverityHistogram({ data, title }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    displayLabel: d.label || d.value,
  }));

  return (
    <>
      {title && <p className="text-xs text-gray-500 mb-1">{title}</p>}
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <XAxis dataKey="displayLabel" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value) => [value, 'Plots']}
            labelFormatter={(label) => `${label}`}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, idx) => (
              <Cell key={entry.value} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
