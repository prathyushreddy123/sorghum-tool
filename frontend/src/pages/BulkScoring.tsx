import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Plot, TrialTrait, ScoringRound } from '../types';

interface CellValue {
  plotId: number;
  traitId: number;
  value: string;
  dirty: boolean;
}

export default function BulkScoring() {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const tId = Number(trialId);

  const [plots, setPlots] = useState<Plot[]>([]);
  const [traits, setTraits] = useState<TrialTrait[]>([]);
  const [rounds, setRounds] = useState<ScoringRound[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [cells, setCells] = useState<Map<string, CellValue>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const cellKey = (plotId: number, traitId: number) => `${plotId}-${traitId}`;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [plotsList, traitsList, roundsList] = await Promise.all([
        api.getPlots(tId),
        api.getTrialTraits(tId),
        api.getScoringRounds(tId),
      ]);
      setPlots(plotsList);
      setTraits(traitsList);
      setRounds(roundsList);

      const activeRound = roundsList.length > 0 ? roundsList[roundsList.length - 1].id : null;
      setSelectedRoundId(activeRound);

      // Load existing observations
      const obs = await api.getTrialObservations(tId, activeRound ?? undefined);
      const newCells = new Map<string, CellValue>();
      for (const o of obs) {
        if (o.trait_id) {
          const key = cellKey(o.plot_id, o.trait_id);
          newCells.set(key, { plotId: o.plot_id, traitId: o.trait_id, value: o.value, dirty: false });
        }
      }
      setCells(newCells);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRoundChange(roundId: number) {
    setSelectedRoundId(roundId);
    try {
      const obs = await api.getTrialObservations(tId, roundId);
      const newCells = new Map<string, CellValue>();
      for (const o of obs) {
        if (o.trait_id) {
          const key = cellKey(o.plot_id, o.trait_id);
          newCells.set(key, { plotId: o.plot_id, traitId: o.trait_id, value: o.value, dirty: false });
        }
      }
      setCells(newCells);
    } catch {
      setError('Failed to load round data');
    }
  }

  function updateCell(plotId: number, traitId: number, value: string) {
    const key = cellKey(plotId, traitId);
    setCells(prev => {
      const next = new Map(prev);
      next.set(key, { plotId, traitId, value, dirty: true });
      return next;
    });
  }

  const dirtyCount = Array.from(cells.values()).filter(c => c.dirty && c.value !== '').length;

  async function handleSaveAll() {
    const dirtyCells = Array.from(cells.values()).filter(c => c.dirty && c.value !== '');
    if (dirtyCells.length === 0) return;

    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      await api.saveGridObservations(tId, {
        scoring_round_id: selectedRoundId ?? undefined,
        observations: dirtyCells.map(c => ({
          plot_id: c.plotId,
          trait_id: c.traitId,
          value: c.value,
        })),
      });
      // Mark all as clean
      setCells(prev => {
        const next = new Map(prev);
        for (const [key, val] of next) {
          if (val.dirty) next.set(key, { ...val, dirty: false });
        }
        return next;
      });
      setSavedMsg(`Saved ${dirtyCells.length} observations`);
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function renderCellInput(plot: Plot, tt: TrialTrait) {
    const key = cellKey(plot.id, tt.trait_id);
    const cell = cells.get(key);
    const value = cell?.value ?? '';
    const isDirty = cell?.dirty ?? false;
    const trait = tt.trait;

    const baseCls = `w-full text-xs px-1 py-1 border rounded text-center ${isDirty ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}`;

    if (trait.data_type === 'categorical') {
      const cats: string[] = trait.categories ? JSON.parse(trait.categories) : [];
      return (
        <select
          value={value}
          onChange={e => updateCell(plot.id, tt.trait_id, e.target.value)}
          className={baseCls}
        >
          <option value="">-</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      );
    }

    if (trait.data_type === 'date') {
      return (
        <input
          type="date"
          value={value}
          onChange={e => updateCell(plot.id, tt.trait_id, e.target.value)}
          className={baseCls}
        />
      );
    }

    return (
      <input
        type={trait.data_type === 'integer' || trait.data_type === 'float' ? 'number' : 'text'}
        value={value}
        onChange={e => updateCell(plot.id, tt.trait_id, e.target.value)}
        step={trait.data_type === 'float' ? '0.1' : '1'}
        min={trait.min_value ?? undefined}
        max={trait.max_value ?? undefined}
        className={baseCls}
        placeholder="-"
      />
    );
  }

  if (loading) return <p className="text-neutral text-center py-8">Loading...</p>;

  return (
    <div>
      {/* Sticky top bar: save + nav + round selector */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm -mx-4 sm:-mx-6 px-4 sm:px-6 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/trials/${tId}/plots`)} className="text-sm text-gray-500 hover:text-gray-700">
              ← List
            </button>
            <h2 className="text-sm font-bold text-neutral">Grid Scoring</h2>
          </div>
          <div className="flex items-center gap-2">
            {dirtyCount > 0 && (
              <span className="text-xs text-yellow-600 font-medium">{dirtyCount} unsaved</span>
            )}
            <button
              onClick={handleSaveAll}
              disabled={saving || dirtyCount === 0}
              className="px-4 py-2 bg-green-700 text-white rounded-lg font-semibold text-sm min-h-[40px] disabled:opacity-30 transition-opacity"
            >
              {saving ? 'Saving...' : `Save All${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
            </button>
          </div>
        </div>

        {/* Round selector + messages */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {rounds.length > 1 && rounds.map(r => (
            <button
              key={r.id}
              onClick={() => handleRoundChange(r.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                selectedRoundId === r.id
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
              }`}
            >
              {r.name}
            </button>
          ))}
          {savedMsg && <span className="text-xs text-green-600 font-medium ml-auto">{savedMsg}</span>}
          {error && <span className="text-xs text-error font-medium ml-auto">{error}</span>}
        </div>
      </div>

      {/* Grid table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg mt-3">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-20 bg-gray-50 px-2 py-2 text-left font-semibold text-gray-600 min-w-[100px] border-r border-gray-200">
                Plot
              </th>
              {traits.map(tt => (
                <th key={tt.trait_id} className="px-2 py-2 text-center font-semibold text-gray-600 min-w-[80px]">
                  {tt.trait.label}
                  {tt.trait.unit && <span className="text-gray-400 font-normal ml-0.5">({tt.trait.unit})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plots.map(plot => (
              <tr key={plot.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium text-neutral border-r border-gray-200">
                  <div className="truncate max-w-[100px]">{plot.plot_id}</div>
                  <div className="text-[10px] text-gray-400 truncate">{plot.genotype}</div>
                </td>
                {traits.map(tt => (
                  <td key={tt.trait_id} className="px-1 py-1">
                    {renderCellInput(plot, tt)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
