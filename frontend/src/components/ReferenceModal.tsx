import { useState } from 'react';

const REFERENCES = [
  {
    score: 1,
    label: 'None (0%)',
    desc: 'No visible honeydew or sphacelia on the panicle.',
    color: 'bg-green-500',
    image: '/images/ergot/severity-1.svg',
  },
  {
    score: 2,
    label: 'Low (1-10%)',
    desc: 'Few droplets on lower florets. Minor infection.',
    color: 'bg-yellow-400',
    image: '/images/ergot/severity-2.svg',
  },
  {
    score: 3,
    label: 'Moderate (11-25%)',
    desc: 'Multiple droplets spread across panicle.',
    color: 'bg-orange-400',
    image: '/images/ergot/severity-3.svg',
  },
  {
    score: 4,
    label: 'High (26-50%)',
    desc: 'Heavy honeydew, visible mold growth beginning.',
    color: 'bg-orange-600',
    image: '/images/ergot/severity-4.svg',
  },
  {
    score: 5,
    label: 'Severe (>50%)',
    desc: 'Entire panicle affected, sclerotia forming.',
    color: 'bg-red-600',
    image: '/images/ergot/severity-5.svg',
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ReferenceModal({ open, onClose }: Props) {
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set());

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto">
      <div className="bg-white w-full max-w-lg mx-4 my-6 rounded-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-lg font-bold text-neutral">Ergot Severity Reference</h3>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-2xl text-neutral"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Reference cards */}
        <div className="p-4 space-y-4">
          {REFERENCES.map(({ score, label, desc, color, image }) => (
            <div key={score} className="flex gap-3 items-start">
              {!imgErrors.has(score) ? (
                <img
                  src={image}
                  alt={`Ergot severity ${score}: ${label}`}
                  className="w-20 h-20 rounded-lg flex-shrink-0 object-cover"
                  loading="lazy"
                  onError={() => {
                    setImgErrors((prev) => new Set(prev).add(score));
                  }}
                />
              ) : (
                <div
                  className={`${color} w-20 h-20 rounded-lg flex-shrink-0 flex items-center justify-center`}
                >
                  <span className="text-white text-2xl font-bold">{score}</span>
                </div>
              )}
              <div>
                <div className="font-semibold text-neutral">{label}</div>
                <div className="text-sm text-gray-500">{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Close button */}
        <div className="p-4 border-t">
          <button
            onClick={onClose}
            className="w-full py-3 bg-primary text-white rounded-lg font-semibold min-h-[48px]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
