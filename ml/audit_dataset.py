"""
ml/audit_dataset.py
-------------------
Audits a downloaded FoodSeg103 archive and generates versioned multi-label
dataset artifacts without building a segmentation model:

    If a food's category ID appears anywhere in an image's segmentation mask
    (above an optional minimum pixel threshold), that food is included in the
    image's multi-label target.

Outputs written to --out (default: ml/data/processed):
    - class_counts_<version>.json : Per-class image counts across all 103 categories
    - labels_<version>.json       : Versioned list of selected supported categories
    - train_split_<version>.json  : Training image paths + multi-label targets
    - val_split_<version>.json    : Validation image paths + multi-label targets
    - test_split_<version>.json   : Official FoodSeg103 test split (held out)

Usage:
    cd ml
    python audit_dataset.py --data data/FoodSeg103 --version v1
    python audit_dataset.py --data data/FoodSeg103 --version v1 --categories rice,bread,noodles,potatoes,broccoli,carrots,tomatoes,lettuce,eggs,fish,steak,poultry
"""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

# Default candidate categories from the NutriLog ML plan.
# Keys are our canonical NutriLog labels; values are case-insensitive aliases
# that match FoodSeg103's category_id.txt naming.
DEFAULT_CANDIDATES: dict[str, tuple[str, ...]] = {
    "rice": ("rice",),
    "bread": ("bread",),
    "noodles": ("noodles", "pasta"),
    "potatoes": ("potato", "potatoes"),
    "broccoli": ("broccoli",),
    "carrots": ("carrot", "carrots"),
    "tomatoes": ("tomato", "tomatoes"),
    "lettuce": ("lettuce", "salad"),
    "eggs": ("egg", "eggs"),
    "fish": ("fish",),
    "steak": ("steak", "beef"),
    "poultry": ("chicken", "duck", "poultry", "chicken/duck"),
}


def parse_category_file(category_path: Path) -> dict[int, str]:
    """Parse FoodSeg103's category_id.txt into {class_id: raw_name}."""
    categories: dict[int, str] = {}
    with category_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(maxsplit=1)
            if len(parts) != 2:
                continue
            try:
                cid = int(parts[0])
            except ValueError:
                continue
            if cid == 0:
                continue  # 0 is background
            categories[cid] = parts[1].strip()
    return categories


def resolve_selected_categories(
    raw_categories: dict[int, str],
    requested: list[str],
) -> list[dict]:
    """Map requested canonical labels to one or more FoodSeg103 category IDs."""
    name_to_id = {name.lower(): cid for cid, name in raw_categories.items()}
    selected: list[dict] = []
    missing: list[str] = []

    for label in requested:
        key = label.strip().lower()
        aliases = DEFAULT_CANDIDATES.get(key, (key,))
        matched_ids: list[int] = []
        matched_names: list[str] = []
        for alias in aliases:
            if alias in name_to_id:
                cid = name_to_id[alias]
                if cid not in matched_ids:
                    matched_ids.append(cid)
                    matched_names.append(raw_categories[cid])

        if not matched_ids:
            # Substring fallback so the audit report shows close matches.
            for raw_lower, cid in name_to_id.items():
                if key in raw_lower or any(a in raw_lower for a in aliases):
                    matched_ids.append(cid)
                    matched_names.append(raw_categories[cid])

        if not matched_ids:
            missing.append(label)
            continue

        selected.append({
            "label": key,
            "display": key.replace("_", " ").title(),
            "foodseg_ids": matched_ids,
            "foodseg_names": matched_names,
        })

    if missing:
        print(f"[audit] WARNING: Could not match requested categories: {missing}")
        print("[audit] Inspect class_counts output to pick exact FoodSeg103 names.")

    return selected


def scan_split(
    data_root: Path,
    split_name: str,
    min_pixels: int,
) -> tuple[list[dict], Counter[int]]:
    """Scan all masks in a FoodSeg103 split ('train' or 'test')."""
    img_dir = data_root / "Images" / "img_dir" / split_name
    ann_dir = data_root / "Images" / "ann_dir" / split_name

    if not img_dir.exists() or not ann_dir.exists():
        raise FileNotFoundError(
            f"Expected FoodSeg103 directories at:\n  {img_dir}\n  {ann_dir}\n"
            "See ml/data/README.md for FoodSeg103 download and layout instructions."
        )

    mask_files = sorted(ann_dir.glob("*.png"))
    if not mask_files:
        raise FileNotFoundError(f"No PNG masks found in {ann_dir}")

    records: list[dict] = []
    class_counts: Counter[int] = Counter()

    for mask_path in mask_files:
        stem = mask_path.stem
        img_path = img_dir / f"{stem}.jpg"
        if not img_path.exists():
            img_path = img_dir / f"{stem}.png"
        if not img_path.exists():
            continue

        mask = np.array(Image.open(mask_path))
        if mask.ndim == 3:
            mask = mask[:, :, 0]

        unique_ids, pixel_counts = np.unique(mask, return_counts=True)
        present_ids = [
            int(cid)
            for cid, px in zip(unique_ids, pixel_counts)
            if int(cid) != 0 and int(px) >= min_pixels
        ]
        for cid in present_ids:
            class_counts[cid] += 1

        records.append({
            "image": str(img_path.relative_to(data_root)).replace("\\", "/"),
            "mask": str(mask_path.relative_to(data_root)).replace("\\", "/"),
            "foodseg_ids": present_ids,
        })

    return records, class_counts


