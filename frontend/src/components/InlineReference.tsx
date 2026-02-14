import { useState } from 'react';

const REFERENCES: Record<number, { label: string; desc: string; image: string; color: string }> = {
  1: { label: 'None (0%)', desc: 'No visible honeydew or sphacelia on the panicle.', image: '/images/ergot/severity-1.svg', color: '#4CAF50' },
  2: { label: 'Low (1-10%)', desc: 'Few droplets on lower florets. Minor infection.', image: '/images/ergot/severity-2.svg', color: '#8BC34A' },
  3: { label: 'Moderate (11-25%)', desc: 'Multiple droplets spread across panicle.', image: '/images/ergot/severity-3.svg', color: '#FFC107' },
  4: { label: 'High (26-50%)', desc: 'Heavy honeydew, visible mold growth beginning.', image: '/images/ergot/severity-4.svg', color: '#FF9800' },
  5: { label: 'Severe (>50%)', desc: 'Entire panicle affected, sclerotia forming.', image: '/images/ergot/severity-5.svg', color: '#D32F2F' },
};

interface Props {
  severity: number | null;
}

export default function InlineReference({ severity }: Props) {
  const [imgError, setImgError] = useState(false);

  if (severity === null) {
    return (
      <div className="flex items-center justify-center h-20 bg-gray-50 rounded-lg border border-gray-200">
        <span className="text-sm text-gray-400">Select a severity to see reference</span>
      </div>
    );
  }

  const ref = REFERENCES[severity];
  if (!ref) return null;

  return (
    <div className="flex gap-3 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
      {!imgError ? (
        <img
          src={ref.image}
          alt={`Severity ${severity}: ${ref.label}`}
          className="w-20 h-20 rounded-lg flex-shrink-0 object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="w-20 h-20 rounded-lg flex-shrink-0 flex items-center justify-center"
          style={{ backgroundColor: ref.color }}
        >
          <span className="text-white text-2xl font-bold">{severity}</span>
        </div>
      )}
      <div className="min-w-0">
        <div className="font-semibold text-neutral text-sm">{ref.label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{ref.desc}</div>
      </div>
    </div>
  );
}
