import { classify, isModelLoaded, loadModel } from './localClassifier';
import { api } from '../api/client';

const CONFIDENCE_THRESHOLD = 0.70;

export interface ClassificationResult {
  severity: number; // 1-5
  confidence: number;
  reasoning: string;
  provider: 'local' | 'api';
  lowConfidence: boolean;
}

/**
 * Classify ergot severity using local model first, API fallback second.
 *
 * Flow:
 *  1. Try local ONNX model on the blob
 *  2. If confidence >= 0.70 → return local result
 *  3. If confidence < 0.70 AND online AND imageId available → try API
 *  4. If offline or API fails → return local result with low-confidence warning
 */
export async function classifySeverity(
  blob: Blob,
  imageId?: number,
): Promise<ClassificationResult> {
  // Try local model
  let localResult: Awaited<ReturnType<typeof classify>> | null = null;
  try {
    localResult = await classify(blob);
  } catch (err) {
    console.warn('[classifierService] Local model failed:', err);
  }

  // If local model succeeded with high confidence, use it
  if (localResult && localResult.confidence >= CONFIDENCE_THRESHOLD) {
    return {
      severity: localResult.severity,
      confidence: localResult.confidence,
      reasoning: `Local model (${(localResult.confidence * 100).toFixed(0)}% confidence)`,
      provider: 'local',
      lowConfidence: false,
    };
  }

  // Try API fallback if online and we have an image ID
  if (navigator.onLine && imageId) {
    try {
      const apiResult = await api.predictSeverity(imageId);
      if (apiResult.severity >= 1) {
        return {
          severity: apiResult.severity,
          confidence: apiResult.confidence,
          reasoning: apiResult.reasoning,
          provider: 'api',
          lowConfidence: false,
        };
      }
    } catch (err) {
      console.warn('[classifierService] API fallback failed:', err);
    }
  }

  // Use local result even with low confidence (best effort)
  if (localResult) {
    return {
      severity: localResult.severity,
      confidence: localResult.confidence,
      reasoning: `Local model (${(localResult.confidence * 100).toFixed(0)}% confidence — low confidence)`,
      provider: 'local',
      lowConfidence: true,
    };
  }

  // No model available and no API — throw
  throw new Error('Classification unavailable: no local model and no API connection');
}

/** Preload the local model so first classification is fast. */
export async function preloadModel(): Promise<void> {
  try {
    await loadModel();
  } catch {
    // Model not available yet — that's fine, will fall back to API
  }
}

export { isModelLoaded };
