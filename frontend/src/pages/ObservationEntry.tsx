import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Plot, ObservationBulkItem, PlotImage, SeverityPrediction, HeightPrediction } from '../types';
import SeveritySelector from '../components/SeveritySelector';
import ReferenceModal from '../components/ReferenceModal';
import ImageCapture from '../components/ImageCapture';

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

  // GPS state
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'pending' | 'captured' | 'denied' | 'unavailable'>('pending');

  // Weather state
  const [temperature, setTemperature] = useState<number | null>(null);
  const [humidity, setHumidity] = useState<number | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');

  // UI state
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [refOpen, setRefOpen] = useState(false);

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
      // Load all plots for prev/next navigation
      const plots = await api.getPlots(tId);
      setAllPlots(plots);
      const idx = plots.findIndex((p) => p.id === pId);
      setCurrentIndex(idx);
      const currentPlot = idx >= 0 ? plots[idx] : null;
      setPlot(currentPlot);

      // Load existing observations for this plot
      const obs = await api.getObservations(pId);
      setSeverity(null);
      setFloweringDate('');
      setPlantHeight('');
      setNotes('');
      setHeightError('');

      for (const o of obs) {
        if (o.trait_name === 'ergot_severity') setSeverity(Number(o.value));
        if (o.trait_name === 'flowering_date') setFloweringDate(o.value);
        if (o.trait_name === 'plant_height') setPlantHeight(o.value);
        if (o.notes) setNotes(o.notes);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plot');
    } finally {
      setLoading(false);
    }
  }, [tId, pId]);

  useEffect(() => {
    loadPlotData();
  }, [loadPlotData]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  // GPS geolocation
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('unavailable');
      return;
    }
    setGpsStatus('pending');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude);
        setGpsLng(pos.coords.longitude);
        setGpsStatus('captured');
      },
      (err) => {
        setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [pId]);

  // Weather fetch (depends on GPS)
  useEffect(() => {
    if (gpsStatus !== 'captured' || gpsLat === null || gpsLng === null) return;
    setWeatherStatus('loading');
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${gpsLat}&longitude=${gpsLng}&current=temperature_2m,relative_humidity_2m`
    )
      .then((res) => res.json())
      .then((data) => {
        setTemperature(data.current.temperature_2m);
        setHumidity(data.current.relative_humidity_2m);
        setWeatherStatus('loaded');
      })
      .catch(() => setWeatherStatus('error'));
  }, [gpsStatus, gpsLat, gpsLng]);

  // AI severity prediction after panicle photo upload
  async function handlePanicleImageUploaded(image: PlotImage) {
    if (severity !== null) return; // already scored, skip prediction

    setAiLoading(true);
    setAiError(false);
    try {
      const prediction = await api.predictSeverity(image.id);
      setAiPrediction(prediction);
      if (prediction.severity >= 1) {
        setSeverity(prediction.severity); // auto-apply only valid severities
      }
    } catch {
      setAiPrediction(null);
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  }

  // AI height prediction after full-plant photo upload
  async function handleFullPlantImageUploaded(image: PlotImage) {
    if (plantHeight) return; // already has a value, skip prediction

    setHeightAiLoading(true);
    setHeightAiError(false);
    try {
      const prediction = await api.predictHeight(image.id);
      setHeightPrediction(prediction);
      if (prediction.height_cm >= 50) {
        setPlantHeight(String(prediction.height_cm)); // auto-fill
      }
    } catch {
      setHeightPrediction(null);
      setHeightAiError(true);
    } finally {
      setHeightAiLoading(false);
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
    // Attach notes to the last observation
    if (notes.trim() && observations.length > 0) {
      observations[observations.length - 1].notes = notes.trim();
    }

    if (observations.length === 0) {
      setError('Enter at least one observation before saving.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.saveObservations(pId, observations);
      setToast('Saved!');

      if (advance) {
        const result = await api.getNextUnscored(tId, pId);
        if (result.next_plot_id && result.next_plot_id !== pId) {
          navigate(`/trials/${tId}/collect/${result.next_plot_id}`, { replace: true });
        } else {
          setToast('All plots scored!');
        }
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

  if (loading) return <p className="text-neutral text-center py-8">Loading...</p>;
  if (!plot) return <p className="text-error text-center py-8">{error || 'Plot not found'}</p>;

  return (
    <div className="pb-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-primary text-white px-6 py-2 rounded-full shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Plot header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-neutral">{plot.plot_id}</h2>
          <span className="text-sm text-gray-500">
            {currentIndex + 1}/{allPlots.length}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {plot.genotype} &middot; Rep {plot.rep} &middot; R{plot.row}C{plot.column}
        </p>
        <div className="mt-1 text-xs">
          {gpsStatus === 'captured' && (
            <span className="text-primary">
              GPS: {gpsLat!.toFixed(5)}, {gpsLng!.toFixed(5)}
            </span>
          )}
          {gpsStatus === 'pending' && <span className="text-gray-400">Getting location...</span>}
          {gpsStatus === 'denied' && <span className="text-warning">Location permission denied</span>}
          {gpsStatus === 'unavailable' && <span className="text-gray-400">Location unavailable</span>}
        </div>
        {weatherStatus === 'loaded' && temperature !== null && humidity !== null && (
          <div className="mt-1 text-xs text-gray-500">
            {temperature.toFixed(1)}&deg;C &middot; {humidity.toFixed(0)}% RH
          </div>
        )}
        {weatherStatus === 'loading' && (
          <div className="mt-1 text-xs text-gray-400">Fetching weather...</div>
        )}
      </div>

      {/* Panicle photo — placed first so user takes photo before scoring */}
      <div className="mb-5">
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
          <span className="text-sm text-yellow-800 font-medium">
            Not a sorghum panicle
          </span>
          {aiPrediction.reasoning && (
            <p className="text-xs text-yellow-600 mt-1">{aiPrediction.reasoning}</p>
          )}
          <p className="text-xs text-yellow-600 mt-1">You can still score manually if this is incorrect.</p>
        </div>
      )}

      {aiPrediction && !aiLoading && aiPrediction.severity >= 1 && (
        <div className="mb-4 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2">
            <span className="text-sm text-blue-700">
              AI set severity to <strong>{aiPrediction.severity}</strong>
              {aiPrediction.confidence >= 0.8 ? '' : ' (low confidence)'}
              {' \u2014 '}tap below to change
            </span>
          </div>
          {aiPrediction.reasoning && (
            <p className="text-xs text-blue-500 mt-1">{aiPrediction.reasoning}</p>
          )}
        </div>
      )}

      {aiError && !aiLoading && !aiPrediction && (
        <div className="mb-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
          <span className="text-sm text-gray-500">
            AI analysis unavailable. Score manually below.
          </span>
        </div>
      )}

      {/* Ergot Severity */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-neutral mb-2">
          Ergot Severity
        </label>
        <SeveritySelector value={severity} onChange={setSeverity} />
        <button
          type="button"
          onClick={() => setRefOpen(true)}
          className="mt-2 text-sm text-primary underline min-h-[44px]"
        >
          View Reference Images
        </button>
      </div>

      {/* Flowering Date */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-neutral mb-1">
          Flowering Date
        </label>
        <input
          type="date"
          value={floweringDate}
          onChange={(e) => setFloweringDate(e.target.value)}
          className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base"
        />
      </div>

      {/* Full-plant photo for height estimation */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-neutral mb-2">
          Full-Plant Photo
        </label>
        <ImageCapture
          plotId={pId}
          imageType="full_plant"
          buttonLabel="Take Full-Plant Photo"
          helpText="Include the meter stick in the frame"
          onImageUploaded={handleFullPlantImageUploaded}
        />
      </div>

      {/* AI Height Prediction Status */}
      {heightAiLoading && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
          <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-sm text-blue-700">Estimating height...</span>
        </div>
      )}

      {heightPrediction && !heightAiLoading && heightPrediction.height_cm === 0 && (
        <div className="mb-4 px-3 py-2 bg-yellow-50 rounded-lg border border-yellow-300">
          <span className="text-sm text-yellow-800 font-medium">
            Could not estimate height
          </span>
          {heightPrediction.reasoning && (
            <p className="text-xs text-yellow-600 mt-1">{heightPrediction.reasoning}</p>
          )}
          <p className="text-xs text-yellow-600 mt-1">Enter height manually below.</p>
        </div>
      )}

      {heightPrediction && !heightAiLoading && heightPrediction.height_cm >= 50 && (
        <div className="mb-4 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-sm text-blue-700">
            AI estimated <strong>{heightPrediction.height_cm} cm</strong>
            {heightPrediction.confidence >= 0.8 ? '' : ' (low confidence)'}
            {' \u2014 '}edit below to change
          </span>
          {heightPrediction.reasoning && (
            <p className="text-xs text-blue-500 mt-1">{heightPrediction.reasoning}</p>
          )}
        </div>
      )}

      {heightAiError && !heightAiLoading && !heightPrediction && (
        <div className="mb-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
          <span className="text-sm text-gray-500">
            AI height estimation unavailable. Enter manually below.
          </span>
        </div>
      )}

      {/* Plant Height */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-neutral mb-1">
          Plant Height (cm)
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={plantHeight}
          onChange={(e) => {
            setPlantHeight(e.target.value);
            validateHeight(e.target.value);
          }}
          placeholder="50-400"
          min={50}
          max={400}
          className={`w-full px-3 py-3 border rounded-lg text-base ${
            heightError ? 'border-error' : 'border-gray-300'
          }`}
        />
        {heightError && (
          <p className="text-error text-xs mt-1">{heightError}</p>
        )}
      </div>

      {/* Notes */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-neutral mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional observations..."
          rows={2}
          className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base resize-none"
        />
      </div>

      {error && <p className="text-error text-sm mb-3">{error}</p>}

      {/* Save & Next */}
      <button
        onClick={() => handleSave(true)}
        disabled={saving}
        className="w-full py-3 bg-primary text-white rounded-lg font-semibold text-lg min-h-[48px] disabled:opacity-50 mb-3"
      >
        {saving ? 'Saving...' : 'Save & Next'}
      </button>

      {/* Save only */}
      <button
        onClick={() => handleSave(false)}
        disabled={saving}
        className="w-full py-3 bg-card text-primary rounded-lg font-semibold text-base min-h-[48px] border-2 border-primary disabled:opacity-50 mb-4"
      >
        Save (Stay Here)
      </button>

      {/* Prev / Next navigation */}
      <div className="flex gap-3">
        <button
          onClick={() => goToPlot(currentIndex - 1)}
          disabled={currentIndex <= 0}
          className="flex-1 py-3 bg-card text-neutral rounded-lg font-medium min-h-[48px] border border-gray-300 disabled:opacity-30"
        >
          &larr; Prev
        </button>
        <button
          onClick={() => goToPlot(currentIndex + 1)}
          disabled={currentIndex >= allPlots.length - 1}
          className="flex-1 py-3 bg-card text-neutral rounded-lg font-medium min-h-[48px] border border-gray-300 disabled:opacity-30"
        >
          Next &rarr;
        </button>
      </div>

      <ReferenceModal open={refOpen} onClose={() => setRefOpen(false)} />
    </div>
  );
}
