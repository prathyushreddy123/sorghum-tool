#!/usr/bin/env python3
"""
Label remaining unlabeled images, skipping those already labeled.
Handles rate limits with exponential backoff.
"""
import os
import sys
import asyncio
import time
from pathlib import Path

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


async def label_single_image(client: genai.Client, filepath: Path, retry_count=0) -> dict | None:
    """Label a single image with retry logic."""
    with open(filepath, "rb") as f:
        image_bytes = f.read()

    mime_type = "image/png" if filepath.suffix.lower() == ".png" else "image/jpeg"

    try:
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

    except Exception as e:
        error_str = str(e)
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            # Rate limit hit - exponential backoff
            if retry_count < 3:
                wait_time = (2 ** retry_count) * 5  # 5s, 10s, 20s
                print(f"Rate limit, waiting {wait_time}s...")
                await asyncio.sleep(wait_time)
                return await label_single_image(client, filepath, retry_count + 1)
        return None


async def main():
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY not set")
        return 1

    REFERENCE_DIR.mkdir(exist_ok=True)

    # Get already labeled files
    labeled_files = set()
    for ref_file in REFERENCE_DIR.glob("severity_*.*"):
        labeled_files.add(ref_file.stem.split("_")[2])  # Get the suffix (a, b, c, ...)

    # Find unlabeled images
    all_images = list(UNLABELED_DIR.glob("*.jpg")) + list(UNLABELED_DIR.glob("*.jpeg")) + list(UNLABELED_DIR.glob("*.png"))

    # Check which are already in reference_images (by comparing actual images)
    already_labeled = []
    for img in all_images:
        # Check if this exact filename is already copied
        for ref_file in REFERENCE_DIR.glob("severity_*.*"):
            try:
                if os.path.getsize(img) == os.path.getsize(ref_file):
                    # Likely already labeled
                    already_labeled.append(img.name)
                    break
            except:
                pass

    unlabeled_images = [img for img in all_images if img.name not in already_labeled]

    if not unlabeled_images:
        print("All images are already labeled!")
        return 0

    print(f"Found {len(unlabeled_images)} unlabeled images (skipping {len(already_labeled)} already labeled)\n")

    client = genai.Client(api_key=GEMINI_API_KEY)
    results = []

    for i, filepath in enumerate(unlabeled_images, 1):
        print(f"[{i}/{len(unlabeled_images)}] Analyzing {filepath.name}... ", end="", flush=True)
        result = await label_single_image(client, filepath)
        if result:
            result["filename"] = filepath.name
            result["filepath"] = filepath
            results.append(result)
            print(f"✓ Severity {result['severity']} ({result['confidence']:.0%} confidence)")
        else:
            print("✗ Failed")

        # Small delay to avoid rate limits
        await asyncio.sleep(1)

    if not results:
        print("\nNo images were successfully labeled.")
        return 1

    # Show summary
    print("\n" + "="*80)
    print("LABELING SUMMARY")
    print("="*80)

    from collections import Counter
    severity_counts = Counter(r["severity"] for r in results)

    print("\nNew Labels:")
    for sev in range(1, 6):
        count = severity_counts.get(sev, 0)
        bar = "█" * count
        print(f"  Severity {sev}: {count:2d} images {bar}")

    # Show what we already have
    print("\nExisting Reference Images:")
    existing_counts = Counter()
    for ref_file in REFERENCE_DIR.glob("severity_*.*"):
        try:
            sev = int(ref_file.stem.split("_")[1])
            existing_counts[sev] += 1
        except:
            pass

    for sev in range(1, 6):
        count = existing_counts.get(sev, 0)
        bar = "█" * count
        print(f"  Severity {sev}: {count:2d} images {bar}")

    # Show combined total
    print("\nCombined Total (if we add these):")
    for sev in range(1, 6):
        total = existing_counts.get(sev, 0) + severity_counts.get(sev, 0)
        bar = "█" * total
        print(f"  Severity {sev}: {total:2d} images {bar}")

    print("\nDetailed Results:")
    print(f"{'File':<35} {'Sev':<4} {'Conf':<6} {'Estimate':<10} {'Reasoning':<50}")
    print("-"*115)
    for r in sorted(results, key=lambda x: x["severity"]):
        print(f"{r['filename']:<35} {r['severity']:<4} {r['confidence']:.0%}    "
              f"{r.get('percent_estimate', 'N/A'):<10} {r['reasoning'][:47]}...")

    # Ask for confirmation
    print("\n" + "="*80)

    # Auto-proceed if non-interactive
    import sys
    if not sys.stdin.isatty():
        print("Non-interactive mode - copying automatically")
        proceed = True
    else:
        response = input("Copy these to reference_images/? (y/n): ")
        proceed = response.lower() == 'y'

    if not proceed:
        print("Aborted.")
        return 0

    # Count existing per severity for suffix assignment
    suffix_counters = {i: 0 for i in range(1, 6)}
    for ref_file in REFERENCE_DIR.glob("severity_*.*"):
        try:
            sev = int(ref_file.stem.split("_")[1])
            suffix = ref_file.stem.split("_")[2]
            suffix_num = ord(suffix) - ord('a') + 1
            suffix_counters[sev] = max(suffix_counters[sev], suffix_num)
        except:
            pass

    # Copy new images
    import shutil
    for r in results:
        severity = r["severity"]
        suffix = chr(ord('a') + suffix_counters[severity])
        suffix_counters[severity] += 1

        ext = r["filepath"].suffix
        new_name = f"severity_{severity}_{suffix}{ext}"
        dest = REFERENCE_DIR / new_name

        shutil.copy2(r["filepath"], dest)
        print(f"  {r['filename']} → {new_name}")

    final_count = len(list(REFERENCE_DIR.glob("severity_*.*")))
    print(f"\n✓ Total reference images now: {final_count}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
