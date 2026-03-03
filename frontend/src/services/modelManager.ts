import * as ort from 'onnxruntime-web';

// ─── Manifest Types ──────────────────────────────────────────────────────────

export interface Tier1Model {
  url: string;
  version: string;
  size_mb: number;
  accuracy: number | null;
  classes: string[];
  class_labels?: string[];
  input_size: number;
  confidence_threshold: number;
}

export interface TraitModelEntry {
  tier1: Tier1Model | null;
  tier2_labels: Record<string, string> | null;
  tier3: string | null;
  photo_type: string;
}

export interface ModelManifest {
  version: string;
  models: Record<string, TraitModelEntry>;
  clip_model: {
    url: string;
    version: string;
    size_mb: number;
    input_size: number;
    embedding_dim: number;
  } | null;
}

export interface LocalPrediction {
  classIndex: number;       // 0-based index into classes array
  classValue: string;       // the class value (e.g. "1", "2", "3")
  confidence: number;       // 0-1
  allScores: number[];      // softmax for all classes
}

export type ModelStatus = 'not_available' | 'downloading' | 'ready' | 'error';

// ─── ImageNet normalization ──────────────────────────────────────────────────

const MEAN = [0.485, 0.456, 0.406];
const STD  = [0.229, 0.224, 0.225];

// ─── ModelManager ────────────────────────────────────────────────────────────

class ModelManager {
  private manifest: ModelManifest | null = null;
  private manifestPromise: Promise<ModelManifest> | null = null;
  private sessions = new Map<string, ort.InferenceSession>();
  private loading  = new Map<string, Promise<ort.InferenceSession>>();
  private statusListeners = new Set<() => void>();

  // ── Manifest ───────────────────────────────────────────────────────────────

  /** Fetch the model manifest (cached after first call). */
  async getManifest(): Promise<ModelManifest> {
    if (this.manifest) return this.manifest;
    if (this.manifestPromise) return this.manifestPromise;

    const manifestUrl = import.meta.env.VITE_MANIFEST_URL || '/models/manifest.json';
    console.log(`[modelManager] Fetching manifest from: ${manifestUrl}`);
    this.manifestPromise = fetch(manifestUrl)
      .then(res => {
        if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
        return res.json() as Promise<ModelManifest>;
      })
      .then(m => {
        console.log(`[modelManager] Manifest loaded: ${Object.keys(m.models).length} models`);
        this.manifest = m;
        return m;
      })
      .catch(err => {
        console.error(`[modelManager] Manifest fetch failed:`, err);
        this.manifestPromise = null;
        throw err;
      });

    return this.manifestPromise;
  }

  /** Get the manifest entry for a trait (by trait name/slug, optionally scoped by crop). */
  async getTraitEntry(traitName: string, crop?: string): Promise<TraitModelEntry | null> {
    try {
      const manifest = await this.getManifest();
      // Try crop-specific key first (e.g. "maize/gray_leaf_spot"), then bare trait name
      if (crop && crop !== 'sorghum') {
        const cropKey = `${crop}/${traitName}`;
        if (manifest.models[cropKey]) return manifest.models[cropKey];
      }
      return manifest.models[traitName] ?? null;
    } catch {
      return null;
    }
  }

  /** Check if a trait has any AI support (any tier). */
  async hasAISupport(traitName: string): Promise<boolean> {
    const entry = await this.getTraitEntry(traitName);
    if (!entry) return false;
    return !!(entry.tier1 || entry.tier2_labels || entry.tier3);
  }

  /** Get the photo type required for a trait's AI classification. */
  async getPhotoType(traitName: string): Promise<string | null> {
    const entry = await this.getTraitEntry(traitName);
    return entry?.photo_type ?? null;
  }

  // ── Model Loading ──────────────────────────────────────────────────────────

  /** Get the status of a trait's Tier 1 model. */
  getModelStatus(traitName: string): ModelStatus {
    if (this.sessions.has(traitName)) return 'ready';
    if (this.loading.has(traitName)) return 'downloading';
    // Check if manifest says a model exists
    if (this.manifest?.models[traitName]?.tier1) return 'not_available';
    return 'not_available';
  }

