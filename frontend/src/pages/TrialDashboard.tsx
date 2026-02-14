import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Trial, TrialStats, HeatmapData } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';
import SeverityHistogram from '../components/SeverityHistogram';
import MiniFieldPlan from '../components/MiniFieldPlan';

export default function TrialDashboard() {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const [trial, setTrial] = useState<Trial | null>(null);
  const [stats, setStats] = useState<TrialStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadData = useCallback(() => {
    if (!trialId) return;
    const id = Number(trialId);
    setLoading(true);
    Promise.all([api.getTrial(id), api.getStats(id), api.getHeatmap(id)])
      .then(([t, s, h]) => { setTrial(t); setStats(s); setHeatmap(h); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [trialId]);

  // Refresh on mount and when navigating back (focus event)
  useEffect(() => {
    loadData();
    const onFocus = () => loadData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadData]);

  async function handleDelete() {
    if (!trial) return;
    setDeleteLoading(true);
    try {
      await api.deleteTrial(trial.id);
      navigate('/');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  }

  if (loading) return <p className="text-neutral text-center py-8">Loading...</p>;
  if (error) return <p className="text-error text-center py-8">{error}</p>;
  if (!trial || !stats) return null;

  const pct = stats.total_plots > 0
    ? Math.round((stats.scored_plots / stats.total_plots) * 100)
    : 0;

  return (
    <div>
      <h2 className="text-xl font-bold text-neutral">{trial.name}</h2>
      <p className="text-sm text-neutral mb-4">{trial.location} &middot; {trial.start_date}</p>

      {/* Progress */}
      <div className="mb-6">
        <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className="bg-primary h-4 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-sm text-neutral mt-1">
          {stats.scored_plots}/{stats.total_plots} plots scored ({pct}%)
        </p>
      </div>

      {/* Stats cards */}
      {stats.total_plots > 0 ? (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard
            label="Avg Ergot"
            value={stats.traits.ergot_severity.mean?.toFixed(1) ?? '—'}
            sub={`n=${stats.traits.ergot_severity.count}`}
          />
          <StatCard
            label="Avg Height"
            value={stats.traits.plant_height.mean ? `${stats.traits.plant_height.mean.toFixed(0)} cm` : '—'}
            sub={`n=${stats.traits.plant_height.count}`}
          />
          <StatCard
            label="Flowering"
            value={stats.traits.flowering_date.count > 0 ? `${stats.traits.flowering_date.count}` : '—'}
            sub={stats.traits.flowering_date.earliest ?? 'No dates'}
          />
          <StatCard
            label="Total Plots"
            value={String(stats.total_plots)}
            sub={`${stats.total_plots - stats.scored_plots} remaining`}
          />
        </div>
      ) : (
        <div className="text-center py-8 mb-6 bg-card rounded-lg shadow">
          <p className="text-neutral text-lg mb-1">No plots yet</p>
          <p className="text-sm text-gray-400">Import a CSV to add plots to this trial.</p>
        </div>
      )}

      {/* Mini field plan grid */}
      {heatmap && heatmap.cells.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-neutral mb-2">Field Plan</h3>
          <div className="bg-card rounded-lg p-3 shadow">
            <MiniFieldPlan
              trialId={trial.id}
              rows={heatmap.rows}
              columns={heatmap.columns}
              cells={heatmap.cells}
            />
          </div>
        </div>
      )}

      {/* Severity distribution */}
      {stats.ergot_distribution?.some((d) => d.count > 0) && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-neutral mb-2">Ergot Severity Distribution</h3>
          <div className="bg-card rounded-lg p-4 shadow">
            <SeverityHistogram data={stats.ergot_distribution} />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {stats.total_plots > 0 && (
          <Link
            to={`/trials/${trial.id}/collect`}
            className="block w-full py-3 bg-primary text-white text-center rounded-lg font-semibold text-lg min-h-[48px]"
          >
            Record Observations
          </Link>
        )}
        <Link
          to={`/trials/${trial.id}/plots`}
          className={`block w-full py-3 text-center rounded-lg font-semibold text-lg min-h-[48px] ${
            stats.total_plots === 0
              ? 'bg-primary text-white'
              : 'bg-card text-primary border-2 border-primary'
          }`}
        >
          {stats.total_plots === 0 ? 'Import Plots' : 'View Plots'}
        </Link>
        {stats.scored_plots > 0 && (
          <Link
            to={`/trials/${trial.id}/heatmap`}
            className="block w-full py-3 bg-card text-primary text-center rounded-lg font-semibold text-lg min-h-[48px] border-2 border-primary"
          >
            Severity Heatmap
          </Link>
        )}
        {stats.scored_plots > 0 && (
          <ExportButton trialId={trial.id} trialName={trial.name} />
        )}
        <button
          onClick={() => setShowDelete(true)}
          className="w-full py-3 text-error text-center rounded-lg font-medium text-sm min-h-[44px] border border-gray-200"
        >
          Delete Trial
        </button>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Trial"
        message="This will permanently delete this trial and all its plots and observations. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
        loading={deleteLoading}
      />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-card rounded-lg p-4 shadow">
      <div className="text-2xl font-bold text-primary">{value}</div>
      <div className="text-sm text-neutral">{label}</div>
      <div className="text-xs text-gray-400">{sub}</div>
    </div>
  );
}

function ExportButton({ trialId, trialName }: { trialId: number; trialName: string }) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await api.exportCsv(trialId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${trialName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="w-full py-3 bg-card text-neutral text-center rounded-lg font-semibold text-lg min-h-[48px] border border-gray-300 disabled:opacity-50"
    >
      {exporting ? 'Exporting...' : 'Export CSV'}
    </button>
  );
}