def project_records(
    records: list[dict],
    selected: list[dict],
    keep_negatives: bool,
) -> list[dict]:
    """Convert raw FoodSeg103 IDs into binary multi-label targets for selected categories."""
    projected: list[dict] = []
    for rec in records:
        present_set = set(rec["foodseg_ids"])
        labels = [
            item["label"]
            for item in selected
            if any(cid in present_set for cid in item["foodseg_ids"])
        ]
        if not labels and not keep_negatives:
            continue
        projected.append({
            "image": rec["image"],
            "labels": labels,
        })
    return projected


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit FoodSeg103 and build multi-label splits")
    parser.add_argument("--data", default="data/FoodSeg103", help="Path to FoodSeg103 root")
    parser.add_argument("--out", default="data/processed", help="Directory for generated JSON artifacts")
    parser.add_argument("--version", default="v1", help="Artifact version tag (e.g. v1)")
    parser.add_argument(
        "--categories",
        default=",".join(DEFAULT_CANDIDATES.keys()),
        help="Comma-separated candidate categories to select",
    )
    parser.add_argument(
        "--min-pixels",
        type=int,
        default=100,
        help="Minimum mask pixels for a category to count as present in an image",
    )
    parser.add_argument(
        "--val-ratio",
        type=float,
        default=0.15,
        help="Fraction of FoodSeg103 train split reserved for validation",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed for train/val split")
    parser.add_argument(
        "--drop-empty",
        action="store_true",
        help="Drop images that contain none of the selected categories (by default kept as hard negatives)",
    )
    args = parser.parse_args()

    data_root = Path(args.data)
    category_path = data_root / "category_id.txt"
    if not category_path.exists():
        raise FileNotFoundError(
            f"Could not find {category_path}. Download FoodSeg103 first (see ml/data/README.md)."
        )

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw_categories = parse_category_file(category_path)
    print(f"[audit] Loaded {len(raw_categories)} FoodSeg103 categories from {category_path}")

    train_raw, train_counts = scan_split(data_root, "train", min_pixels=args.min_pixels)
    test_raw, test_counts = scan_split(data_root, "test", min_pixels=args.min_pixels)
    print(f"[audit] Scanned {len(train_raw)} train images and {len(test_raw)} test images")

    # Full 103-category count report
    full_counts = [
        {
            "foodseg_id": cid,
            "name": name,
            "train_images": train_counts[cid],
            "test_images": test_counts[cid],
            "total_images": train_counts[cid] + test_counts[cid],
        }
        for cid, name in sorted(raw_categories.items())
    ]
    counts_path = out_dir / f"class_counts_{args.version}.json"
    counts_path.write_text(json.dumps(full_counts, indent=2), encoding="utf-8")
    print(f"[audit] Wrote full class counts to {counts_path}")

    requested = [c.strip() for c in args.categories.split(",") if c.strip()]
    selected = resolve_selected_categories(raw_categories, requested)
    if not selected:
        raise RuntimeError("No categories matched. Check category names against class_counts JSON.")

    # Print summary table for selected categories
    print("\nSelected categories audit:")
    print(f"{'Label':<14} {'FoodSeg103 match':<26} {'Train':>7} {'Test':>7} {'Total':>7}")
    print("-" * 66)
    for item in selected:
        tr = sum(train_counts[cid] for cid in item["foodseg_ids"])
        te = sum(test_counts[cid] for cid in item["foodseg_ids"])
        item["train_images"] = tr
        item["test_images"] = te
        names = ", ".join(item["foodseg_names"])
        print(f"{item['label']:<14} {names:<26} {tr:>7} {te:>7} {tr + te:>7}")

    keep_negatives = not args.drop_empty
    train_pool = project_records(train_raw, selected, keep_negatives=keep_negatives)
    test_split = project_records(test_raw, selected, keep_negatives=keep_negatives)

    rng = random.Random(args.seed)
    rng.shuffle(train_pool)
    n_val = int(round(len(train_pool) * args.val_ratio))
    val_split = train_pool[:n_val]
    train_split = train_pool[n_val:]

    labels_artifact = {
        "version": args.version,
        "dataset": "FoodSeg103",
        "min_pixels": args.min_pixels,
        "keep_negatives": keep_negatives,
        "seed": args.seed,
        "categories": selected,
    }
    (out_dir / f"labels_{args.version}.json").write_text(
        json.dumps(labels_artifact, indent=2), encoding="utf-8"
    )
    (out_dir / f"train_split_{args.version}.json").write_text(
        json.dumps(train_split, indent=2), encoding="utf-8"
    )
    (out_dir / f"val_split_{args.version}.json").write_text(
        json.dumps(val_split, indent=2), encoding="utf-8"
    )
    (out_dir / f"test_split_{args.version}.json").write_text(
        json.dumps(test_split, indent=2), encoding="utf-8"
    )

    print(
        f"\n[audit] Saved {args.version} splits to {out_dir}: "
        f"train={len(train_split)}, val={len(val_split)}, test={len(test_split)}"
    )


if __name__ == "__main__":
    main()
