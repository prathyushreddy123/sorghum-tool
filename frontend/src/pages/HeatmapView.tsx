import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { HeatmapData, Trial } from '../types';
import HeatmapGrid from '../components/HeatmapGrid';

export default function HeatmapView() {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const id = Number(trialId);

  const [trial, setTrial] = useState<Trial | null>(null);
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getTrial(id), api.getHeatmap(id)])
      .then(([t, h]) => { setTrial(t); setData(h); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-neutral text-center py-8">Loading heatmap...</p>;
  if (error) return <p className="text-error text-center py-8">{error}</p>;
  if (!trial || !data) return null;

  if (data.cells.length === 0) {
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
      <p className="text-sm text-neutral mb-4">Ergot Severity Heatmap</p>
      <div className="bg-card rounded-lg p-4 shadow">
        <HeatmapGrid
          data={data}
          onCellClick={(plotPk) => navigate(`/trials/${id}/collect/${plotPk}`)}
        />
      </div>
    </div>
  );
}
