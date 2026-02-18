import { useSyncExternalStore, useCallback, useEffect, useState } from 'react';
import { getPendingCount, syncPending } from '../db/offlineApi';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

export function useOnlineStatus() {
  const online = useSyncExternalStore(subscribe, getSnapshot, () => true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = useCallback(async () => {
    setPendingCount(await getPendingCount());
  }, []);

  useEffect(() => {
    refreshPending();
    const interval = setInterval(refreshPending, 5000);
    return () => clearInterval(interval);
  }, [refreshPending]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (!online || pendingCount === 0) return;
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        await syncPending();
        if (!cancelled) await refreshPending();
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [online, pendingCount, refreshPending]);

  const manualSync = useCallback(async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try {
      const result = await syncPending();
      await refreshPending();
      return result;
    } finally {
      setSyncing(false);
    }
  }, [online, syncing, refreshPending]);

  return { online, pendingCount, syncing, manualSync, refreshPending };
}
