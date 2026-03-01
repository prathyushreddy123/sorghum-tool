import * as ort from 'onnxruntime-web';
import { modelManager } from './modelManager';
import type { LocalPrediction } from './modelManager';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TraitEmbeddings {
  trait: string;
  classes: string[];
  labels: string[];
  embeddings: number[][];
  embedding_dim: number;
}

// ─── CLIP normalization (same as open_clip default) ─────────────────────────

const MEAN = [0.485, 0.456, 0.406];
const STD  = [0.229, 0.224, 0.225];

// ─── CLIPClassifier ─────────────────────────────────────────────────────────

class CLIPClassifier {
  private session: ort.InferenceSession | null = null;
  private sessionPromise: Promise<ort.InferenceSession> | null = null;
  private embeddingsCache = new Map<string, TraitEmbeddings>();
  private embeddingsLoading = new Map<string, Promise<TraitEmbeddings>>();

  /** Load the CLIP vision ONNX model (singleton). */
  private async getSession(): Promise<ort.InferenceSession | null> {
    if (this.session) return this.session;
    if (this.sessionPromise) return this.sessionPromise;

    const manifest = await modelManager.getManifest().catch(() => null);
    if (!manifest?.clip_model) return null;

    this.sessionPromise = ort.InferenceSession.create(manifest.clip_model.url, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }).then(sess => {
      this.session = sess;
      return sess;
    }).catch(err => {
      this.sessionPromise = null;
      throw err;
    });

    return this.sessionPromise;
  }

  /** Load precomputed text embeddings for a trait. */
  private async getEmbeddings(traitName: string): Promise<TraitEmbeddings | null> {
    if (this.embeddingsCache.has(traitName)) return this.embeddingsCache.get(traitName)!;
    if (this.embeddingsLoading.has(traitName)) return this.embeddingsLoading.get(traitName)!;

    const modelsBase = import.meta.env.VITE_MODELS_BASE_URL || '/models';
    const promise = fetch(`${modelsBase}/clip-embeddings/${traitName}.json`)
      .then(res => {
        if (!res.ok) throw new Error(`Embeddings fetch failed: ${res.status}`);
        return res.json() as Promise<TraitEmbeddings>;
      })
      .then(data => {
        this.embeddingsCache.set(traitName, data);
        this.embeddingsLoading.delete(traitName);
        return data;
      })
      .catch(err => {
        this.embeddingsLoading.delete(traitName);
        throw err;
      });

    this.embeddingsLoading.set(traitName, promise);
    return promise;
  }

  /** Check if CLIP classification is available for a trait. */
  async isAvailable(traitName: string): Promise<boolean> {
    const entry = await modelManager.getTraitEntry(traitName);
    if (!entry?.tier2_labels) return false;
    const manifest = await modelManager.getManifest().catch(() => null);
    return !!manifest?.clip_model;
  }

  /** Preload the CLIP model and embeddings for given traits. */
  async preload(traitNames: string[]): Promise<void> {
    const available = await Promise.all(
      traitNames.map(async name => ({ name, ok: await this.isAvailable(name) }))
    );
    const toLoad = available.filter(a => a.ok).map(a => a.name);
    if (toLoad.length === 0) return;

    // Load model + all embeddings in parallel
    await Promise.allSettled([
      this.getSession(),
      ...toLoad.map(name => this.getEmbeddings(name)),
    ]);
  }

  /**
   * Classify an image blob for a given trait using CLIP zero-shot.
   * Returns null if CLIP is not available for this trait.
   */
  async classify(traitName: string, blob: Blob): Promise<LocalPrediction | null> {
    const [session, embeddings] = await Promise.all([
      this.getSession(),
      this.getEmbeddings(traitName).catch(() => null),
    ]);

    if (!session || !embeddings) return null;

    const manifest = await modelManager.getManifest();
    const inputSize = manifest.clip_model!.input_size;

    // Preprocess image
    const inputTensor = await preprocessImage(blob, inputSize);

    // Run vision encoder
    const inputName = session.inputNames[0];
    const results = await session.run({ [inputName]: inputTensor });
    const outputName = session.outputNames[0];
    const imageEmbedding = results[outputName].data as Float32Array;

    // Compute cosine similarities (both are already L2-normalized)
    const similarities: number[] = embeddings.embeddings.map(textEmb => {
      let dot = 0;
      for (let i = 0; i < textEmb.length; i++) {
        dot += imageEmbedding[i] * textEmb[i];
      }
      return dot;
    });

    // Softmax over similarities (temperature-scaled)
    const temperature = 0.01; // sharp softmax for cosine similarities in [-1, 1]
    const scores = softmaxWithTemp(similarities, temperature);
    const maxIdx = scores.indexOf(Math.max(...scores));

    return {
      classIndex: maxIdx,
      classValue: embeddings.classes[maxIdx],
      confidence: scores[maxIdx],
      allScores: scores,
    };
  }
}

// ─── Image preprocessing ──────────────────────────────────────────────────────

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
    floats[i]                  = (data[ri]     / 255 - MEAN[0]) / STD[0];
    floats[pixelCount + i]     = (data[ri + 1] / 255 - MEAN[1]) / STD[1];
    floats[2 * pixelCount + i] = (data[ri + 2] / 255 - MEAN[2]) / STD[2];
  }

  return new ort.Tensor('float32', floats, [1, 3, inputSize, inputSize]);
}

function softmaxWithTemp(values: number[], temperature: number): number[] {
  const scaled = values.map(v => v / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const clipClassifier = new CLIPClassifier();
