#!/usr/bin/env python3
"""
Export MobileCLIP2-S0 vision encoder to ONNX and precompute text embeddings
for all traits defined in the frontend manifest.json.

Usage:
    python scripts/export_clip.py

Outputs:
    ../frontend/public/models/mobileclip-s0-vision.onnx    (FP32, ~1.7MB)
    ../frontend/public/models/clip-embeddings/<trait>.json  (per-trait text embeddings)
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import torch
import open_clip
import onnx

MANIFEST_PATH = Path(__file__).parent / "../../frontend/public/models/manifest.json"
OUTPUT_DIR = Path(__file__).parent / "../../frontend/public/models"
EMBEDDINGS_DIR = OUTPUT_DIR / "clip-embeddings"
ONNX_PATH = OUTPUT_DIR / "mobileclip-s0-vision.onnx"
ONNX_TMP_PATH = OUTPUT_DIR / "mobileclip-s0-vision-tmp.onnx"

MODEL_NAME = "MobileCLIP2-S0"
PRETRAINED = "dfndr2b"
INPUT_SIZE = 256


class CLIPVisionWrapper(torch.nn.Module):
    """Wraps the CLIP visual encoder to output L2-normalized embeddings."""
    def __init__(self, clip_model):
        super().__init__()
        self.visual = clip_model.visual

    def forward(self, x):
        features = self.visual(x)
        # L2 normalize for cosine similarity
        return features / features.norm(dim=-1, keepdim=True)


def export_vision_encoder():
    """Export the vision encoder to ONNX (FP32 — only ~1.7MB, no quantization needed)."""
    print(f"Loading {MODEL_NAME} ({PRETRAINED})...")
    model, _, preprocess = open_clip.create_model_and_transforms(MODEL_NAME, pretrained=PRETRAINED)
    model.eval()

    wrapper = CLIPVisionWrapper(model)
    wrapper.eval()

    dummy_input = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)

    # Verify forward pass
    with torch.no_grad():
        out = wrapper(dummy_input)
    print(f"Vision output shape: {out.shape}, embedding dim: {out.shape[-1]}")

    # Export to ONNX (dynamo exporter saves weights externally by default)
    print(f"Exporting to ONNX: {ONNX_PATH}")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    torch.onnx.export(
        wrapper,
        dummy_input,
        str(ONNX_TMP_PATH),
        input_names=["pixel_values"],
        output_names=["image_embedding"],
        dynamic_axes={
            "pixel_values": {0: "batch"},
            "image_embedding": {0: "batch"},
        },
        opset_version=17,
    )

    # Merge external weights into a single .onnx file for browser deployment
    print("Merging external weights into single file...")
    model = onnx.load(str(ONNX_TMP_PATH), load_external_data=True)
    onnx.save_model(model, str(ONNX_PATH), save_as_external_data=False)

    # Clean up temp files
    ONNX_TMP_PATH.unlink(missing_ok=True)
    for f in OUTPUT_DIR.glob("mobileclip-s0-vision-tmp.onnx.data"):
        f.unlink()
    for f in OUTPUT_DIR.glob("mobileclip-s0-vision.onnx.data"):
        f.unlink()

    model_size = ONNX_PATH.stat().st_size / 1e6
    print(f"Model size: {model_size:.1f} MB")

    # Verify with onnxruntime
    import onnxruntime as ort
    sess = ort.InferenceSession(str(ONNX_PATH))
    result = sess.run(None, {"pixel_values": dummy_input.numpy()})
    print(f"Verification OK, output shape: {result[0].shape}")

    return model


def precompute_text_embeddings(clip_model):
    """Precompute text embeddings for all traits in the manifest."""
    print(f"\nReading manifest: {MANIFEST_PATH}")
    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)

    tokenizer = open_clip.get_tokenizer(MODEL_NAME)
    os.makedirs(EMBEDDINGS_DIR, exist_ok=True)

    for trait_name, trait_config in manifest["models"].items():
        tier2_labels = trait_config.get("tier2_labels")
        if not tier2_labels:
            print(f"  {trait_name}: no tier2_labels, skipping")
            continue

        print(f"  {trait_name}: computing embeddings for {len(tier2_labels)} classes...")

        classes = sorted(tier2_labels.keys())
        texts = [tier2_labels[c] for c in classes]

        tokens = tokenizer(texts)
        with torch.no_grad():
            text_features = clip_model.encode_text(tokens)
            # L2 normalize
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        embeddings = text_features.cpu().numpy().tolist()

        output = {
            "trait": trait_name,
            "classes": classes,
            "labels": texts,
            "embeddings": embeddings,
            "embedding_dim": len(embeddings[0]),
        }

        out_path = EMBEDDINGS_DIR / f"{trait_name}.json"
        with open(out_path, "w") as f:
            json.dump(output, f)

        file_size = out_path.stat().st_size / 1024
        print(f"    -> {out_path.name} ({file_size:.1f} KB)")


def main():
    clip_model = export_vision_encoder()
    precompute_text_embeddings(clip_model)

    print("\nDone! Files created:")
    print(f"  {ONNX_PATH}")
    for f in sorted(EMBEDDINGS_DIR.glob("*.json")):
        print(f"  {f}")


if __name__ == "__main__":
    main()
