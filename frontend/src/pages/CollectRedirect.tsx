import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

export default function CollectRedirect() {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!trialId) return;
    const id = Number(trialId);
    const roundIdParam = searchParams.get('round_id');

    async function redirect() {
      try {
        // Get first round if not specified
        let roundId: number | undefined = roundIdParam ? Number(roundIdParam) : undefined;
        if (!roundId) {
          const rounds = await api.getScoringRounds(id);
          if (rounds.length > 0) roundId = rounds[0].id;
        }

        const roundQuery = roundId ? `?round_id=${roundId}` : '';

        // Find first unscored active plot
        const unscored = await api.getPlots(id, {
          scored: 'false',
          status: 'active',
          ...(roundId ? { round_id: String(roundId) } : {}),
        });

        if (unscored.length > 0) {
          navigate(`/trials/${id}/collect/${unscored[0].id}${roundQuery}`, { replace: true });
          return;
        }

        // All scored — go to first plot
        const allPlots = await api.getPlots(id);
        if (allPlots.length > 0) {
          navigate(`/trials/${id}/collect/${allPlots[0].id}${roundQuery}`, { replace: true });
        } else {
          setError('No plots in this trial. Import plots first.');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    }

    redirect();
  }, [trialId, navigate, searchParams]);

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-error mb-4">{error}</p>
        <button
          onClick={() => navigate(`/trials/${trialId}/plots`)}
          className="px-4 py-2 bg-primary text-white rounded-lg"
        >
          Go to Plots
        </button>
      </div>
    );
  }

  return <p className="text-neutral text-center py-8">Finding next plot...</p>;
}
