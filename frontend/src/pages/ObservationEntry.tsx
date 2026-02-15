import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Plot, ObservationBulkItem, PlotImage, SeverityPrediction, HeightPrediction } from '../types';
import SeveritySelector from '../components/SeveritySelector';
import InlineReference from '../components/InlineReference';
import ReferenceModal from '../components/ReferenceModal';
import ImageCapture from '../components/ImageCapture';
import HeightMeasure from '../components/HeightMeasure';
import Snackbar from '../components/Snackbar';
import { useWeather } from '../hooks/useWeather';

export default function ObservationEntry() {
  const { trialId, plotId } = useParams<{ trialId: string; plotId: string }>();
  const navigate = useNavigate();
  const tId = Number(trialId);
  const pId = Number(plotId);

  // Plot info
  const [plot, setPlot] = useState<Plot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [severity, setSeverity] = useState<number | null>(null);
  const [floweringDate, setFloweringDate] = useState('');
  const [plantHeight, setPlantHeight] = useState('');
  const [notes, setNotes] = useState('');
  const [heightError, setHeightError] = useState('');

  // GPS + Weather (shared hook)
  const { temperature, humidity, gpsLat, gpsLng, gpsStatus, weatherStatus } = useWeather();

  // UI state
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; undoData?: { plotId: number; severity: number | null; floweringDate: string; plantHeight: string; notes: string } } | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [traitsExpanded, setTraitsExpanded] = useState(false);

  // AI severity prediction state
  const [aiPrediction, setAiPrediction] = useState<SeverityPrediction | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);

  // AI height prediction state
  const [heightPrediction, setHeightPrediction] = useState<HeightPrediction | null>(null);
  const [heightAiLoading, setHeightAiLoading] = useState(false);
  const [heightAiError, setHeightAiError] = useState(false);

  // Navigation
  const [allPlots, setAllPlots] = useState<Plot[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Count filled secondary traits for badge
  const filledTraits = [floweringDate, plantHeight, notes.trim()].filter(Boolean).length;

  const loadPlotData = useCallback(async () => {
    setLoading(true);
    setError('');
    setAiPrediction(null);
    setAiLoading(false);
    setAiError(false);
    setHeightPrediction(null);
    setHeightAiLoading(false);
    setHeightAiError(false);
    try {
      const plots = await api.getPlots(tId);
      setAllPlots(plots);
      const idx = plots.findIndex((p) => p.id === pId);
      setCurrentIndex(idx);
      const currentPlot = idx >= 0 ? plots[idx] : null;
      setPlot(currentPlot);

      const obs = await api.getObservations(pId);
      let hasSecondary = false;
      setSeverity(null);
      setFloweringDate('');
      setPlantHeight('');
      setNotes('');
      setHeightError('');

      for (const o of obs) {
        if (o.trait_name === 'ergot_severity') { setSeverity(Number(o.value)); }
        if (o.trait_name === 'flowering_date') { setFloweringDate(o.value); hasSecondary = true; }
        if (o.trait_name === 'plant_height') { setPlantHeight(o.value); hasSecondary = true; }
        if (o.notes) { setNotes(o.notes); hasSecondary = true; }
      }
      // Auto-expand if secondary traits have data
      setTraitsExpanded(hasSecondary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plot');
    } finally {
      setLoading(false);
    }
  }, [tId, pId]);

  useEffect(() => {
    loadPlotData();
  }, [loadPlotData]);

  // AI severity prediction after panicle photo upload
  async function handlePanicleImageUploaded(image: PlotImage) {
    if (severity !== null) return;

    setAiLoading(true);
    setAiError(false);
    try {
      const prediction = await api.predictSeverity(image.id);
      setAiPrediction(prediction);
      if (prediction.severity >= 1) {
        setSeverity(prediction.severity);
      }
    } catch {
      setAiPrediction(null);
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  }

  function validateHeight(val: string): boolean {
    if (!val) {
      setHeightError('');
      return true;
    }
    const n = Number(val);
    if (isNaN(n) || !Number.isInteger(n)) {
      setHeightError('Must be a whole number');
      return false;
    }
    if (n < 50 || n > 400) {
      setHeightError('Must be 50-400 cm');
      return false;
    }
    setHeightError('');
    return true;
  }

  async function handleSave(advance: boolean) {
    if (plantHeight && !validateHeight(plantHeight)) return;

    const observations: ObservationBulkItem[] = [];
    const extras: Pick<ObservationBulkItem, 'latitude' | 'longitude' | 'temperature' | 'humidity'> = {};
    if (gpsLat !== null && gpsLng !== null) {
      extras.latitude = gpsLat;
      extras.longitude = gpsLng;
    }
    if (temperature !== null) extras.temperature = temperature;
    if (humidity !== null) extras.humidity = humidity;
    if (severity !== null) {
      observations.push({ trait_name: 'ergot_severity', value: String(severity), ...extras });
    }
    if (floweringDate) {
      observations.push({ trait_name: 'flowering_date', value: floweringDate, ...extras });
    }
    if (plantHeight) {
      observations.push({ trait_name: 'plant_height', value: plantHeight, ...extras });
    }
    if (notes.trim() && observations.length > 0) {
      observations[observations.length - 1].notes = notes.trim();
    }

    if (observations.length === 0) {
      setError('Enter at least one observation before saving.');
      return;
    }

    // Snapshot current values for undo
    const undoData = { plotId: pId, severity, floweringDate, plantHeight, notes };

    setSaving(true);
    setError('');
    try {
      await api.saveObservations(pId, observations);

      const severityLabel = severity !== null ? `Severity: ${severity}` : '';
      const savedMsg = `Saved Plot ${currentIndex + 1}${severityLabel ? ` (${severityLabel})` : ''}`;

      if (advance) {
        const result = await api.getNextUnscored(tId, pId);
        if (result.next_plot_id && result.next_plot_id !== pId) {
          setSnackbar({ message: savedMsg, undoData });
          navigate(`/trials/${tId}/collect/${result.next_plot_id}`, { replace: true });
        } else {
          setSnackbar({ message: 'All plots scored!' });
        }
      } else {
        setSnackbar({ message: savedMsg, undoData });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function goToPlot(index: number) {
    if (index >= 0 && index < allPlots.length) {
      navigate(`/trials/${tId}/collect/${allPlots[index].id}`, { replace: true });
    }
  }

  async function handleUndo() {
    if (!snackbar?.undoData) return;
    const { plotId, severity: prevSev, floweringDate: prevFD, plantHeight: prevPH, notes: prevNotes } = snackbar.undoData;

    // Rebuild observations with previous values
    const observations: ObservationBulkItem[] = [];
    if (prevSev !== null) observations.push({ trait_name: 'ergot_severity', value: String(prevSev) });
    if (prevFD) observations.push({ trait_name: 'flowering_date', value: prevFD });
    if (prevPH) observations.push({ trait_name: 'plant_height', value: prevPH });
    if (prevNotes.trim() && observations.length > 0) {
      observations[observations.length - 1].notes = prevNotes.trim();
    }

    try {
      if (observations.length > 0) {
        await api.saveObservations(plotId, observations);
      }
      // Navigate back to that plot if we moved away
      if (plotId !== pId) {
        navigate(`/trials/${tId}/collect/${plotId}`, { replace: true });
      } else {
        // Restore form state
        setSeverity(prevSev);
        setFloweringDate(prevFD);
        setPlantHeight(prevPH);
        setNotes(prevNotes);
      }
    } catch {
      setError('Undo failed');
    }
    setSnackbar(null);
  }

  if (loading) return <p className="text-neutral text-center py-8">Loading...</p>;
  if (!plot) return <p className="text-error text-center py-8">{error || 'Plot not found'}</p>;

  const gpsIcon = gpsStatus === 'captured' ? 'text-green-500' :
                  gpsStatus === 'pending' ? 'text-gray-400' :
                  gpsStatus === 'denied' ? 'text-yellow-500' : 'text-gray-300';

  return (
    <>
      {/* Scrollable content area — bottom padding for sticky bar */}
      <div className="pb-28">
        {/* Snackbar */}
        {snackbar && (
          <Snackbar
            message={snackbar.message}
            onUndo={snackbar.undoData ? handleUndo : undefined}
            onDismiss={() => setSnackbar(null)}
          />
        )}

        {/* Compact plot header (2 lines) */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral">
              Plot {currentIndex + 1}/{allPlots.length}
              <span className="font-normal text-gray-500 ml-2">{plot.genotype} Rep {plot.rep}</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>R{plot.row}C{plot.column}</span>
            <span className={`inline-block w-2 h-2 rounded-full ${gpsIcon}`} style={{ backgroundColor: 'currentColor' }} title={gpsStatus} />
            {weatherStatus === 'loaded' && temperature !== null && humidity !== null && (
              <span>{temperature.toFixed(1)}&deg;C {humidity.toFixed(0)}%RH</span>
            )}
          </div>
        </div>

        {/* Panicle photo */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral mb-2">
            Panicle Photo
          </label>
          <ImageCapture plotId={pId} imageType="panicle" buttonLabel="Take Panicle Photo" onImageUploaded={handlePanicleImageUploaded} />
        </div>

        {/* AI Prediction Status */}
        {aiLoading && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
            <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm text-blue-700">Analyzing photo...</span>
          </div>
        )}

        {aiPrediction && !aiLoading && aiPrediction.severity === 0 && (
          <div className="mb-4 px-3 py-2 bg-yellow-50 rounded-lg border border-yellow-300">
            <span className="text-sm text-yellow-800 font-medium">Not a sorghum panicle</span>
            {aiPrediction.reasoning && (
              <p className="text-xs text-yellow-600 mt-1">{aiPrediction.reasoning}</p>
            )}
          </div>
        )}

        {aiPrediction && !aiLoading && aiPrediction.severity >= 1 && (
          <div className="mb-4 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
            <span className="text-sm text-blue-700">
              AI set severity to <strong>{aiPrediction.severity}</strong>
              {aiPrediction.confidence >= 0.8 ? '' : ' (low confidence)'}
              {' \u2014 '}tap below to change
            </span>
            {aiPrediction.reasoning && (
              <p className="text-xs text-blue-500 mt-1">{aiPrediction.reasoning}</p>
            )}
          </div>
        )}

        {aiError && !aiLoading && !aiPrediction && (
          <div className="mb-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-sm text-gray-500">AI analysis unavailable. Score manually below.</span>
          </div>
        )}

        {/* Ergot Severity */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-neutral mb-2">
            Ergot Severity
          </label>
          <SeveritySelector value={severity} onChange={setSeverity} />
        </div>

        {/* Inline reference image */}
        <div className="mb-4">
          <InlineReference severity={severity} />
          <button
            type="button"
            onClick={() => setRefOpen(true)}
            className="mt-1 text-xs text-primary underline min-h-[36px] cursor-pointer hover:text-primary-dark"
          >
            View All References
          </button>
        </div>

        {/* Collapsible More Traits section */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setTraitsExpanded(!traitsExpanded)}
            className="w-full flex items-center justify-between py-3 px-3 bg-gray-50 rounded-lg border border-gray-200 min-h-[48px] cursor-pointer hover:bg-gray-100 transition-colors"
          >
            <span className="text-sm font-medium text-neutral">
              More Traits
              {filledTraits > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-xs font-bold">
                  {filledTraits}
                </span>
              )}
              <span className="text-gray-400 ml-1">/ 3</span>
            </span>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${traitsExpanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {traitsExpanded && (
            <div className="mt-3 space-y-4 pl-1">
              {/* Flowering Date */}
              <div>
                <label className="block text-sm font-medium text-neutral mb-1">
                  Flowering Date
                </label>
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => setFloweringDate(new Date().toISOString().split('T')[0])}
                    className={`px-3 py-2 rounded-lg text-xs font-medium min-h-[40px] border cursor-pointer transition-colors ${
                      floweringDate === new Date().toISOString().split('T')[0]
                        ? 'bg-primary text-white border-primary hover:bg-primary-dark'
                        : 'bg-white text-primary border-primary hover:bg-primary-light'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      setFloweringDate(d.toISOString().split('T')[0]);
                    }}
                    className={`px-3 py-2 rounded-lg text-xs font-medium min-h-[40px] border cursor-pointer transition-colors ${
                      floweringDate === (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })()
                        ? 'bg-primary text-white border-primary hover:bg-primary-dark'
                        : 'bg-white text-primary border-primary hover:bg-primary-light'
                    }`}
                  >
                    Yesterday
                  </button>
                  <input
                    type="date"
                    value={floweringDate}
                    onChange={(e) => setFloweringDate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[40px]"
                  />
                </div>
              </div>

              {/* Height Measurement */}
              <div>
                <label className="block text-sm font-medium text-neutral mb-2">
                  Height
                </label>
                <HeightMeasure
                  plotId={pId}
                  plantHeight={plantHeight}
                  onHeightChange={(h) => {
                    setPlantHeight(h);
                    validateHeight(h);
                  }}
                  heightPrediction={heightPrediction}
                  heightAiLoading={heightAiLoading}
                  heightAiError={heightAiError}
                  onHeightPrediction={setHeightPrediction}
                  onHeightAiLoading={setHeightAiLoading}
                  onHeightAiError={setHeightAiError}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={plantHeight}
                  onChange={(e) => {
                    setPlantHeight(e.target.value);
                    validateHeight(e.target.value);
                  }}
                  placeholder="50-400 cm"
                  min={50}
                  max={400}
                  className={`w-full mt-2 px-3 py-2 border rounded-lg text-sm ${
                    heightError ? 'border-error' : 'border-gray-300'
                  }`}
                />
                {heightError && (
                  <p className="text-error text-xs mt-1">{heightError}</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-neutral mb-1">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional observations..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-error text-sm mb-3">{error}</p>}

        {/* Save (Stay Here) as text link */}
        <div className="text-center">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="text-sm text-primary underline min-h-[36px] disabled:opacity-50 cursor-pointer hover:text-primary-dark disabled:cursor-not-allowed"
          >
            Save (Stay Here)
          </button>
        </div>
      </div>

      {/* STICKY BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => goToPlot(currentIndex - 1)}
            disabled={currentIndex <= 0}
            className="px-4 py-3 bg-card text-neutral rounded-lg font-medium min-h-[48px] border border-gray-300 disabled:opacity-30 cursor-pointer hover:bg-gray-50 disabled:cursor-not-allowed transition-colors"
          >
            &larr;
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex-1 py-3 bg-primary text-white rounded-lg font-semibold text-base min-h-[48px] disabled:opacity-50 cursor-pointer hover:bg-primary-dark disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save & Next'}
          </button>
          <button
            onClick={() => goToPlot(currentIndex + 1)}
            disabled={currentIndex >= allPlots.length - 1}
            className="px-4 py-3 bg-card text-neutral rounded-lg font-medium min-h-[48px] border border-gray-300 disabled:opacity-30 cursor-pointer hover:bg-gray-50 disabled:cursor-not-allowed transition-colors"
          >
            &rarr;
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-1">
          {currentIndex + 1} / {allPlots.length}
        </p>
      </div>

      <ReferenceModal open={refOpen} onClose={() => setRefOpen(false)} />
    </>
  );
}
