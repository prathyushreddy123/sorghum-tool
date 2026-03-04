import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import * as offlineApi from '../db/offlineApi';
import type { Plot, TrialStats, PlotStatus } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';
import BarcodeScanner from '../components/BarcodeScanner';
import ImportWizard from '../components/ImportWizard';

type Filter = 'all' | 'unscored' | 'scored';

const STATUS_BADGE: Record<PlotStatus, { label: string; cls: string }> = {
  active:   { label: 'Active',   cls: 'bg-gray-100 text-gray-500' },
  skipped:  { label: 'Skipped',  cls: 'bg-yellow-100 text-yellow-700' },
  flagged:  { label: 'Flagged',  cls: 'bg-red-100 text-red-700' },
  border:   { label: 'Border',   cls: 'bg-blue-100 text-blue-700' },
};

export default function PlotList() {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const id = Number(trialId);

  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [stats, setStats] = useState<TrialStats | null>(null);

  const [deletingPlotId, setDeletingPlotId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [scanning, setScanning] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchStats = useCallback(() => {
    api.getStats(id).then(setStats).catch(() => {});
  }, [id]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const fetchPlots = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (filter === 'scored') params.scored = 'true';
    if (filter === 'unscored') params.scored = 'false';

    offlineApi.getPlots(id, params)
      .then(setPlots)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, debouncedSearch, filter]);

  useEffect(() => {
    fetchPlots();
  }, [fetchPlots]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult('');
    try {
      const result = await api.importPlots(id, file);
      const msg = `Imported ${result.imported} plots`;
      setImportResult(
        result.errors.length > 0
          ? `${msg}. Errors: ${result.errors.join('; ')}`
          : msg
      );
      fetchPlots();
      fetchStats();
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDeletePlot() {
    if (deletingPlotId === null) return;
    setDeleteLoading(true);
    try {
      await api.deletePlot(id, deletingPlotId);
      setDeletingPlotId(null);
      fetchPlots();
      fetchStats();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  }

  const handleScan = useCallback(
    (value: string) => {
      setScanning(false);
      const match = plots.find((p) => p.plot_id === value);
      if (match) {
        navigate(`/trials/${id}/collect/${match.id}`);
        return;
      }
      api.getPlots(id).then((allPlots) => {
        const found = allPlots.find((p) => p.plot_id === value);
        if (found) {
          navigate(`/trials/${id}/collect/${found.id}`);
        } else {
          setError(`No plot found matching "${value}"`);
        }
      }).catch(() => setError('Failed to look up scanned value'));
    },
    [plots, id, navigate]
  );

  function tabCount(f: Filter): string {
    if (!stats) return '';
    if (f === 'all') return ` (${stats.total_plots})`;
    if (f === 'scored') return ` (${stats.scored_plots})`;
    return ` (${stats.total_plots - stats.scored_plots})`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-neutral">Plots</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScanning(true)}
            className="px-3 py-2 bg-card text-primary rounded-lg text-sm font-medium min-h-[44px] border border-primary hover:bg-primary-light transition-colors"
          >
            Scan
          </button>
          <button
            onClick={() => navigate(`/trials/${id}/bulk-score`)}
            className="px-3 py-2 bg-card text-primary rounded-lg text-sm font-medium min-h-[44px] border border-primary hover:bg-primary-light transition-colors"
          >
            Grid
          </button>
          <button
            onClick={() => setShowImportWizard(true)}
            disabled={importing}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium min-h-[44px] disabled:opacity-50 hover:bg-primary-dark transition-colors"
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      {importResult && (
        <div className={`mb-3 p-3 rounded-lg text-sm ${importResult.includes('Error') ? 'bg-red-50 text-error' : 'bg-green-50 text-primary'}`}>
          {importResult}
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by plot ID or genotype..."
        className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base mb-3"
      />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'unscored', 'scored'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium min-h-[44px] capitalize transition-colors ${
              filter === f
                ? 'bg-primary text-white hover:bg-primary-dark'
                : 'bg-card text-neutral border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {f}{tabCount(f)}
          </button>
        ))}
      </div>

      {/* Plot list */}
      {loading ? (
        <p className="text-neutral text-center py-8">Loading plots...</p>
      ) : error ? (
        <p className="text-error text-center py-8">{error}</p>
      ) : plots.length === 0 ? (
        <div className="text-center py-12 text-neutral">
          <p className="text-lg mb-2">No plots found</p>
          <p className="text-sm">
            {filter !== 'all'
              ? 'Try a different filter.'
              : 'Import a CSV to add plots.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {plots.map((plot) => {
            const statusBadge = STATUS_BADGE[plot.plot_status] ?? STATUS_BADGE.active;
            return (
              <div
                key={plot.id}
                className="w-full text-left bg-card rounded-lg p-4 shadow-sm border border-gray-100 flex items-center gap-2 min-h-[60px]"
              >
                <div
                  onClick={() => navigate(`/trials/${id}/collect/${plot.id}`)}
                  className="min-w-0 flex-1 cursor-pointer"
                >
                  <div className="font-semibold text-neutral truncate">{plot.plot_id}</div>
                  <div className="text-sm text-gray-500 truncate">
                    {plot.genotype} · Rep {plot.rep} · R{plot.row}C{plot.column}
                  </div>
                </div>

                {/* Status badge (non-active) */}
                {plot.plot_status !== 'active' && (
                  <span className={`flex-shrink-0 px-2 py-1 text-xs font-medium rounded-full ${statusBadge.cls}`}>
                    {statusBadge.label}
                  </span>
                )}

                {/* Scored badge */}
                {plot.has_observations ? (
                  <span className="flex-shrink-0 px-2 py-1 bg-primary-light text-white text-xs font-medium rounded-full">
                    Scored
                  </span>
                ) : (
                  <span className="flex-shrink-0 px-2 py-1 bg-gray-200 text-neutral text-xs font-medium rounded-full">
                    Unscored
                  </span>
                )}

                <button
                  onClick={() => setDeletingPlotId(plot.id)}
                  className="flex-shrink-0 p-2 text-gray-400 hover:text-error rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label={`Delete plot ${plot.plot_id}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deletingPlotId !== null}
        title="Delete Plot"
        message="This will permanently delete this plot and all its observations. This cannot be undone."
        onConfirm={handleDeletePlot}
        onCancel={() => setDeletingPlotId(null)}
        loading={deleteLoading}
      />

      {scanning && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setScanning(false)}
        />
      )}

      {showImportWizard && (
        <ImportWizard
          trialId={id}
          onComplete={(msg) => {
            setImportResult(msg);
            fetchPlots();
            fetchStats();
          }}
          onClose={() => setShowImportWizard(false)}
        />
      )}
    </div>
  );
}
