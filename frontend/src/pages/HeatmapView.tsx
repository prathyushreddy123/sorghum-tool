import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { HeatmapData, Trial, TrialTrait, ScoringRound } from '../types';
import HeatmapGrid from '../components/HeatmapGrid';

export default function HeatmapView() {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = Number(trialId);

  const [trial, setTrial] = useState<Trial | null>(null);
  const [data, setData] = useState<HeatmapData | null>(null);
  const [trialTraits, setTrialTraits] = useState<TrialTrait[]>([]);
  const [rounds, setRounds] = useState<ScoringRound[]>([]);

  const initRoundId = searchParams.get('round_id') ? Number(searchParams.get('round_id')) : undefined;
  const [selectedTraitId, setSelectedTraitId] = useState<number | undefined>(undefined);
  const [selectedRoundId, setSelectedRoundId] = useState<number | undefined>(initRoundId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.getTrial(id),
      api.getTrialTraits(id),
      api.getScoringRounds(id),
    ])
      .then(([t, traits, r]) => {
        setTrial(t);
        setTrialTraits(traits);
        setRounds(r);
        // Auto-select first round if not set via URL
        const roundId = initRoundId ?? (r.length > 0 ? r[0].id : undefined);
        setSelectedRoundId(roundId);
        return api.getHeatmap(id, selectedTraitId, roundId);
      })
      .then((h) => setData(h))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function loadHeatmap(traitId: number | undefined, roundId: number | undefined) {
    setLoading(true);
    api.getHeatmap(id, traitId, roundId)
      .then((h) => setData(h))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function handleTraitChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const traitId = e.target.value ? Number(e.target.value) : undefined;
    setSelectedTraitId(traitId);
    loadHeatmap(traitId, selectedRoundId);
  }

  function handleRoundChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const roundId = e.target.value ? Number(e.target.value) : undefined;
    setSelectedRoundId(roundId);
    loadHeatmap(selectedTraitId, roundId);
  }

  if (loading && !data) return <p className="text-neutral text-center py-8">Loading heatmap...</p>;
  if (error) return <p className="text-error text-center py-8">{error}</p>;
  if (!trial) return null;

  if (!data || data.cells.length === 0) {
    return (
      <div className="text-center py-12 text-neutral">
        <p className="text-lg mb-2">No plots yet</p>
        <p className="text-sm">Import plots to see the heatmap.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-neutral mb-1">{trial.name}</h2>

      {/* Selectors row */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {trialTraits.length > 0 && (
          <select
            value={selectedTraitId ?? ''}
            onChange={handleTraitChange}
            className="flex-1 min-w-[140px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">Auto (first trait)</option>
            {trialTraits.map((tt) => (
              <option key={tt.trait_id} value={tt.trait_id}>
                {tt.trait.label}
              </option>
            ))}
          </select>
        )}
        {rounds.length > 0 && (
          <select
            value={selectedRoundId ?? ''}
            onChange={handleRoundChange}
            className="flex-1 min-w-[120px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">All rounds</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && (
        <p className="text-xs text-gray-400 text-center mb-2">Refreshing...</p>
      )}

      <div className="bg-card rounded-lg p-4 shadow">
        <HeatmapGrid
          data={data}
          onCellClick={(plotPk) => navigate(`/trials/${id}/collect/${plotPk}${selectedRoundId ? `?round_id=${selectedRoundId}` : ''}`)}
        />
      </div>
    </div>
  );
}
