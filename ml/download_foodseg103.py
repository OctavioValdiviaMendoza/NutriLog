"""Download FoodSeg103 and arrange its images and masks for audit_dataset.py."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from datasets import load_dataset
from huggingface_hub import hf_hub_download

REPO_ID = "EduardoPacheco/FoodSeg103"


def export_categories(out_dir: Path) -> None:
    # Download the ID-to-name map and save it in FoodSeg103's category_id.txt format.
    id2label_path = hf_hub_download(
        repo_id=REPO_ID,
        filename="id2label.json",
        repo_type="dataset",
    )
    id2label = json.loads(Path(id2label_path).read_text(encoding="utf-8"))
    lines = [
        f"{int(cid)}\t{name}"
        for cid, name in sorted(id2label.items(), key=lambda kv: int(kv[0]))
    ]
    cat_file = out_dir / "category_id.txt"
    cat_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[download] Wrote {len(lines)} categories to {cat_file}")


def export_split(dataset_split, out_dir: Path, target_name: str) -> None:
    img_dir = out_dir / "Images" / "img_dir" / target_name
    ann_dir = out_dir / "Images" / "ann_dir" / target_name
    img_dir.mkdir(parents=True, exist_ok=True)
    ann_dir.mkdir(parents=True, exist_ok=True)

    exported = 0
    for idx, row in enumerate(dataset_split):
        stem = str(row.get("id", f"{idx:06d}"))
        img_path = img_dir / f"{stem}.jpg"
        ann_path = ann_dir / f"{stem}.png"

        # Skip files that already exist so re-running the script is fast.
        if not img_path.exists():
            row["image"].convert("RGB").save(img_path, format="JPEG", quality=95)
        if not ann_path.exists():
            row["label"].save(ann_path, format="PNG")
        exported += 1
        if exported % 1000 == 0:
            print(f"[download]   {target_name}: {exported}/{len(dataset_split)} exported...")

    print(f"[download] Exported {exported} items to {target_name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Download and export FoodSeg103")
    parser.add_argument("--out", default="data/FoodSeg103", help="Output directory")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    export_categories(out_dir)

    print(f"[download] Loading {REPO_ID} from Hugging Face...")
    ds = load_dataset(REPO_ID)
    print(f"[download] Available splits: {list(ds.keys())}")

    if "train" in ds:
        export_split(ds["train"], out_dir, "train")
    # Hugging Face names FoodSeg103's held-out test split "validation".
    if "validation" in ds:
        export_split(ds["validation"], out_dir, "test")
    elif "test" in ds:
        export_split(ds["test"], out_dir, "test")

    print(f"[download] Done! FoodSeg103 ready at {out_dir}")


if __name__ == "__main__":
    main()
