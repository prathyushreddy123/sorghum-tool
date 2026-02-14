import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Trial } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';

export default function TrialList() {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    api.getTrials()
      .then(setTrials)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete() {
    if (deletingId === null) return;
    setDeleteLoading(true);
    try {
      await api.deleteTrial(deletingId);
      setTrials((prev) => prev.filter((t) => t.id !== deletingId));
      setDeletingId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  }

  if (loading) return <p className="text-neutral text-center py-8">Loading trials...</p>;
  if (error) return (
    <div className="text-center py-12">
      <p className="text-error mb-2">Failed to load trials</p>
      <p className="text-sm text-neutral mb-4">{error}</p>
      <p className="text-xs text-gray-400">Make sure the backend is running on port 8000.</p>
    </div>
  );

  return (
    <div>
      <h2 className="text-xl font-bold text-neutral mb-4">My Trials</h2>

      {trials.length === 0 ? (
        <div className="text-center py-12 text-neutral">
          <p className="text-lg mb-2">No trials yet</p>
          <p className="text-sm">Create your first trial to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trials.map((trial) => (
            <div
              key={trial.id}
              className="bg-card rounded-lg p-4 shadow hover:shadow-md transition-shadow border border-gray-100 flex items-start gap-2"
            >
              <Link to={`/trials/${trial.id}`} className="flex-1 min-w-0">
                <div className="font-semibold text-primary">{trial.name}</div>
                <div className="text-sm text-neutral mt-1">
                  {trial.location} &middot; {trial.plot_count} plots
                </div>
                {trial.plot_count > 0 && (
                  <div className="text-xs text-neutral mt-1">
                    {trial.scored_count}/{trial.plot_count} scored
                  </div>
                )}
              </Link>
              <button
                onClick={() => setDeletingId(trial.id)}
                className="flex-shrink-0 p-2 text-gray-400 hover:text-error rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label={`Delete ${trial.name}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <Link
        to="/trials/new"
        className="mt-6 w-full py-3 bg-primary text-white rounded-lg font-semibold text-lg min-h-[48px] flex items-center justify-center"
      >
        + New Trial
      </Link>

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete Trial"
        message="This will permanently delete this trial and all its plots and observations. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
