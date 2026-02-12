import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function CollectRedirect() {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!trialId) return;
    const id = Number(trialId);

    api.getPlots(id, { scored: 'false' })
      .then((plots) => {
        if (plots.length > 0) {
          navigate(`/trials/${id}/collect/${plots[0].id}`, { replace: true });
        } else {
          // All scored — go to first plot
          return api.getPlots(id).then((allPlots) => {
            if (allPlots.length > 0) {
              navigate(`/trials/${id}/collect/${allPlots[0].id}`, { replace: true });
            } else {
              setError('No plots in this trial. Import plots first.');
            }
          });
        }
      })
      .catch((e) => setError(e.message));
  }, [trialId, navigate]);

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
