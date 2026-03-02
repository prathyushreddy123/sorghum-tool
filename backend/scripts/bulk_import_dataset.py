#!/usr/bin/env python3
"""
Bulk import a dataset into the training pipeline (Supabase training-images bucket).

Usage examples:

  # Mendeley Sorghum Disease Dataset
  python scripts/bulk_import_dataset.py \
    --source-dir ~/datasets/mendeley-sorghum \
    --crop sorghum --trait grain_mold_severity \
    --class-map "Cereal Grain Molds=3,Head Smut=4,Healthy=1"

  # PlantVillage corn subset (limit 500/class)
  python scripts/bulk_import_dataset.py \
    --source-dir ~/datasets/plantvillage \
    --crop maize --trait grey_leaf_spot \
    --class-map "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot=3,Corn_(maize)___healthy=1" \
    --limit-per-class 500

  # Dry run (preview without uploading)
  python scripts/bulk_import_dataset.py \
    --source-dir ~/datasets/data --crop sorghum --trait ergot_severity --class-map "..." --dry-run
"""
import argparse
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.storage import get_supabase_storage

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}


def parse_class_map(class_map_str: str) -> dict[str, str]:
    """Parse 'FolderName=class_value,...' into a mapping dict."""
    mapping = {}
    for pair in class_map_str.split(","):
        pair = pair.strip()
        if "=" not in pair:
            print(f"WARNING: Skipping invalid mapping '{pair}' (expected Folder=value)")
            continue
        folder, value = pair.split("=", 1)
        mapping[folder.strip()] = value.strip()
    return mapping


def discover_images(
    source_dir: Path, class_map: dict[str, str], limit_per_class: int = 0
) -> list[tuple[Path, str]]:
    """Walk source_dir, find images, map folder names to class values."""
    images: list[tuple[Path, str]] = []
    counts: dict[str, int] = {}

    for folder_name, class_value in sorted(class_map.items()):
        folder_path = source_dir / folder_name
        if not folder_path.exists():
            print(f"WARNING: Folder '{folder_name}' not found in {source_dir}")
            continue

        count = 0
        for f in sorted(folder_path.iterdir()):
            if f.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            if limit_per_class > 0 and count >= limit_per_class:
                break
            images.append((f, class_value))
            count += 1

        counts[class_value] = counts.get(class_value, 0) + count

    print(f"Discovered {len(images)} images:")
    for cls, cnt in sorted(counts.items()):
        print(f"  class '{cls}': {cnt} images")

    return images


def upload_batch(
    images: list[tuple[Path, str]],
    storage,
    crop: str,
    trait_name: str,
    max_workers: int = 8,
    dry_run: bool = False,
) -> dict[str, int]:
    """Upload images to Supabase training-images bucket with parallelism."""
    stats: dict[str, int] = {}
    errors = 0

    def upload_one(item: tuple[Path, str]) -> tuple[str, bool]:
        file_path, class_value = item
        dest = f"{crop}/{trait_name}/{class_value}/{file_path.name}"
        if dry_run:
            return class_value, True
        try:
            with open(file_path, "rb") as f:
                storage.save(dest, f.read())
            return class_value, True
        except Exception as e:
            print(f"  ERROR uploading {file_path.name}: {e}")
            return class_value, False

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(upload_one, img): img for img in images}
        for i, future in enumerate(as_completed(futures), 1):
            cls, ok = future.result()
            if ok:
                stats[cls] = stats.get(cls, 0) + 1
            else:
                errors += 1
            if i % 100 == 0 or i == len(images):
                print(f"  Progress: {i}/{len(images)}")

    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Bulk import dataset images into Supabase training-images bucket"
    )
    parser.add_argument("--source-dir", required=True, type=Path, help="Root dataset directory")
    parser.add_argument("--crop", required=True, help="Crop name (e.g., sorghum, maize)")
    parser.add_argument("--trait", required=True, help="Trait name (e.g., grain_mold_severity)")
    parser.add_argument(
        "--class-map", required=True,
        help="Comma-separated FolderName=class_value pairs (e.g., 'Grain Mold=3,Healthy=1')"
    )
    parser.add_argument("--max-workers", type=int, default=8, help="Parallel upload threads")
    parser.add_argument("--dry-run", action="store_true", help="Preview without uploading")
    parser.add_argument(
        "--limit-per-class", type=int, default=0,
        help="Max images per class (0=unlimited)"
    )
    args = parser.parse_args()

    if not args.source_dir.exists():
        print(f"ERROR: Source directory does not exist: {args.source_dir}")
        sys.exit(1)

    class_map = parse_class_map(args.class_map)
    if not class_map:
        print("ERROR: No valid class mappings found. Use format: FolderName=value,...")
        sys.exit(1)

    print(f"Crop: {args.crop}")
    print(f"Trait: {args.trait}")
    print(f"Class mapping: {class_map}")
    print(f"Upload path: training-images/{args.crop}/{args.trait}/{{class}}/{{file}}")
    print()

    images = discover_images(args.source_dir, class_map, args.limit_per_class)
    if not images:
        print("No images found. Check --source-dir and --class-map folder names.")
        sys.exit(1)

    if args.dry_run:
        print("\n[DRY RUN] No images uploaded. Remove --dry-run to upload.")
        return

    print(f"\nUploading {len(images)} images to Supabase...")
    storage = get_supabase_storage("training-images")
    stats = upload_batch(images, storage, args.crop, args.trait, args.max_workers)

    print(f"\nUpload complete:")
    for cls, count in sorted(stats.items()):
        print(f"  class '{cls}': {count} images")
    print(f"  Total: {sum(stats.values())}")


if __name__ == "__main__":
    main()
