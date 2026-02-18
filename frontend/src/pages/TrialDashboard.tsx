import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import * as offlineApi from '../db/offlineApi';
import type { Trial, TrialStats, HeatmapData, ScoringRound, TraitStatItem, WalkMode } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';
import SeverityHistogram from '../components/SeverityHistogram';
import MiniFieldPlan from '../components/MiniFieldPlan';

export default function TrialDashboard() {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const [trial, setTrial] = useState<Trial | null>(null);
  const [stats, setStats] = useState<TrialStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [rounds, setRounds] = useState<ScoringRound[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneLocation, setCloneLocation] = useState('');
  const [cloneDate, setCloneDate] = useState('');
  const [cloneRoundName, setCloneRoundName] = useState('Round 1');
  const [cloning, setCloning] = useState(false);
  const [showWalkPicker, setShowWalkPicker] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState<'idle' | 'downloading' | 'ready'>('idle');
  const [offlineCached, setOfflineCached] = useState(false);

  const id = Number(trialId);

  const loadData = useCallback((roundId?: number) => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      offlineApi.getTrial(id),
      api.getStats(id, roundId).catch(() => null),
      api.getHeatmap(id, undefined, roundId).catch(() => null),
      offlineApi.getScoringRounds(id),
    ])
      .then(([t, s, h, r]) => {
        setTrial(t);
        if (s) setStats(s);
        if (h) setHeatmap(h);
        setRounds(r);
        if (!roundId && r.length > 0) {
          setSelectedRoundId(r[0].id);
        }
        // Background prefetch: cache plots + traits so offline collection works
        offlineApi.prefetchTrialForOffline(id).then(() => {
          setOfflineCached(true);
        }).catch(() => {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadData();
    const onFocus = () => loadData(selectedRoundId);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadData]);

  function handleRoundChange(roundId: number | undefined) {
    setSelectedRoundId(roundId);
    setLoading(true);
    Promise.all([
      api.getStats(id, roundId),
      api.getHeatmap(id, undefined, roundId),
    ])
      .then(([s, h]) => { setStats(s); setHeatmap(h); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

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

  async function handleClone() {
    if (!trial || !cloneName.trim() || !cloneDate) return;
    setCloning(true);
    try {
      const cloned = await api.cloneTrial(trial.id, {
        name: cloneName.trim(),
        location: cloneLocation.trim() || trial.location,
        start_date: cloneDate,
        first_round_name: cloneRoundName.trim() || 'Round 1',
      });
      navigate(`/trials/${cloned.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Clone failed');
    } finally {
      setCloning(false);
      setShowClone(false);
    }
  }

  useEffect(() => {
    offlineApi.isTrialCached(id).then(setOfflineCached);
  }, [id]);

  async function handleDownloadOffline() {
    setOfflineStatus('downloading');
    try {
      await offlineApi.prefetchTrialForOffline(id);
      setOfflineStatus('ready');
      setOfflineCached(true);
    } catch {
      setOfflineStatus('idle');
      setError('Failed to download trial for offline use');
    }
  }

  async function handleWalkModeChange(newMode: WalkMode) {
    setShowWalkPicker(false);
    try {
      const updated = await api.updateTrial(id, { walk_mode: newMode });
      setTrial(updated);
    } catch {
      setError('Failed to update walk mode');
    }
  }

  const WALK_MODE_LABELS: Record<string, { icon: string; label: string }> = {
    serpentine: { icon: '↝', label: 'Serpentine' },
    row_by_row: { icon: '→', label: 'Row-by-Row' },
    column_by_column: { icon: '↓', label: 'Column' },
    free: { icon: '·', label: 'Free' },
  };

  if (loading && !stats) return <p className="text-neutral text-center py-8">Loading...</p>;
  if (error) return <p className="text-error text-center py-8">{error}</p>;
  if (!trial || !stats) return null;

  const pct = stats.total_plots > 0
    ? Math.round((stats.scored_plots / stats.total_plots) * 100)
    : 0;

  const selectedRound = rounds.find((r) => r.id === selectedRoundId);

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-neutral truncate">{trial.name}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-neutral capitalize">
              {trial.location} · {trial.start_date} · {trial.crop}
              {trial.team_name && <span className="text-primary font-medium"> · {trial.team_name}</span>}
            </p>
            <button
              onClick={() => setShowWalkPicker(v => !v)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
            >
              {WALK_MODE_LABELS[trial.walk_mode || 'row_by_row']?.icon}{' '}
              {WALK_MODE_LABELS[trial.walk_mode || 'row_by_row']?.label}
            </button>
          </div>
        </div>
        <button
          onClick={() => { setCloneName(`${trial.name} (Copy)`); setCloneLocation(trial.location); setShowClone(true); }}
          className="flex-shrink-0 ml-2 px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Clone
        </button>
      </div>

      {/* Round selector tabs */}
      {rounds.length > 0 && (
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1 mt-3">
          {rounds.map((r) => (
            <button
              key={r.id}
              onClick={() => handleRoundChange(r.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedRoundId === r.id
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

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
          {selectedRound && <span className="text-gray-400 ml-1">— {selectedRound.name}</span>}
        </p>
      </div>

      {/* Dynamic stats cards */}
      {stats.total_plots > 0 ? (
        <div className="space-y-3 mb-6">
          {/* Total Plots card always shown */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Total Plots"
              value={String(stats.total_plots)}
              sub={`${stats.total_plots - stats.scored_plots} remaining`}
            />
            <StatCard
              label="Scored"
              value={`${pct}%`}
              sub={`${stats.scored_plots} plots`}
            />
          </div>

          {/* Trait stats */}
          {stats.traits.map((t) => (
            <TraitStatCard key={t.trait_id} stat={t} />
          ))}
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
          <h3 className="text-sm font-semibold text-neutral mb-2">
            Field Plan
            {heatmap.trait && <span className="text-gray-400 font-normal ml-1">· {heatmap.trait.label}</span>}
          </h3>
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

      {/* Action buttons */}
      <div className="space-y-3">
        {stats.total_plots > 0 && (
          <Link
            to={selectedRoundId
              ? `/trials/${trial.id}/collect?round_id=${selectedRoundId}`
              : `/trials/${trial.id}/collect`}
            className="block w-full py-3 bg-primary text-white text-center rounded-lg font-semibold text-lg min-h-[48px] cursor-pointer hover:bg-primary-dark transition-colors"
          >
            Record Observations
          </Link>
        )}
        <Link
          to={`/trials/${trial.id}/plots`}
          className={`block w-full py-3 text-center rounded-lg font-semibold text-lg min-h-[48px] cursor-pointer transition-colors ${
            stats.total_plots === 0
              ? 'bg-primary text-white hover:bg-primary-dark'
              : 'bg-card text-primary border-2 border-primary hover:bg-primary-light'
          }`}
        >
          {stats.total_plots === 0 ? 'Import Plots' : 'View Plots'}
        </Link>
        {stats.scored_plots > 0 && (
          <Link
            to={`/trials/${trial.id}/heatmap${selectedRoundId ? `?round_id=${selectedRoundId}` : ''}`}
            className="block w-full py-3 bg-card text-primary text-center rounded-lg font-semibold text-lg min-h-[48px] border-2 border-primary cursor-pointer hover:bg-primary-light transition-colors"
          >
            Field Heatmap
          </Link>
        )}
        {stats.scored_plots > 0 && (
          <ExportButton trialId={trial.id} trialName={trial.name} roundId={selectedRoundId} />
        )}
        {/* Offline download */}
        <button
          onClick={handleDownloadOffline}
          disabled={offlineStatus === 'downloading'}
          className={`w-full py-3 text-center rounded-lg font-semibold text-sm min-h-[44px] border transition-colors ${
            offlineCached || offlineStatus === 'ready'
              ? 'bg-green-50 text-green-700 border-green-300'
              : 'bg-card text-neutral border-gray-300 hover:bg-gray-50'
          } disabled:opacity-50`}
        >
          {offlineStatus === 'downloading'
            ? 'Downloading...'
            : offlineCached || offlineStatus === 'ready'
              ? 'Available Offline ✓'
              : 'Download for Offline Use'}
        </button>
        <button
          onClick={() => setShowDelete(true)}
          className="w-full py-3 text-error text-center rounded-lg font-medium text-sm min-h-[44px] border border-gray-200 cursor-pointer hover:bg-red-50 transition-colors"
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

      {/* Walk mode picker */}
      {showWalkPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-lg font-bold text-neutral mb-3">Field Walk Pattern</h3>
            <div className="grid grid-cols-2 gap-2">
              {([
                { mode: 'serpentine' as WalkMode, label: 'Serpentine', desc: 'Zigzag through rows', arrows: '→→→↓\n↓←←←\n→→→' },
                { mode: 'row_by_row' as WalkMode, label: 'Row-by-Row', desc: 'Left to right, top to bottom', arrows: '→→→\n→→→\n→→→' },
                { mode: 'column_by_column' as WalkMode, label: 'Column-by-Column', desc: 'Top to bottom, left to right', arrows: '↓ ↓ ↓\n↓ ↓ ↓\n↓ ↓ ↓' },
                { mode: 'free' as WalkMode, label: 'Free', desc: 'No enforced order', arrows: '· · ·\n· · ·\n· · ·' },
              ]).map(({ mode, label, desc, arrows }) => (
                <button
                  key={mode}
                  onClick={() => handleWalkModeChange(mode)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    trial.walk_mode === mode
                      ? 'border-green-600 bg-green-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <pre className="text-xs leading-tight mb-1.5 text-gray-500 font-mono">{arrows}</pre>
                  <div className={`text-sm font-semibold ${trial.walk_mode === mode ? 'text-green-700' : 'text-neutral'}`}>{label}</div>
                  <div className="text-xs text-gray-400">{desc}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowWalkPicker(false)}
              className="w-full mt-3 py-2 border border-gray-300 rounded-lg font-semibold text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Clone modal */}
      {showClone && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h3 className="text-lg font-bold text-neutral">Clone Trial</h3>
            <p className="text-xs text-gray-500">Creates a new trial with the same plots and traits, but no observations.</p>
            <div>
              <label className="block text-sm font-medium text-neutral mb-1">New Trial Name *</label>
              <input
                type="text"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral mb-1">Location</label>
              <input
                type="text"
                value={cloneLocation}
                onChange={(e) => setCloneLocation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder={trial.location}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral mb-1">Start Date *</label>
              <input
                type="date"
                value={cloneDate}
                onChange={(e) => setCloneDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral mb-1">First Round Name</label>
              <input
                type="text"
                value={cloneRoundName}
                onChange={(e) => setCloneRoundName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowClone(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg font-semibold text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleClone}
                disabled={cloning || !cloneName.trim() || !cloneDate}
                className="flex-1 py-2.5 bg-primary text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {cloning ? 'Cloning...' : 'Clone Trial'}
              </button>
            </div>
          </div>
        </div>
      )}
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

function TraitStatCard({ stat }: { stat: TraitStatItem }) {
  const isNumeric = stat.data_type === 'integer' || stat.data_type === 'float';
  const isCategorical = stat.data_type === 'categorical';
  const isDate = stat.data_type === 'date';

  return (
    <div className="bg-card rounded-lg p-4 shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm text-neutral">
          {stat.trait_label}
          {stat.unit && <span className="text-gray-400 font-normal ml-1">({stat.unit})</span>}
        </span>
        <span className="text-xs text-gray-400">n={stat.count}</span>
      </div>

      {isNumeric && stat.mean != null && (
        <div className="flex items-baseline gap-3">
          <div>
            <span className="text-2xl font-bold text-primary">{stat.mean.toFixed(1)}</span>
            {stat.sd != null && (
              <span className="text-sm text-gray-400 ml-1">± {stat.sd.toFixed(1)}</span>
            )}
          </div>
          {stat.min_value != null && stat.max_value != null && (
            <span className="text-xs text-gray-400">
              [{stat.min_value.toFixed(1)} – {stat.max_value.toFixed(1)}]
            </span>
          )}
        </div>
      )}

      {isCategorical && stat.distribution && stat.distribution.length > 0 && (
        <SeverityHistogram data={stat.distribution} />
      )}

      {isDate && (
        <div className="text-sm text-gray-600">
          {stat.count > 0 ? (
            <>
              <span className="font-semibold text-primary">{stat.count}</span> dates recorded
              {stat.earliest && <span className="text-gray-400 ml-2">from {stat.earliest}</span>}
              {stat.latest && stat.latest !== stat.earliest && <span className="text-gray-400"> to {stat.latest}</span>}
            </>
          ) : (
            <span className="text-gray-400">No dates recorded</span>
          )}
        </div>
      )}

      {stat.data_type === 'text' && (
        <div className="text-sm text-gray-600">
          <span className="font-semibold text-primary">{stat.count}</span> notes recorded
        </div>
      )}

      {stat.count === 0 && (
        <p className="text-xs text-gray-400 mt-1">No data yet</p>
      )}
    </div>
  );
}

function ExportButton({ trialId, trialName, roundId }: { trialId: number; trialName: string; roundId?: number }) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await api.exportCsv(trialId, roundId);
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
      className="w-full py-3 bg-card text-neutral text-center rounded-lg font-semibold text-lg min-h-[48px] border border-gray-300 disabled:opacity-50 cursor-pointer hover:bg-gray-50 disabled:cursor-not-allowed transition-colors"
    >
      {exporting ? 'Exporting...' : 'Export CSV'}
    </button>
  );
}
