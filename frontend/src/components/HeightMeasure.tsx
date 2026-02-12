import { useState } from 'react';
import { api } from '../api/client';
import type { PlotImage, HeightPrediction } from '../types';
import ImageCapture from './ImageCapture';
import ClinometerOverlay from './ClinometerOverlay';

interface HeightMeasureProps {
  plotId: number;
  plantHeight: string;
  onHeightChange: (height: string) => void;
  heightPrediction: HeightPrediction | null;
  heightAiLoading: boolean;
  heightAiError: boolean;
  onHeightPrediction: (prediction: HeightPrediction | null) => void;
  onHeightAiLoading: (loading: boolean) => void;
  onHeightAiError: (error: boolean) => void;
}

export default function HeightMeasure({
  plotId,
  plantHeight,
  onHeightChange,
  heightPrediction,
  heightAiLoading,
  heightAiError,
  onHeightPrediction,
  onHeightAiLoading,
  onHeightAiError,
}: HeightMeasureProps) {
  const [showClinometer, setShowClinometer] = useState(false);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [clinometerResult, setClinometerResult] = useState<number | null>(null);

  function handleClinometerResult(heightCm: number) {
    setClinometerResult(heightCm);
    onHeightChange(String(heightCm));
  }

  async function handleFullPlantImageUploaded(image: PlotImage) {
    if (plantHeight) return; // already has a value

    onHeightAiLoading(true);
    onHeightAiError(false);
    try {
      const prediction = await api.predictHeight(image.id);
      onHeightPrediction(prediction);
      if (prediction.height_cm >= 50) {
        onHeightChange(String(prediction.height_cm));
      }
    } catch {
      onHeightPrediction(null);
      onHeightAiError(true);
    } finally {
      onHeightAiLoading(false);
    }
  }

  return (
    <>
      {/* Two method buttons */}
      <div className="flex gap-3 mb-3">
        <button
          onClick={() => setShowClinometer(true)}
          className="flex-1 py-3 bg-card text-primary rounded-lg font-medium min-h-[48px] border-2 border-primary flex items-center justify-center gap-2 text-sm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12" y2="18.01" />
          </svg>
          Measure with Phone
        </button>
        <button
          onClick={() => setShowPhotoCapture(!showPhotoCapture)}
          className={`flex-1 py-3 rounded-lg font-medium min-h-[48px] border-2 flex items-center justify-center gap-2 text-sm ${
            showPhotoCapture
              ? 'bg-primary text-white border-primary'
              : 'bg-card text-primary border-primary'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Estimate from Photo
        </button>
      </div>

      {/* Clinometer result */}
      {clinometerResult !== null && !heightAiLoading && (
        <div className="mb-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between">
          <span className="text-sm text-blue-700">
            Clinometer: <strong>{clinometerResult} cm</strong>
          </span>
          <button
            onClick={() => setShowClinometer(true)}
            className="text-xs text-blue-500 underline"
          >
            re-measure
          </button>
        </div>
      )}

      {/* AI Height Prediction Status */}
      {heightAiLoading && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
          <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-sm text-blue-700">Estimating height...</span>
        </div>
      )}

      {heightPrediction && !heightAiLoading && heightPrediction.height_cm === 0 && (
        <div className="mb-3 px-3 py-2 bg-yellow-50 rounded-lg border border-yellow-300">
          <span className="text-sm text-yellow-800 font-medium">Could not estimate height</span>
          {heightPrediction.reasoning && (
            <p className="text-xs text-yellow-600 mt-1">{heightPrediction.reasoning}</p>
          )}
          <p className="text-xs text-yellow-600 mt-1">Enter height manually below.</p>
        </div>
      )}

      {heightPrediction && !heightAiLoading && heightPrediction.height_cm >= 50 && (
        <div className="mb-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
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
        <div className="mb-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
          <span className="text-sm text-gray-500">
            AI height estimation unavailable. Enter manually below.
          </span>
        </div>
      )}

      {/* Photo capture (toggled) */}
      {showPhotoCapture && (
        <div className="mb-3">
          <ImageCapture
            plotId={plotId}
            imageType="full_plant"
            buttonLabel="Take Full-Plant Photo"
            helpText="Include a person or reference object if possible"
            onImageUploaded={handleFullPlantImageUploaded}
          />
        </div>
      )}

      {/* Clinometer overlay */}
      <ClinometerOverlay
        open={showClinometer}
        onClose={() => setShowClinometer(false)}
        onMeasured={handleClinometerResult}
      />
    </>
  );
}
