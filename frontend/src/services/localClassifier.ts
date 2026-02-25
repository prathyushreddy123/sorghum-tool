import * as ort from 'onnxruntime-web';

const MODEL_URL = '/models/ergot-severity-v1.onnx';
const INPUT_SIZE = 224;
// ImageNet normalization constants
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let session: ort.InferenceSession | null = null;
let loading: Promise<ort.InferenceSession> | null = null;

export interface LocalPrediction {
  severity: number; // 1-5
  confidence: number; // 0-1
  allScores: number[]; // softmax for classes 1-5
}

/** Lazily load the ONNX model. Subsequent calls return the cached session. */
export async function loadModel(): Promise<ort.InferenceSession> {
  if (session) return session;
  if (loading) return loading;

  loading = ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });

  try {
    session = await loading;
    return session;
  } catch (err) {
    loading = null;
    throw err;
  }
}

/** Check if the model is already cached (available offline). */
export function isModelLoaded(): boolean {
  return session !== null;
}

/**
 * Preprocess a Blob into a float32 CHW tensor normalized with ImageNet stats.
 * Returns shape [1, 3, 224, 224].
 */
async function preprocessImage(blob: Blob): Promise<ort.Tensor> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, INPUT_SIZE, INPUT_SIZE);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data } = imageData; // RGBA uint8

  const floats = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const pixelCount = INPUT_SIZE * INPUT_SIZE;

  for (let i = 0; i < pixelCount; i++) {
    const ri = i * 4;
    // CHW layout: [R plane, G plane, B plane]
    floats[i] = (data[ri] / 255 - MEAN[0]) / STD[0];
    floats[pixelCount + i] = (data[ri + 1] / 255 - MEAN[1]) / STD[1];
    floats[2 * pixelCount + i] = (data[ri + 2] / 255 - MEAN[2]) / STD[2];
  }

  return new ort.Tensor('float32', floats, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

/** Softmax over a float array. */
function softmax(logits: Float32Array | number[]): number[] {
  const max = Math.max(...logits);
  const exps = Array.from(logits, (v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Run inference on a compressed image blob.
 * Returns severity (1-5), confidence, and per-class scores.
 */
export async function classify(blob: Blob): Promise<LocalPrediction> {
  const model = await loadModel();
  const inputTensor = await preprocessImage(blob);

  const inputName = model.inputNames[0];
  const results = await model.run({ [inputName]: inputTensor });
  const outputName = model.outputNames[0];
  const logits = results[outputName].data as Float32Array;

  const scores = softmax(logits);
  const maxIdx = scores.indexOf(Math.max(...scores));

  return {
    severity: maxIdx + 1, // classes are 1-5 (index 0 = severity 1)
    confidence: scores[maxIdx],
    allScores: scores,
  };
}
