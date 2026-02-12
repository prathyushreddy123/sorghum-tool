import { useEffect, useRef, useState, useCallback } from 'react';
import type { ClinometerStep } from '../types';

interface ClinometerOverlayProps {
  open: boolean;
  onClose: () => void;
  onMeasured: (heightCm: number) => void;
}

const BUFFER_SIZE = 30;

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 999;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length);
}

export default function ClinometerOverlay({ open, onClose, onMeasured }: ClinometerOverlayProps) {
  const [step, setStep] = useState<ClinometerStep>('distance');
  const [distance, setDistance] = useState(3);
  const [baseAngle, setBaseAngle] = useState<number | null>(null);
  const [topAngle, setTopAngle] = useState<number | null>(null);
  const [liveAngle, setLiveAngle] = useState<number | null>(null);
  const [stable, setStable] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [sensorUnavailable, setSensorUnavailable] = useState(false);
  const angleBuffer = useRef<number[]>([]);
  const listenerActive = useRef(false);

  const calculatedHeight =
    baseAngle !== null && topAngle !== null
      ? Math.round(
          distance *
            (Math.tan((topAngle * Math.PI) / 180) -
              Math.tan((baseAngle * Math.PI) / 180)) *
            100
        )
      : null;

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    if (event.beta === null) return;
    const elevation = 90 - event.beta;
    angleBuffer.current.push(elevation);
    if (angleBuffer.current.length > BUFFER_SIZE) {
      angleBuffer.current.shift();
    }
    const avg =
      angleBuffer.current.reduce((a, b) => a + b, 0) /
      angleBuffer.current.length;
    setLiveAngle(Math.round(avg * 10) / 10);
    setStable(angleBuffer.current.length >= 10 && stdDev(angleBuffer.current) < 1.5);
  }, []);

  const startListening = useCallback(async () => {
    if (listenerActive.current) return;

    // iOS permission
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      try {
        const perm = await (DeviceOrientationEvent as any).requestPermission();
        if (perm !== 'granted') {
          setPermissionDenied(true);
          return;
        }
      } catch {
        setPermissionDenied(true);
        return;
      }
    }

    // Check if sensor exists by waiting briefly for an event
    let received = false;
    const testHandler = () => { received = true; };
    window.addEventListener('deviceorientation', testHandler);
    await new Promise((r) => setTimeout(r, 500));
    window.removeEventListener('deviceorientation', testHandler);

    if (!received && !('DeviceOrientationEvent' in window)) {
      setSensorUnavailable(true);
      return;
    }

    window.addEventListener('deviceorientation', handleOrientation);
    listenerActive.current = true;
  }, [handleOrientation]);

  const stopListening = useCallback(() => {
    window.removeEventListener('deviceorientation', handleOrientation);
    listenerActive.current = false;
  }, [handleOrientation]);

  // Start/stop sensor based on step
  useEffect(() => {
    if (open && (step === 'base' || step === 'top')) {
      angleBuffer.current = [];
      setLiveAngle(null);
      setStable(false);
      startListening();
    } else {
      stopListening();
    }
    return stopListening;
  }, [open, step, startListening, stopListening]);

  // Reset state when overlay opens
  useEffect(() => {
    if (open) {
      setStep('distance');
      setDistance(3);
      setBaseAngle(null);
      setTopAngle(null);
      setLiveAngle(null);
      setStable(false);
      setPermissionDenied(false);
      setSensorUnavailable(false);
      angleBuffer.current = [];
    }
  }, [open]);

  function lockAngle() {
    if (angleBuffer.current.length < 5) return;
    const locked = Math.round(median(angleBuffer.current) * 10) / 10;
    if (step === 'base') {
      setBaseAngle(locked);
      setStep('top');
    } else if (step === 'top') {
      if (baseAngle !== null && locked <= baseAngle) {
        // Top must be higher than base
        return;
      }
      setTopAngle(locked);
      setStep('result');
    }
    try { navigator.vibrate?.(50); } catch { /* ignore */ }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: step === 'base' || step === 'top' ? '#111' : '#fff' }}>
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 text-white text-xl"
        aria-label="Close"
      >
        &times;
      </button>

      {/* Step: Distance */}
      {step === 'distance' && (
        <div className="flex-1 flex flex-col justify-center px-6">
          <h3 className="text-xl font-bold text-neutral mb-2 text-center">Measure Plant Height</h3>
          <p className="text-sm text-gray-500 text-center mb-8">
            Stand at a known distance from the plant, then point your phone at the base and top.
          </p>

          <label className="block text-sm font-medium text-neutral mb-2">
            Distance from plant (meters)
          </label>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
            className="w-full mb-2"
          />
          <div className="flex items-center gap-3 mb-8">
            <input
              type="number"
              min={0.5}
              max={20}
              step={0.1}
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value) || 1)}
              className="w-24 px-3 py-3 border border-gray-300 rounded-lg text-base text-center"
            />
            <span className="text-gray-500">meters</span>
          </div>

          <button
            onClick={() => setStep('base')}
            disabled={distance < 0.5}
            className="w-full py-4 bg-primary text-white rounded-lg font-semibold text-lg min-h-[56px] disabled:opacity-50"
          >
            Next — Point at Base
          </button>
        </div>
      )}

      {/* Steps: Base and Top */}
      {(step === 'base' || step === 'top') && (
        <div className="flex-1 flex flex-col text-white">
          {/* Instruction */}
          <div className="pt-16 px-6 text-center">
            <p className="text-lg font-medium">
              {step === 'base'
                ? 'Aim at the BASE of the plant'
                : 'Aim at the TOP of the plant'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Hold phone upright like a viewfinder
            </p>
          </div>

          {/* Crosshair + angle */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {permissionDenied && (
              <div className="px-6 text-center">
                <p className="text-yellow-400 font-medium mb-2">Motion sensor access denied</p>
                <p className="text-sm text-gray-400">
                  Enable in Settings &gt; Safari &gt; Motion &amp; Orientation Access
                </p>
              </div>
            )}

            {sensorUnavailable && (
              <div className="px-6 text-center">
                <p className="text-yellow-400 font-medium">Motion sensors not available</p>
                <p className="text-sm text-gray-400 mt-1">This feature requires a phone with a gyroscope</p>
              </div>
            )}

            {!permissionDenied && !sensorUnavailable && (
              <>
                {/* Crosshair */}
                <svg width="80" height="80" viewBox="0 0 80 80" className="mb-4 opacity-60">
                  <line x1="40" y1="0" x2="40" y2="80" stroke="white" strokeWidth="1" />
                  <line x1="0" y1="40" x2="80" y2="40" stroke="white" strokeWidth="1" />
                  <circle cx="40" cy="40" r="16" stroke="white" strokeWidth="1" fill="none" />
                </svg>

                {/* Live angle */}
                <div className="text-5xl font-mono font-bold tabular-nums">
                  {liveAngle !== null ? `${liveAngle > 0 ? '+' : ''}${liveAngle.toFixed(1)}°` : '—'}
                </div>

                {/* Stability indicator */}
                <div className={`mt-3 text-sm ${stable ? 'text-green-400' : 'text-yellow-400'}`}>
                  {liveAngle === null
                    ? 'Waiting for sensor...'
                    : stable
                      ? 'Steady — tap to lock'
                      : 'Hold phone steady...'}
                </div>

                {step === 'top' && baseAngle !== null && liveAngle !== null && liveAngle <= baseAngle && (
                  <p className="mt-2 text-sm text-red-400">Aim higher than the base angle ({baseAngle}°)</p>
                )}
              </>
            )}
          </div>

          {/* Lock button */}
          <div className="px-6 pb-8">
            {step === 'base' && baseAngle === null && (
              <p className="text-xs text-gray-500 text-center mb-2">
                Distance: {distance}m
              </p>
            )}
            {step === 'top' && baseAngle !== null && (
              <p className="text-xs text-gray-500 text-center mb-2">
                Base locked at {baseAngle}° &middot; Distance: {distance}m
              </p>
            )}
            <button
              onClick={lockAngle}
              disabled={
                liveAngle === null ||
                permissionDenied ||
                sensorUnavailable ||
                (step === 'top' && baseAngle !== null && liveAngle !== null && liveAngle <= baseAngle)
              }
              className="w-full py-4 bg-primary text-white rounded-lg font-semibold text-lg min-h-[56px] disabled:opacity-30"
            >
              {step === 'base' ? 'Lock Base Angle' : 'Lock Top Angle'}
            </button>
          </div>
        </div>
      )}

      {/* Step: Result */}
      {step === 'result' && calculatedHeight !== null && (
        <div className="flex-1 flex flex-col justify-center px-6">
          <div className="text-center mb-8">
            <p className="text-sm text-gray-500 mb-1">Estimated Height</p>
            <p className="text-6xl font-bold text-primary tabular-nums">
              {calculatedHeight}
              <span className="text-2xl text-gray-500 ml-1">cm</span>
            </p>
          </div>

          {(calculatedHeight < 50 || calculatedHeight > 400) && (
            <div className="mb-4 px-3 py-2 bg-yellow-50 rounded-lg border border-yellow-300 text-center">
              <span className="text-sm text-yellow-800">
                Outside typical sorghum range (50-400cm). Check distance and angles.
              </span>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-600">
            <p>Distance: {distance}m</p>
            <p>Base angle: {baseAngle}°</p>
            <p>Top angle: {topAngle}°</p>
          </div>

          <button
            onClick={() => {
              onMeasured(calculatedHeight);
              onClose();
            }}
            className="w-full py-4 bg-primary text-white rounded-lg font-semibold text-lg min-h-[56px] mb-3"
          >
            Use This Height
          </button>

          <button
            onClick={() => {
              setBaseAngle(null);
              setTopAngle(null);
              setStep('distance');
            }}
            className="w-full py-3 bg-card text-neutral rounded-lg font-medium min-h-[48px] border border-gray-300"
          >
            Re-measure
          </button>
        </div>
      )}
    </div>
  );
}
