import { modelManager } from './modelManager';
import type { LocalPrediction } from './modelManager';
import { clipClassifier } from './clipClassifier';
import { api } from '../api/client';

export interface ClassificationResult {
  value: string;          // the predicted class value (e.g. "1", "2", "3")
  confidence: number;
  reasoning: string;
  provider: 'local' | 'api';
  lowConfidence: boolean;
}

/**
 * Classify a categorical trait using the tiered strategy:
 *   Tier 1: Fine-tuned ONNX model (if exists for this trait)
 *   Tier 2: CLIP zero-shot (MobileCLIP2-S0 via precomputed text embeddings)
 *   Tier 3: API fallback (Gemini/Groq)
 *
 * @param traitName - The trait slug (e.g. "ergot_severity", "anthracnose_severity")
 * @param blob      - The compressed image blob
 * @param imageId   - Optional server image ID (needed for API fallback)
 */
export async function classifyTrait(
  traitName: string,
  blob: Blob,
  imageId?: number,
): Promise<ClassificationResult> {
  const threshold = await modelManager.getConfidenceThreshold(traitName);
  const entry = await modelManager.getTraitEntry(traitName);

  // ── Tier 1: Fine-tuned ONNX model ──────────────────────────────────────
  let localResult: LocalPrediction | null = null;
  if (entry?.tier1) {
    try {
      localResult = await modelManager.classify(traitName, blob);
    } catch (err) {
      console.warn(`[classifierService] Tier 1 failed for ${traitName}:`, err);
    }

    if (localResult && localResult.confidence >= threshold) {
      return {
        value: localResult.classValue,
        confidence: localResult.confidence,
        reasoning: `Local model (${(localResult.confidence * 100).toFixed(0)}% confidence)`,
        provider: 'local',
        lowConfidence: false,
      };
    }
  }

  // ── Tier 2: CLIP zero-shot ─────────────────────────────────────────────
  if (entry?.tier2_labels) {
    try {
      const clipResult = await clipClassifier.classify(traitName, blob);
      if (clipResult && clipResult.confidence >= (threshold * 0.8)) {
        // Accept CLIP at slightly lower threshold than Tier 1 (80% of threshold)
        return {
          value: clipResult.classValue,
          confidence: clipResult.confidence,
          reasoning: `CLIP zero-shot (${(clipResult.confidence * 100).toFixed(0)}% confidence)`,
          provider: 'local',
          lowConfidence: clipResult.confidence < threshold,
        };
      }
      // Store CLIP result as fallback if API also fails
      if (clipResult && (!localResult || clipResult.confidence > localResult.confidence)) {
        localResult = clipResult;
      }
    } catch (err) {
      console.warn(`[classifierService] Tier 2 CLIP failed for ${traitName}:`, err);
    }
  }

  // ── Tier 3: API fallback ───────────────────────────────────────────────
  if (navigator.onLine && imageId) {
    try {
      // Currently the API endpoint only supports severity prediction.
      // For ergot_severity, use the existing endpoint.
      // Other traits will use a generalized endpoint in the future.
      if (traitName === 'ergot_severity') {
        const apiResult = await api.predictSeverity(imageId);
        if (apiResult.severity >= 1) {
          return {
            value: String(apiResult.severity),
            confidence: apiResult.confidence,
            reasoning: apiResult.reasoning,
            provider: 'api',
            lowConfidence: false,
          };
        }
      }
      // TODO: Generalized API endpoint for other traits (Phase 4 — RunPod)
    } catch (err) {
      console.warn(`[classifierService] Tier 3 API failed for ${traitName}:`, err);
    }
  }

  // ── Fallback: return local result even with low confidence ─────────────
  if (localResult) {
    return {
      value: localResult.classValue,
      confidence: localResult.confidence,
      reasoning: `Local model (${(localResult.confidence * 100).toFixed(0)}% confidence — low confidence)`,
      provider: 'local',
      lowConfidence: true,
    };
  }

  throw new Error(`Classification unavailable for ${traitName}: no local model and no API connection`);
}

// ── Legacy wrapper for backward compat (used in ObservationEntry) ────────

/**
 * @deprecated Use classifyTrait() with explicit trait name instead.
 * Kept for backward compatibility during migration.
 */
export async function classifySeverity(
  blob: Blob,
  imageId?: number,
): Promise<ClassificationResult> {
  return classifyTrait('ergot_severity', blob, imageId);
}

/** Preload models for the given trait names (Tier 1 + CLIP). */
export async function preloadModels(traitNames: string[]): Promise<void> {
  await Promise.allSettled([
    modelManager.preloadModels(traitNames),
    clipClassifier.preload(traitNames),
  ]);
}

/** Check if a trait has any AI support. */
export async function hasAISupport(traitName: string): Promise<boolean> {
  return modelManager.hasAISupport(traitName);
}

export { modelManager };
