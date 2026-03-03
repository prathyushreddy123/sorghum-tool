import { useEffect, useState, useCallback, useRef } from 'react';
import type { TouchEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import * as offlineApi from '../db/offlineApi';
import type { Plot, PlotImage, HeightPrediction, ScoringRound, TrialTrait, WalkMode } from '../types';
import { parseTrait } from '../types';
import TraitInput from '../components/TraitInput';
import HeightMeasure from '../components/HeightMeasure';
import ImageCapture from '../components/ImageCapture';
import Snackbar from '../components/Snackbar';
import QRScannerModal from '../components/QRScannerModal';
import { classifyTrait, preloadModels, modelManager } from '../services/classifierService';
import { useWeather } from '../hooks/useWeather';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

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
  const [walkMode, setWalkMode] = useState<WalkMode>('row_by_row');
  const [showWalkPicker, setShowWalkPicker] = useState(false);

  // Plot status
  const [plotStatus, setPlotStatus] = useState<string>('active');

  // AI prediction for categorical traits with images
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<Record<number, {
    value: string;
    confidence: number;
    reasoning: string;
    disease?: string;
    diseaseConf?: number;
  }>>({});
  const [lastDiseaseId, setLastDiseaseId] = useState<{ disease: string; confidence: number } | null>(null);

  // AI height prediction
  const [heightPrediction, setHeightPrediction] = useState<HeightPrediction | null>(null);
  const [heightAiLoading, setHeightAiLoading] = useState(false);
  const [heightAiError, setHeightAiError] = useState(false);

  // Weather
  const { temperature, humidity, gpsLat, gpsLng, gpsStatus, weatherStatus } = useWeather();

  // Save state
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; undoPlotId?: number; undoValues?: Record<number, string> } | null>(null);

  // Online status
  const { online, refreshPending } = useOnlineStatus();

  // QR scanner
  const [showScanner, setShowScanner] = useState(false);

  // Swipe gesture
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setAiResults({});
    setLastDiseaseId(null);
    setHeightPrediction(null);
    setHeightAiError(false);
    try {
      const trial = await offlineApi.getTrial(tId);
      const wm = trial.walk_mode || 'row_by_row';
      setWalkMode(wm);

      const [plots, traits, roundsList] = await Promise.all([
        offlineApi.getPlots(tId, { walk_mode: wm }),
        offlineApi.getTrialTraits(tId),
        offlineApi.getScoringRounds(tId),
      ]);

      setAllPlots(plots);
      const idx = plots.findIndex(p => p.id === pId);
      setCurrentIndex(idx);
      setPlot(idx >= 0 ? plots[idx] : null);
      setPlotStatus(idx >= 0 ? plots[idx].plot_status : 'active');
      setTrialTraits(traits);
      setRounds(roundsList);

      // Preload AI models for categorical traits (fire-and-forget)
      const categoricalTraitNames = traits
        .filter(tt => tt.trait.data_type === 'categorical')
        .map(tt => tt.trait.name);
      if (categoricalTraitNames.length > 0) {
        preloadModels(categoricalTraitNames).catch(() => {});
      }

      // Determine active round
      let activeRoundId: number | null = null;
      if (roundIdParam) {
        activeRoundId = Number(roundIdParam);
      } else if (roundsList.length > 0) {
        activeRoundId = roundsList[roundsList.length - 1].id; // latest round
      }
      setSelectedRoundId(activeRoundId);

      // Load existing observations for this plot + round
      const obs = await offlineApi.getObservations(pId, activeRoundId ?? undefined);
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
          const prevObs = await offlineApi.getObservations(pId, prevRoundId);
          for (const o of prevObs) {
            if (o.trait_id) prevVals[o.trait_id] = o.value;
          }
        }
      }
      setPrevValues(prevVals);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load';
      if (!navigator.onLine && msg.includes('Offline')) {
        setError('No cached data available. Please go online, visit the trial dashboard, then try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [tId, pId, roundIdParam]);

  useEffect(() => { loadData(); }, [loadData]);

  function setTraitValue(traitId: number, value: string) {
    setTraitValues(prev => ({ ...prev, [traitId]: value }));
  }

  // Track blob and uploaded image for two-phase classification
  const pendingBlobRef = useRef<Blob | null>(null);
  const localResultRef = useRef<Awaited<ReturnType<typeof classifyTrait>> | null>(null);
  // The trait being classified (set when photo is captured)
  const classifyingTraitRef = useRef<{ traitId: number; traitName: string } | null>(null);

  // AI-supported traits (resolved from manifest)
  const [aiTraitNames, setAiTraitNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Check which categorical traits have AI support
    async function checkAISupport() {
      const supported = new Set<string>();
      for (const tt of trialTraits) {
        if (tt.trait.data_type === 'categorical') {
          const has = await modelManager.hasAISupport(tt.trait.name);
          if (has) supported.add(tt.trait.name);
        }
      }
      setAiTraitNames(supported);
    }
    if (trialTraits.length > 0) checkAISupport();
  }, [trialTraits]);

  /**
   * Find the categorical trait that matches a given photo type.
   * Falls back to first AI-supported categorical trait if no photo_type match.
   */
  // Generic/fallback traits — deprioritize these in favor of specific disease traits
  const GENERIC_TRAITS = new Set(['disease_severity_general', 'sorghum_disease_type']);

  async function findTraitForPhoto(photoType: string): Promise<{ traitId: number; traitName: string } | null> {
    // First: find a specific (non-generic) trait whose manifest photo_type matches
    let genericFallback: { traitId: number; traitName: string } | null = null;
    for (const tt of trialTraits) {
      if (tt.trait.data_type !== 'categorical') continue;
      const entry = await modelManager.getTraitEntry(tt.trait.name);
      if (entry && entry.photo_type === photoType && !traitValues[tt.trait_id]) {
        if (GENERIC_TRAITS.has(tt.trait.name)) {
          genericFallback = genericFallback || { traitId: tt.trait_id, traitName: tt.trait.name };
          continue;
        }
        return { traitId: tt.trait_id, traitName: tt.trait.name };
      }
    }
    // Fallback: first AI-supported categorical trait without a value (prefer specific)
    for (const tt of trialTraits) {
      if (tt.trait.data_type !== 'categorical') continue;
      if (traitValues[tt.trait_id]) continue;
      if (GENERIC_TRAITS.has(tt.trait.name)) continue;
      if (aiTraitNames.has(tt.trait.name)) {
        return { traitId: tt.trait_id, traitName: tt.trait.name };
      }
    }
    // Last resort: generic trait
    return genericFallback;
  }

  // Disease class → severity trait name mapping
  const DISEASE_TO_TRAIT: Record<string, string> = {
    'anthracnose_and_red_rot': 'anthracnose_severity',
    'cereal_grain_molds': 'grain_mold_severity',
    'covered_kernel_smut': 'covered_smut_severity',
    'ergot': 'ergot_severity',
    'head_smut': 'head_smut_severity',
    'rust': 'rust_severity',
    'loose_smut': 'loose_smut_severity',
  };

  // Smart pipeline: Disease ID → find matching trait → run severity model
  async function handleImageCaptured(blob: Blob) {
    pendingBlobRef.current = blob;
    localResultRef.current = null;
    setAiLoading(true);
    setLastDiseaseId(null);
    setError('');
    console.log('[AI] Photo captured, starting smart pipeline...');
    console.log('[AI] Trial traits:', trialTraits.map(tt => `${tt.trait.name} (${tt.trait.data_type})`).join(', '));
    console.log('[AI] AI-supported traits:', Array.from(aiTraitNames).join(', ') || '(none)');

    try {
      // Step 1: Run disease identification model
      let matchedTraitName: string | null = null;
      let diseaseLabel = '';
      let diseaseConf = 0;

      try {
        console.log('[AI] Step 1: Running disease ID model...');
        const diseaseResult = await modelManager.classify('sorghum_disease_type', blob);
        if (diseaseResult) {
          const entry = await modelManager.getTraitEntry('sorghum_disease_type');
          diseaseLabel = entry?.tier1?.class_labels?.[diseaseResult.classIndex] || diseaseResult.classValue;
          diseaseConf = diseaseResult.confidence;
          matchedTraitName = DISEASE_TO_TRAIT[diseaseResult.classValue] || null;
          setLastDiseaseId({ disease: diseaseLabel, confidence: diseaseConf });
          console.log(`[AI] Disease ID: ${diseaseLabel} (${(diseaseConf * 100).toFixed(0)}%) → trait: ${matchedTraitName}`);
        } else {
          console.warn('[AI] Disease ID model returned null (model may not be loaded)');
        }
      } catch (err) {
        console.warn('[AI] Disease ID model failed:', err);
      }

      // Step 2: Find matching severity trait in the trial
      let target: { traitId: number; traitName: string } | null = null;

      if (matchedTraitName) {
        const tt = trialTraits.find(t => t.trait.name === matchedTraitName && !traitValues[t.trait_id])
          || trialTraits.find(t => t.trait.name === matchedTraitName);
        if (tt) {
          target = { traitId: tt.trait_id, traitName: tt.trait.name };
        }
      }

      // If disease ID succeeded but no matching trait in trial → show warning, stop
      if (diseaseLabel && matchedTraitName && !target) {
        const readableTrait = matchedTraitName.replace(/_/g, ' ');
        console.warn(`[AI] Disease "${diseaseLabel}" detected but trial has no "${matchedTraitName}" trait`);
        setError(`${diseaseLabel} detected, but this trial has no "${readableTrait}" trait. Add it to score severity.`);
        setAiLoading(false);
        return;
      }

      // If disease ID failed or returned no match, fall back to first available severity trait
      if (!target) {
        target = await findTraitForPhoto('panicle');
        if (!target) {
          // Try any AI trait even if already scored (prefer specific over generic)
          let genericFallback: { traitId: number; traitName: string } | null = null;
          for (const tt of trialTraits) {
            if (tt.trait.data_type !== 'categorical') continue;
            if (!aiTraitNames.has(tt.trait.name)) continue;
            if (GENERIC_TRAITS.has(tt.trait.name)) {
              genericFallback = genericFallback || { traitId: tt.trait_id, traitName: tt.trait.name };
              continue;
            }
            target = { traitId: tt.trait_id, traitName: tt.trait.name };
            break;
          }
          if (!target) target = genericFallback;
        }
        console.log('[AI] No disease match, using fallback trait:', target?.traitName || '(none found)');
      }

      if (!target) {
        console.error('[AI] No AI-supported categorical trait found in trial');
        setError('No AI-supported trait found. Add a disease severity trait to this trial.');
        setAiLoading(false);
        return;
      }

      classifyingTraitRef.current = target;
      console.log(`[AI] Step 3: Classifying severity for trait: ${target.traitName}`);

      // Step 3: Run severity model for matched trait
      const result = await classifyTrait(target.traitName, blob);
      localResultRef.current = result;

      setTraitValue(target.traitId, result.value);
      setAiResults(prev => ({
        ...prev,
        [target.traitId]: {
          value: result.value,
          confidence: result.confidence,
          reasoning: result.reasoning,
          disease: diseaseLabel || undefined,
          diseaseConf: diseaseConf || undefined,
        },
      }));

      if (!result.lowConfidence) {
        setAiLoading(false);
      }

      console.log(`[AI] Result: ${target.traitName} = ${result.value} (${(result.confidence * 100).toFixed(0)}%)`);
    } catch (err) {
      console.error('[AI] Smart pipeline failed:', err);
      setError(`AI analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      setAiLoading(false);
    }
  }

  // Phase 2: After upload completes, retry with API if local was low-confidence
  async function handleImageUploaded(image: PlotImage) {
    const target = classifyingTraitRef.current;
    if (!target) {
      setAiLoading(false);
      return;
    }

    const localResult = localResultRef.current;
    if (localResult && !localResult.lowConfidence) {
      setAiLoading(false);
      return;
    }

    setAiLoading(true);
    try {
      const blob = pendingBlobRef.current;
      if (blob) {
        const result = await classifyTrait(target.traitName, blob, image.id);
        setTraitValue(target.traitId, result.value);
        setAiResults(prev => ({
          ...prev,
          [target.traitId]: {
            value: result.value,
            confidence: result.confidence,
            reasoning: result.reasoning,
            disease: lastDiseaseId?.disease,
            diseaseConf: lastDiseaseId?.confidence,
          },
        }));
      }
    } catch (err) {
      console.error('[AI] Phase 2 failed:', err);
      // Keep local result if available
      if (!localResult) {
        setError(`AI prediction failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setAiLoading(false);
      pendingBlobRef.current = null;
      localResultRef.current = null;
      classifyingTraitRef.current = null;
    }
  }

  // Re-analyze same photo for a different trait
  async function reanalyzeForTrait(traitName: string) {
    const blob = pendingBlobRef.current;
    if (!blob) return;

    const tt = trialTraits.find(t => t.trait.name === traitName);
    if (!tt) return;

    setAiLoading(true);
    try {
      const result = await classifyTrait(traitName, blob);
      setTraitValue(tt.trait_id, result.value);
      setAiResults(prev => ({
        ...prev,
        [tt.trait_id]: {
          value: result.value,
          confidence: result.confidence,
          reasoning: result.reasoning,
          disease: lastDiseaseId?.disease,
          diseaseConf: lastDiseaseId?.confidence,
        },
      }));
      console.log(`[AI] Re-analyze: ${traitName} = ${result.value} (${(result.confidence * 100).toFixed(0)}%)`);
    } catch (err) {
      console.error(`[AI] Re-analyze failed for ${traitName}:`, err);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleFlagPlot(status: string) {
    const newStatus = plotStatus === status ? 'active' : status;
    try {
      await offlineApi.updatePlotStatus(tId, pId, newStatus);
      setPlotStatus(newStatus);
      refreshPending();
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
      await offlineApi.saveObservations(pId, {
        scoring_round_id: selectedRoundId ?? undefined,
        observations,
      });
      refreshPending();

      // Fire-and-forget: submit training samples for AI-supported categorical traits
      if (navigator.onLine) {
        for (const tt of trialTraits) {
          if (tt.trait.data_type !== 'categorical' || !aiTraitNames.has(tt.trait.name)) continue;
          const val = traitValues[tt.trait_id];
          if (!val) continue;
          const numVal = Number(val);
          if (numVal < 1 || numVal > 9) continue;

          // Detect if user overrode AI prediction
          const aiPrediction = aiResults[tt.trait_id] || null;
          const userCorrected = aiPrediction && aiPrediction.value !== val;
          const source = userCorrected ? 'user_corrected' : aiPrediction ? 'ai_confirmed' : 'user_label';

          // Get the photo type for this trait from manifest
          modelManager.getPhotoType(tt.trait.name).then(photoType => {
            api.getImages(pId, (photoType || 'panicle') as 'panicle' | 'full_plant').then(imgs => {
              if (imgs.length > 0) {
                api.submitTrainingSample(
                  imgs[0].id,
                  tt.trait.name,
                  String(numVal),
                  source,
                  aiPrediction?.value,
                  aiPrediction?.confidence,
                ).catch(() => {});
              }
            }).catch(() => {});
          }).catch(() => {});
        }
      }

      const roundName = rounds.find(r => r.id === selectedRoundId)?.name || '';
      const offlineTag = !online ? ' (offline)' : '';
      const savedMsg = `Saved Plot ${currentIndex + 1}${roundName ? ` · ${roundName}` : ''}${offlineTag}`;

      if (advance) {
        // Offline: simple sequential advance; Online: use server next-unscored
        let nextPlotId: number | null = null;
        if (online) {
          try {
            const result = await api.getNextUnscored(tId, pId, selectedRoundId ?? undefined);
            nextPlotId = result.next_plot_id;
          } catch {
            // Fallback to local next
          }
        }
        if (!nextPlotId && currentIndex < allPlots.length - 1) {
          nextPlotId = allPlots[currentIndex + 1].id;
        }

        if (nextPlotId && nextPlotId !== pId) {
          setSnackbar({ message: savedMsg, undoPlotId: pId, undoValues });
          const roundQuery = selectedRoundId ? `?round_id=${selectedRoundId}` : '';
          navigate(`/trials/${tId}/collect/${nextPlotId}${roundQuery}`, { replace: true });
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

  async function handleWalkModeChange(newMode: WalkMode) {
    setShowWalkPicker(false);
    try {
      await api.updateTrial(tId, { walk_mode: newMode });
      setWalkMode(newMode);
      const plots = await api.getPlots(tId, { walk_mode: newMode });
      setAllPlots(plots);
      const idx = plots.findIndex(p => p.id === pId);
      setCurrentIndex(idx);
    } catch {
      setError('Failed to change walk mode');
    }
  }

  function handleScanResult(raw: string) {
    const text = raw.trim();

    // 1. URL containing /collect/{id} or /plots/{id}
    const urlMatch = text.match(/\/(?:collect|plots)\/(\d+)/);
    if (urlMatch) {
      const id = Number(urlMatch[1]);
      const idx = allPlots.findIndex(p => p.id === id);
      if (idx >= 0) { goToPlot(idx); return; }
    }

    // 2. R{n}C{n} format (e.g. "R3C5" or "r3c5")
    const rcMatch = text.match(/^r(\d+)c(\d+)$/i);
    if (rcMatch) {
      const row = Number(rcMatch[1]);
      const col = Number(rcMatch[2]);
      const idx = allPlots.findIndex(p => p.row === row && p.column === col);
      if (idx >= 0) { goToPlot(idx); return; }
      setError(`No plot found at R${row}C${col}`);
      return;
    }

    // 3. Plain number → try plot_id then 1-based walk index
    const num = Number(text);
    if (!isNaN(num) && text !== '') {
      let idx = allPlots.findIndex(p => p.id === num);
      if (idx < 0 && num >= 1 && num <= allPlots.length) idx = num - 1;
      if (idx >= 0) { goToPlot(idx); return; }
    }

    setError(`Plot not found for scanned code: "${text}"`);
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
            <button
              onClick={() => setShowScanner(true)}
              className="ml-auto text-gray-400 hover:text-green-700 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
              title="Scan QR / barcode to jump to plot"
              aria-label="Scan QR code"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="5" height="5" rx="1" />
                <rect x="16" y="3" width="5" height="5" rx="1" />
                <rect x="3" y="16" width="5" height="5" rx="1" />
                <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
                <path d="M21 21v.01" />
                <path d="M12 7v3a2 2 0 0 1-2 2H7" />
                <path d="M3 12h.01" />
                <path d="M12 3h.01" />
                <path d="M12 16v.01" />
                <path d="M16 12h1" />
                <path d="M21 12v.01" />
                <path d="M12 21v-1" />
              </svg>
            </button>
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

        {/* AI Disease Analysis — one photo, full diagnosis */}
        {trialTraits.some(tt => tt.trait.data_type === 'categorical') && (
          <div className="mb-4 bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <label className="block text-sm font-semibold text-neutral">AI Disease Analysis</label>
              {aiTraitNames.size > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">
                  {aiTraitNames.size} model{aiTraitNames.size !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <ImageCapture plotId={pId} imageType="panicle" buttonLabel="Take Photo" onImageCaptured={handleImageCaptured} onImageUploaded={handleImageUploaded} />

            {/* AI loading spinner */}
            {aiLoading && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <span className="text-sm text-blue-700">
                  {lastDiseaseId ? `${lastDiseaseId.disease} detected, scoring severity...` : 'Analyzing photo...'}
                </span>
              </div>
            )}

            {/* AI results card */}
            {!aiLoading && Object.keys(aiResults).length > 0 && (
              <div className="mt-3 space-y-2">
                {/* Disease identification result */}
                {lastDiseaseId && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg border border-purple-200">
                    <span className="text-sm text-purple-700 font-medium">
                      Disease: <strong>{lastDiseaseId.disease}</strong>
                    </span>
                    <span className="text-xs text-purple-400">
                      {(lastDiseaseId.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                )}

                {/* Per-trait severity results */}
                {Object.entries(aiResults).map(([traitIdStr, result]) => {
                  const traitId = Number(traitIdStr);
                  const tt = trialTraits.find(t => t.trait_id === traitId);
                  if (!tt) return null;
                  const traitLabel = tt.trait.name.replace(/_/g, ' ');
                  const classLabels: string[] = tt.trait.category_labels ? JSON.parse(tt.trait.category_labels) : [];
                  const valueLabel = classLabels[Number(result.value) - 1] || `Score ${result.value}`;
                  const isLowConf = result.confidence < 0.7;

                  return (
                    <div
                      key={traitId}
                      className={`px-3 py-2 rounded-lg border ${isLowConf ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${isLowConf ? 'text-yellow-700' : 'text-blue-700'}`}>
                          <strong>{traitLabel}:</strong> {result.value} — {valueLabel}
                        </span>
                        <span className={`text-xs ${isLowConf ? 'text-yellow-400' : 'text-blue-400'}`}>
                          {(result.confidence * 100).toFixed(0)}%{isLowConf ? ' low' : ''}
                        </span>
                      </div>
                      {result.reasoning && (
                        <p className={`text-xs mt-1 ${isLowConf ? 'text-yellow-500' : 'text-blue-500'}`}>{result.reasoning}</p>
                      )}
                    </div>
                  );
                })}

                {/* Re-analyze dropdown */}
                {pendingBlobRef.current && (() => {
                  const unscoredAiTraits = trialTraits.filter(
                    tt => tt.trait.data_type === 'categorical' && aiTraitNames.has(tt.trait.name) && !aiResults[tt.trait_id]
                  );
                  if (unscoredAiTraits.length === 0) return null;
                  return (
                    <select
                      className="w-full mt-1 text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-600"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) reanalyzeForTrait(e.target.value);
                      }}
                    >
                      <option value="">Analyze for different trait...</option>
                      {unscoredAiTraits.map(tt => (
                        <option key={tt.trait_id} value={tt.trait.name}>
                          {tt.trait.name.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Dynamic trait inputs */}
        <div className="space-y-1">
          {trialTraits.map(tt => {
            const parsed = parseTrait(tt.trait);
            const isPlantHeight = tt.trait.name === 'plant_height';
            return (
              <div key={tt.trait_id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                {isPlantHeight && (
                  <div className="mb-2">
                    <label className="text-sm font-semibold text-gray-700 mb-2 block">
                      {parsed.label}
                      {parsed.unit && <span className="ml-1 text-gray-400 font-normal">({parsed.unit})</span>}
                    </label>
                    <HeightMeasure
                      plotId={pId}
                      plantHeight={traitValues[tt.trait_id] ?? ''}
                      onHeightChange={v => setTraitValue(tt.trait_id, v)}
                      heightPrediction={heightPrediction}
                      heightAiLoading={heightAiLoading}
                      heightAiError={heightAiError}
                      onHeightPrediction={setHeightPrediction}
                      onHeightAiLoading={setHeightAiLoading}
                      onHeightAiError={setHeightAiError}
                    />
                  </div>
                )}
                <TraitInput
                  trait={parsed}
                  value={traitValues[tt.trait_id] ?? ''}
                  previousValue={prevValues[tt.trait_id]}
                  onChange={v => setTraitValue(tt.trait_id, v)}
                  aiValue={aiResults[tt.trait_id]?.value}
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
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-1">
          <span>{currentIndex + 1} / {allPlots.length}</span>
          {selectedRoundId && rounds.length > 0 && (
            <span className="text-green-600">· {rounds.find(r => r.id === selectedRoundId)?.name}</span>
          )}
          <span className="text-gray-300">·</span>
          <button
            onClick={() => setShowWalkPicker(v => !v)}
            className="text-blue-500 hover:text-blue-700 font-medium"
          >
            {walkMode === 'serpentine' ? '↝' : walkMode === 'column_by_column' ? '↓' : walkMode === 'free' ? '·' : '→'}{' '}
            {walkMode.replace(/_/g, ' ')}
          </button>
        </div>
      </div>

      {/* QR scanner */}
      <QRScannerModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScanResult}
      />

      {/* Walk mode picker popover */}
      {showWalkPicker && (
        <div className="fixed bottom-20 left-0 right-0 z-50 px-4">
          <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">Walk Pattern</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { mode: 'serpentine' as WalkMode, label: 'Serpentine', icon: '↝', desc: 'Zigzag' },
                { mode: 'row_by_row' as WalkMode, label: 'Row-by-Row', icon: '→', desc: 'L→R each row' },
                { mode: 'column_by_column' as WalkMode, label: 'Column', icon: '↓', desc: 'Top→Bottom' },
                { mode: 'free' as WalkMode, label: 'Free', icon: '·', desc: 'No order' },
              ] as const).map(({ mode, label, icon, desc }) => (
                <button
                  key={mode}
                  onClick={() => handleWalkModeChange(mode)}
                  className={`p-2 rounded-lg border text-left text-sm transition-all ${
                    walkMode === mode
                      ? 'border-green-600 bg-green-50 text-green-700 font-semibold'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="text-base mr-1">{icon}</span> {label}
                  <span className="block text-xs text-gray-400">{desc}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowWalkPicker(false)}
              className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
