import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Trial } from '../types';

interface Props {
  teamId: number;
  mode?: 'modal' | 'settings';
  onClose?: () => void;
}

export default function TrialSharingManager({ teamId, mode = 'settings', onClose }: Props) {
  const [personalTrials, setPersonalTrials] = useState<Trial[]>([]);
  const [sharedTrialIds, setSharedTrialIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);

  useEffect(() => {
    loadTrials();
  }, [teamId]);

  async function loadTrials() {
    setLoading(true);
    try {
      const [personal, teamTrials] = await Promise.all([
        api.getPersonalTrials(),
        api.getTrials(teamId),
      ]);
      // Combine personal + already-shared-to-this-team trials
      const teamTrialIds = new Set(teamTrials.map(t => t.id));
      setSharedTrialIds(teamTrialIds);
      // Show all personal trials + those currently shared with this team
      const allTrials = [...personal, ...teamTrials.filter(t => !personal.some(p => p.id === t.id))];
      setPersonalTrials(allTrials);
    } catch {
      // Silently fail — user sees empty state
    } finally {
      setLoading(false);
    }
  }

  async function toggleShare(trial: Trial) {
    setToggling(trial.id);
    try {
      const isCurrentlyShared = sharedTrialIds.has(trial.id);
      await api.shareTrial(trial.id, isCurrentlyShared ? null : teamId);
      setSharedTrialIds(prev => {
        const next = new Set(prev);
        if (isCurrentlyShared) next.delete(trial.id);
        else next.add(trial.id);
        return next;
      });
    } catch {
      // Toggle failed — no change
    } finally {
      setToggling(null);
    }
  }

  const content = (
    <div className="space-y-2">
      <h3 className="font-semibold text-base text-gray-800">Share Trials with Team</h3>
      <p className="text-sm text-gray-500">Toggle trials to share or unshare with this team.</p>

      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">Loading...</p>
      ) : personalTrials.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No trials to share.</p>
      ) : (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {personalTrials.map(trial => (
            <div key={trial.id} className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-50">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-800 truncate">{trial.name}</div>
                <div className="text-xs text-gray-500">{trial.location} &middot; {trial.plot_count} plots</div>
              </div>
              <button
                onClick={() => toggleShare(trial)}
                disabled={toggling === trial.id}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-3 ${
                  sharedTrialIds.has(trial.id) ? 'bg-green-600' : 'bg-gray-300'
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    sharedTrialIds.has(trial.id) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (mode === 'modal') {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          {content}
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return content;
}
