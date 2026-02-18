import { useEffect, useState, useCallback, useRef, TouchEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Plot, PlotImage, ScoringRound, TrialTrait, Observation } from '../types';
import { parseTrait } from '../types';
import TraitInput from '../components/TraitInput';
import ImageCapture from '../components/ImageCapture';
import Snackbar from '../components/Snackbar';
import { useWeather } from '../hooks/useWeather';

export default function ObservationEntry() {
  const { trialId, plotId } = useParams<{ trialId: string; plotId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tId = Number(trialId);
  const pId = Number(plotId);
  const roundIdParam = searchParams.get('round_id');

  // Data
  const [plot, setPlot] = useState<Plot | null>(null);
  const [allPlots, setAllPlots] = useState<Plot[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [trialTraits, setTrialTraits] = useState<TrialTrait[]>([]);
  const [rounds, setRounds] = useState<ScoringRound[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [traitValues, setTraitValues] = useState<Record<number, string>>({});   // trait_id → value
  const [prevValues, setPrevValues] = useState<Record<number, string>>({});      // trait_id → prev round value
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Plot status
  const [plotStatus, setPlotStatus] = useState<string>('active');

  // AI prediction for categorical traits with images
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ traitId: number; value: string; confidence: number; reasoning: string } | null>(null);

  // Weather
  const { temperature, humidity, gpsLat, gpsLng, gpsStatus, weatherStatus } = useWeather();

  // Save state
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; undoPlotId?: number; undoValues?: Record<number, string> } | null>(null);

  // Swipe gesture
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setAiResult(null);
    try {
      const [plots, traits, roundsList] = await Promise.all([
        api.getPlots(tId),
        api.getTrialTraits(tId),
        api.getScoringRounds(tId),
      ]);

      setAllPlots(plots);
      const idx = plots.findIndex(p => p.id === pId);
      setCurrentIndex(idx);
      setPlot(idx >= 0 ? plots[idx] : null);
      setPlotStatus(idx >= 0 ? plots[idx].plot_status : 'active');
      setTrialTraits(traits);
      setRounds(roundsList);

      // Determine active round
      let activeRoundId: number | null = null;
      if (roundIdParam) {
        activeRoundId = Number(roundIdParam);
      } else if (roundsList.length > 0) {
        activeRoundId = roundsList[roundsList.length - 1].id; // latest round
      }
      setSelectedRoundId(activeRoundId);

      // Load existing observations for this plot + round
      const obs = await api.getObservations(pId, activeRoundId ?? undefined);
      const vals: Record<number, string> = {};
      for (const o of obs) {
        if (o.trait_id) vals[o.trait_id] = o.value;
      }
      setTraitValues(vals);

      // Load previous round values (second-to-last round)
      const prevVals: Record<number, string> = {};
      if (roundsList.length >= 2 && activeRoundId) {
        const roundIds = roundsList.map(r => r.id);
        const activeIdx = roundIds.indexOf(activeRoundId);
        const prevRoundId = activeIdx > 0 ? roundIds[activeIdx - 1] : null;
        if (prevRoundId) {
          const prevObs = await api.getObservations(pId, prevRoundId);
          for (const o of prevObs) {
            if (o.trait_id) prevVals[o.trait_id] = o.value;
          }
        }
      }
      setPrevValues(prevVals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tId, pId, roundIdParam]);

  useEffect(() => { loadData(); }, [loadData]);

  function setTraitValue(traitId: number, value: string) {
    setTraitValues(prev => ({ ...prev, [traitId]: value }));
  }

  // AI prediction after image upload (for first categorical trait with image)
  async function handleImageUploaded(image: PlotImage) {
    const firstCategorical = trialTraits.find(tt => tt.trait.data_type === 'categorical');
    if (!firstCategorical || traitValues[firstCategorical.trait_id]) return;

    setAiLoading(true);
    try {
      const prediction = await api.predictSeverity(image.id);
      if (prediction.severity >= 1) {
        setTraitValue(firstCategorical.trait_id, String(prediction.severity));
        setAiResult({
          traitId: firstCategorical.trait_id,
          value: String(prediction.severity),
          confidence: prediction.confidence,
          reasoning: prediction.reasoning,
        });
      }
    } catch {
      // silently fail — user scores manually
    } finally {
      setAiLoading(false);
    }
  }

  async function handleFlagPlot(status: string) {
    const newStatus = plotStatus === status ? 'active' : status;
    try {
      await api.updatePlotStatus(tId, pId, newStatus);
      setPlotStatus(newStatus);
    } catch {
      setError('Failed to update plot status');
    }
  }

  async function handleSave(advance: boolean) {
    const observations = trialTraits
      .filter(tt => traitValues[tt.trait_id] !== undefined && traitValues[tt.trait_id] !== '')
      .map(tt => ({
        trait_id: tt.trait_id,
        value: traitValues[tt.trait_id],
        latitude: gpsLat ?? undefined,
        longitude: gpsLng ?? undefined,
        temperature: temperature ?? undefined,
        humidity: humidity ?? undefined,
      }));

    if (observations.length === 0) {
      setError('Enter at least one trait value before saving.');
      return;
    }

    const undoValues = { ...traitValues };

    setSaving(true);
    setError('');
    try {
      await api.saveObservations(pId, {
        scoring_round_id: selectedRoundId ?? undefined,
        observations,
      });

      const roundName = rounds.find(r => r.id === selectedRoundId)?.name || '';
      const savedMsg = `Saved Plot ${currentIndex + 1}${roundName ? ` · ${roundName}` : ''}`;

      if (advance) {
        const result = await api.getNextUnscored(tId, pId, selectedRoundId ?? undefined);
        if (result.next_plot_id && result.next_plot_id !== pId) {
          setSnackbar({ message: savedMsg, undoPlotId: pId, undoValues });
          const roundQuery = selectedRoundId ? `?round_id=${selectedRoundId}` : '';
          navigate(`/trials/${tId}/collect/${result.next_plot_id}${roundQuery}`, { replace: true });
        } else {
          setSnackbar({ message: 'All plots scored for this round!' });
        }
      } else {
        setSnackbar({ message: savedMsg, undoPlotId: pId, undoValues });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleUndo() {
    if (!snackbar?.undoPlotId || !snackbar.undoValues) return;
    const { undoPlotId, undoValues } = snackbar;
    const observations = trialTraits
      .filter(tt => undoValues[tt.trait_id])
      .map(tt => ({ trait_id: tt.trait_id, value: undoValues[tt.trait_id] }));
    try {
      if (observations.length > 0) {
        await api.saveObservations(undoPlotId, {
          scoring_round_id: selectedRoundId ?? undefined,
          observations,
        });
      }
      if (undoPlotId !== pId) {
        const roundQuery = selectedRoundId ? `?round_id=${selectedRoundId}` : '';
        navigate(`/trials/${tId}/collect/${undoPlotId}${roundQuery}`, { replace: true });
      } else {
        setTraitValues(undoValues);
      }
    } catch {
      setError('Undo failed');
    }
    setSnackbar(null);
  }

  function goToPlot(index: number) {
    if (index >= 0 && index < allPlots.length) {
      const roundQuery = selectedRoundId ? `?round_id=${selectedRoundId}` : '';
      navigate(`/trials/${tId}/collect/${allPlots[index].id}${roundQuery}`, { replace: true });
    }
  }

  // Swipe handlers
  function onTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > 50 && dy < 30) {
      if (dx < 0) goToPlot(currentIndex + 1); // swipe left → next
      else goToPlot(currentIndex - 1);          // swipe right → prev
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  if (loading) return <p className="text-neutral text-center py-8">Loading...</p>;
  if (!plot) return <p className="text-red-600 text-center py-8">{error || 'Plot not found'}</p>;

  const gpsColor = gpsStatus === 'captured' ? 'bg-green-500' : gpsStatus === 'pending' ? 'bg-gray-300' : 'bg-yellow-400';
  const filledCount = Object.values(traitValues).filter(v => v !== '').length;

  return (
    <>
      <div
        className="pb-28"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {snackbar && (
          <Snackbar
            message={snackbar.message}
            onUndo={snackbar.undoPlotId ? handleUndo : undefined}
            onDismiss={() => setSnackbar(null)}
          />
        )}

        {/* Plot header */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral">
              Plot {currentIndex + 1}/{allPlots.length}
              <span className="font-normal text-gray-500 ml-2">{plot.genotype} Rep {plot.rep}</span>
            </h2>
            {/* Flag buttons */}
            <div className="flex gap-1">
              {(['flagged', 'skipped', 'border'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => handleFlagPlot(s)}
                  title={s.charAt(0).toUpperCase() + s.slice(1)}
                  className={`text-xs px-2 py-1 rounded border transition-all
                    ${plotStatus === s ? 'bg-yellow-100 border-yellow-400 text-yellow-700 font-semibold' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}
                >
                  {s === 'flagged' ? '🚩' : s === 'skipped' ? '⏭' : '🔲'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
            <span>R{plot.row}C{plot.column}</span>
            <span className="text-gray-300">·</span>
            <span className={`w-2 h-2 rounded-full ${gpsColor} inline-block`} title={gpsStatus} />
            {weatherStatus === 'loaded' && temperature !== null && (
              <span>{temperature.toFixed(1)}°C {humidity?.toFixed(0)}%RH</span>
            )}
            {plotStatus !== 'active' && (
              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px] font-semibold uppercase">
                {plotStatus}
              </span>
            )}
          </div>
        </div>

        {/* Round selector */}
        {rounds.length > 1 && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Scoring Round</label>
            <div className="flex gap-2 flex-wrap">
              {rounds.map(r => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSelectedRoundId(r.id);
                    const query = `?round_id=${r.id}`;
                    navigate(`/trials/${tId}/collect/${pId}${query}`, { replace: true });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                    ${selectedRoundId === r.id
                      ? 'bg-green-700 text-white border-green-700'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                    }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Image capture (for first image-relevant categorical trait) */}
        {trialTraits.some(tt => tt.trait.data_type === 'categorical') && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral mb-2">Photo</label>
            <ImageCapture plotId={pId} imageType="panicle" buttonLabel="Take Photo" onImageUploaded={handleImageUploaded} />
          </div>
        )}

        {/* AI loading/result banner */}
        {aiLoading && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
            <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm text-blue-700">Analyzing photo...</span>
          </div>
        )}
        {aiResult && !aiLoading && (
          <div className="mb-4 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
            <span className="text-sm text-blue-700">
              AI set value to <strong>{aiResult.value}</strong>
              {aiResult.confidence < 0.8 && ' (low confidence)'} — tap to change
            </span>
            {aiResult.reasoning && (
              <p className="text-xs text-blue-500 mt-1">{aiResult.reasoning}</p>
            )}
          </div>
        )}

        {/* Dynamic trait inputs */}
        <div className="space-y-1">
          {trialTraits.map(tt => {
            const parsed = parseTrait(tt.trait);
            return (
              <div key={tt.trait_id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                <TraitInput
                  trait={parsed}
                  value={traitValues[tt.trait_id] ?? ''}
                  previousValue={prevValues[tt.trait_id]}
                  onChange={v => setTraitValue(tt.trait_id, v)}
                />
              </div>
            );
          })}
        </div>

        {trialTraits.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p>No traits configured for this trial.</p>
            <button
              onClick={() => navigate(`/trials/${tId}`)}
              className="mt-2 text-green-700 underline text-sm"
            >
              Go to trial settings
            </button>
          </div>
        )}

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

        <div className="text-center mt-4">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="text-sm text-green-700 underline min-h-[36px] disabled:opacity-50"
          >
            Save (Stay Here)
          </button>
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => goToPlot(currentIndex - 1)}
            disabled={currentIndex <= 0}
            className="px-4 py-3 bg-gray-50 text-neutral rounded-lg font-medium min-h-[48px] border border-gray-300 disabled:opacity-30"
          >
            ←
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || filledCount === 0}
            className="flex-1 py-3 bg-green-700 text-white rounded-lg font-semibold text-base min-h-[48px] disabled:opacity-50"
          >
            {saving ? 'Saving...' : `Save & Next ${filledCount > 0 ? `(${filledCount})` : ''}`}
          </button>
          <button
            onClick={() => goToPlot(currentIndex + 1)}
            disabled={currentIndex >= allPlots.length - 1}
            className="px-4 py-3 bg-gray-50 text-neutral rounded-lg font-medium min-h-[48px] border border-gray-300 disabled:opacity-30"
          >
            →
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-1">
          {currentIndex + 1} / {allPlots.length}
          {selectedRoundId && rounds.length > 0 && (
            <span className="ml-2 text-green-600">· {rounds.find(r => r.id === selectedRoundId)?.name}</span>
          )}
        </p>
      </div>
    </>
  );
}
