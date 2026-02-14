import { useEffect } from 'react';

interface Props {
  message: string;
  onUndo?: () => void;
  onDismiss: () => void;
  duration?: number;
}

export default function Snackbar({ message, onUndo, onDismiss, duration = 4000 }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div className="fixed left-4 right-4 z-50 bottom-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 bg-neutral text-white px-4 py-3 rounded-lg shadow-lg text-sm">
        <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="flex-1 min-w-0 truncate">{message}</span>
        {onUndo && (
          <button
            onClick={onUndo}
            className="flex-shrink-0 px-3 py-1 text-sm font-bold text-yellow-300 uppercase tracking-wide hover:text-yellow-200"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