  /** Load a Tier 1 ONNX model for a trait. Returns null if no model exists. */
  async loadModel(traitName: string): Promise<ort.InferenceSession | null> {
    // Already loaded
    if (this.sessions.has(traitName)) return this.sessions.get(traitName)!;

    // Already loading
    if (this.loading.has(traitName)) return this.loading.get(traitName)!;

    // Check manifest
    const entry = await this.getTraitEntry(traitName);
    if (!entry?.tier1) return null;

    console.log(`[modelManager] Loading ONNX model for ${traitName}: ${entry.tier1.url} (${entry.tier1.size_mb}MB)`);
    const promise = ort.InferenceSession.create(entry.tier1.url, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }).then(session => {
      console.log(`[modelManager] Model loaded: ${traitName}`);
      this.sessions.set(traitName, session);
      this.loading.delete(traitName);
      this.notifyListeners();
      return session;
    }).catch(err => {
      console.error(`[modelManager] Model load failed for ${traitName}:`, err);
      this.loading.delete(traitName);
      this.notifyListeners();
      throw err;
    });

    this.loading.set(traitName, promise);
    this.notifyListeners();
    return promise;
  }

  /** Preload Tier 1 models for a set of trait names. Fire-and-forget. */
  async preloadModels(traitNames: string[]): Promise<void> {
    const manifest = await this.getManifest().catch(() => null);
    if (!manifest) return;

    const toLoad = traitNames.filter(name => manifest.models[name]?.tier1 && !this.sessions.has(name));

    await Promise.allSettled(toLoad.map(name => this.loadModel(name)));
  }

  /** Check if a specific model is loaded and ready. */
  isModelReady(traitName: string): boolean {
    return this.sessions.has(traitName);
  }

  // ── Inference ──────────────────────────────────────────────────────────────

  /**
   * Run Tier 1 inference on a blob for a given trait.
   * Returns null if no model exists for this trait.
   */
  async classify(traitName: string, blob: Blob): Promise<LocalPrediction | null> {
    const entry = await this.getTraitEntry(traitName);
    if (!entry?.tier1) return null;

    const session = await this.loadModel(traitName);
    if (!session) return null;

    const inputSize = entry.tier1.input_size;
    const inputTensor = await preprocessImage(blob, inputSize);

    const inputName = session.inputNames[0];
    const results = await session.run({ [inputName]: inputTensor });
    const outputName = session.outputNames[0];
    const logits = results[outputName].data as Float32Array;

    const scores = softmax(logits);
    const maxIdx = scores.indexOf(Math.max(...scores));

    return {
      classIndex: maxIdx,
      classValue: entry.tier1.classes[maxIdx],
      confidence: scores[maxIdx],
      allScores: scores,
    };
  }

  /** Get the confidence threshold for a trait's Tier 1 model. */
  async getConfidenceThreshold(traitName: string): Promise<number> {
    const entry = await this.getTraitEntry(traitName);
    return entry?.tier1?.confidence_threshold ?? 0.70;
  }

  // ── Status listeners ───────────────────────────────────────────────────────

  /** Subscribe to model status changes (loading/ready). Returns unsubscribe fn. */
  onStatusChange(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private notifyListeners() {
    this.statusListeners.forEach(fn => fn());
  }
}

// ─── Image preprocessing ─────────────────────────────────────────────────────

async function preprocessImage(blob: Blob, inputSize: number): Promise<ort.Tensor> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(inputSize, inputSize);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, inputSize, inputSize);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, inputSize, inputSize);
  const { data } = imageData;

  const floats = new Float32Array(3 * inputSize * inputSize);
  const pixelCount = inputSize * inputSize;

  for (let i = 0; i < pixelCount; i++) {
    const ri = i * 4;
    floats[i]                    = (data[ri]     / 255 - MEAN[0]) / STD[0];
    floats[pixelCount + i]       = (data[ri + 1] / 255 - MEAN[1]) / STD[1];
    floats[2 * pixelCount + i]   = (data[ri + 2] / 255 - MEAN[2]) / STD[2];
  }

  return new ort.Tensor('float32', floats, [1, 3, inputSize, inputSize]);
}

function softmax(logits: Float32Array | number[]): number[] {
  const max = Math.max(...logits);
  const exps = Array.from(logits, v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

// ─── Singleton export ────────────────────────────────────────────────────────

export const modelManager = new ModelManager();
