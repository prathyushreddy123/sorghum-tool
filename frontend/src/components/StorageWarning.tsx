import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function StorageWarning() {
  const { storagePercent, pendingImageCount, pendingImageBytes, manualSync, syncing, online } = useOnlineStatus();

  if (storagePercent < 80 || pendingImageCount === 0) return null;

  const mbUsed = (pendingImageBytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center justify-between gap-2 text-sm">
      <span className="text-orange-700">
        {pendingImageCount} pending image{pendingImageCount !== 1 ? 's' : ''} ({mbUsed} MB).
        {online ? ' Connect to sync now.' : ' Go online to sync.'}
      </span>
      {online && (
        <button
          onClick={() => manualSync()}
          disabled={syncing}
          className="px-3 py-1 bg-orange-600 text-white rounded text-xs font-medium disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      )}
    </div>
  );
}
