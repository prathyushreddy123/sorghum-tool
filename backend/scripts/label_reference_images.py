#!/usr/bin/env python3
"""
Bootstrap script to label unlabeled ergot images using Gemini.
Place your 20 unlabeled images in backend/unlabeled_images/
This script will analyze them and suggest severity labels for review.
"""
import os
import sys
import asyncio
from pathlib import Path

# Add parent dir to path so we can import from services
sys.path.insert(0, str(Path(__file__).parent.parent))

from google import genai
from google.genai import types
from config import GEMINI_API_KEY

UNLABELED_DIR = Path(__file__).parent.parent / "unlabeled_images"
REFERENCE_DIR = Path(__file__).parent.parent / "reference_images"

LABELING_PROMPT = """You are an expert sorghum pathologist. Analyze this sorghum panicle image for ergot disease severity.

The severity scale is:
1 = None (0% infection) - No visible honeydew or sphacelia on the panicle
2 = Low (1-10%) - Few honeydew droplets on lower florets, minor infection
3 = Moderate (11-25%) - Multiple honeydew droplets spread across panicle
4 = High (26-50%) - Heavy honeydew, visible mold growth beginning
5 = Severe (>50%) - Entire panicle affected, sclerotia forming

Key visual indicators:
- Honeydew: sticky droplets on grain, often pink/orange/brown
- Coverage: estimate % of panicle affected
- Sclerotia: hard black structures replacing grain

Respond ONLY with valid JSON:
{"severity": <1-5>, "confidence": <0.0-1.0>, "reasoning": "<what you see>", "percent_estimate": "<X-Y%>"}"""


async def label_single_image(client: genai.Client, filepath: Path) -> dict:
    """Label a single image using Gemini."""
    with open(filepath, "rb") as f:
        image_bytes = f.read()

    mime_type = "image/png" if filepath.suffix.lower() == ".png" else "image/jpeg"

    response = await client.aio.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            LABELING_PROMPT,
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
    )

    import json
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    return json.loads(text)


async def main():
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY not set. Export it first:")
        print("  export GEMINI_API_KEY=your_key_here")
        return 1

    # Check directories
    if not UNLABELED_DIR.exists():
        print(f"Creating {UNLABELED_DIR}")
        UNLABELED_DIR.mkdir(exist_ok=True)
        print(f"\nPlace your unlabeled ergot images in: {UNLABELED_DIR}")
        print("Then run this script again.")
        return 1

    REFERENCE_DIR.mkdir(exist_ok=True)

    # Find images
    image_files = list(UNLABELED_DIR.glob("*.jpg")) + list(UNLABELED_DIR.glob("*.jpeg")) + list(UNLABELED_DIR.glob("*.png"))
    if not image_files:
        print(f"No images found in {UNLABELED_DIR}")
        print("Add .jpg, .jpeg, or .png files and try again.")
        return 1

    print(f"Found {len(image_files)} images to label\n")

    client = genai.Client(api_key=GEMINI_API_KEY)

    results = []
    for i, filepath in enumerate(image_files, 1):
        print(f"[{i}/{len(image_files)}] Analyzing {filepath.name}... ", end="", flush=True)
        try:
            result = await label_single_image(client, filepath)
            result["filename"] = filepath.name
            result["filepath"] = filepath
            results.append(result)
            print(f"✓ Severity {result['severity']} ({result['confidence']:.0%} confidence)")
        except Exception as e:
            print(f"✗ Error: {e}")

    if not results:
        print("\nNo images were successfully labeled.")
        return 1

    # Show summary
    print("\n" + "="*80)
    print("LABELING SUMMARY")
    print("="*80)

    severity_counts = {i: 0 for i in range(1, 6)}
    for r in results:
        severity_counts[r["severity"]] += 1

    print("\nDistribution:")
    for sev in range(1, 6):
        count = severity_counts[sev]
        bar = "█" * count
        print(f"  Severity {sev}: {count:2d} images {bar}")

    # Show details
    print("\nDetailed Results:")
    print(f"{'File':<30} {'Sev':<4} {'Conf':<6} {'Estimate':<10} {'Reasoning':<50}")
    print("-"*110)
    for r in sorted(results, key=lambda x: x["severity"]):
        print(f"{r['filename']:<30} {r['severity']:<4} {r['confidence']:.0%}    "
              f"{r.get('percent_estimate', 'N/A'):<10} {r['reasoning'][:47]}...")

    # Ask for confirmation
    print("\n" + "="*80)
    response = input("Review the labels above. Copy to reference_images/ with severity naming? (y/n): ")

    if response.lower() != 'y':
        print("Aborted. No files were copied.")
        return 0

    # Count per severity to assign a/b/c suffixes
    suffix_counters = {i: 0 for i in range(1, 6)}

    for r in results:
        severity = r["severity"]
        suffix = chr(ord('a') + suffix_counters[severity])  # a, b, c, ...
        suffix_counters[severity] += 1

        ext = r["filepath"].suffix
        new_name = f"severity_{severity}_{suffix}{ext}"
        dest = REFERENCE_DIR / new_name

        # Copy file
        import shutil
        shutil.copy2(r["filepath"], dest)
        print(f"  {r['filename']} → {new_name}")

    print(f"\n✓ Copied {len(results)} images to {REFERENCE_DIR}")
    print("\nNext steps:")
    print("  1. Review the images in reference_images/")
    print("  2. Rename any incorrectly labeled images")
    print("  3. Start the backend with your API key and test predictions")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
