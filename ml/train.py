"""Train the food classifier and save its weights, thresholds, and evaluation results."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, Dataset

from metrics import compute_multilabel_metrics, tune_thresholds
from modeling import build_efficientnet_b0
from preprocessing import PreprocessingConfig, build_eval_transform, build_train_transform

ML_DIR = Path(__file__).parent
MODEL_DIR = ML_DIR / "model"


class FoodSegMultiLabelDataset(Dataset):
    """Load an image and mark which supported foods are present."""

    def __init__(
        self,
        data_root: Path,
        records: list[dict],
        label_to_idx: dict[str, int],
        transform,
    ) -> None:
        self.data_root = data_root
        self.records = records
        self.label_to_idx = label_to_idx
        self.num_classes = len(label_to_idx)
        self.transform = transform

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        rec = self.records[idx]
        with Image.open(self.data_root / rec["image"]) as image:
            tensor = self.transform(image.convert("RGB"))

        target = torch.zeros(self.num_classes, dtype=torch.float32)
        for label in rec["labels"]:
            if label in self.label_to_idx:
                target[self.label_to_idx[label]] = 1.0
        return tensor, target


@torch.no_grad()
def collect_predictions(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    all_probs: list[np.ndarray] = []
    all_targets: list[np.ndarray] = []
    for images, targets in loader:
        logits = model(images.to(device))
        probs = torch.sigmoid(logits).cpu().numpy()
        all_probs.append(probs)
        all_targets.append(targets.numpy())
    return np.concatenate(all_probs, axis=0), np.concatenate(all_targets, axis=0)


def compute_pos_weight(records: list[dict], label_to_idx: dict[str, int], max_weight: float = 10.0) -> torch.Tensor:
    """Give rarer foods a higher weight so the model does not ignore them."""
    counts = np.zeros(len(label_to_idx), dtype=np.float32)
    for rec in records:
        for label in rec["labels"]:
            if label in label_to_idx:
                counts[label_to_idx[label]] += 1.0
    total = float(len(records))
    neg = np.maximum(total - counts, 1.0)
    pos = np.maximum(counts, 1.0)
    weights = np.clip(neg / pos, 1.0, max_weight)
    return torch.tensor(weights, dtype=torch.float32)


def train(args: argparse.Namespace) -> None:
    MODEL_DIR.mkdir(exist_ok=True)
    data_root = Path(args.data)
    splits_dir = Path(args.splits)
    ver = args.version

    # 1. Load the label list and split files created by audit_dataset.py.
    labels_path = splits_dir / f"labels_{ver}.json"
    train_path = splits_dir / f"train_split_{ver}.json"
    val_path = splits_dir / f"val_split_{ver}.json"
    test_path = splits_dir / f"test_split_{ver}.json"

    for p in (labels_path, train_path, val_path):
        if not p.exists():
            raise FileNotFoundError(
                f"Missing {p}. Run audit_dataset.py first:\n"
                f"  python audit_dataset.py --data {args.data} --version {ver}"
            )

    labels_artifact = json.loads(labels_path.read_text(encoding="utf-8"))
    categories: list[dict] = labels_artifact["categories"]
    label_names = [c["label"] for c in categories]
    label_to_idx = {name: i for i, name in enumerate(label_names)}
    num_classes = len(label_names)

    train_records = json.loads(train_path.read_text(encoding="utf-8"))
    val_records = json.loads(val_path.read_text(encoding="utf-8"))

    # 2. Wrap the splits in PyTorch datasets and loaders.
    prep_cfg = PreprocessingConfig(image_size=args.image_size)
    train_ds = FoodSegMultiLabelDataset(data_root, train_records, label_to_idx, build_train_transform(prep_cfg))
    val_ds = FoodSegMultiLabelDataset(data_root, val_records, label_to_idx, build_eval_transform(prep_cfg))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[train] Device: {device} | Classes: {num_classes} | Train: {len(train_ds)} | Val: {len(val_ds)}")

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        pin_memory=device.type == "cuda",
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        pin_memory=device.type == "cuda",
    )

    # 3. Build EfficientNet-B0 and freeze the image backbone for warm-up epochs.
    model = build_efficientnet_b0(num_classes=num_classes, pretrained=True).to(device)
    for param in model.features.parameters():
        param.requires_grad = False

    pos_weight = compute_pos_weight(train_records, label_to_idx).to(device) if args.use_pos_weight else None
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = torch.optim.AdamW(model.classifier.parameters(), lr=args.head_lr, weight_decay=1e-4)

    default_thresholds = np.full(num_classes, 0.5, dtype=np.float32)
    best_val_f1 = -1.0
    weights_path = MODEL_DIR / "weights.pth"

    # 4. Train head first, then unfreeze later backbone layers and save best weights.
    total_epochs = args.head_epochs + args.finetune_epochs
    for epoch in range(1, total_epochs + 1):
        if epoch == args.head_epochs + 1 and args.finetune_epochs > 0:
            print("[train] Unfreezing later EfficientNet-B0 backbone blocks (features[5:]) for fine-tuning...")
            # Now let the later image layers learn from our food photos too.
            for block in model.features[5:]:
                for param in block.parameters():
                    param.requires_grad = True
            trainable = [p for p in model.parameters() if p.requires_grad]
            optimizer = torch.optim.AdamW(trainable, lr=args.finetune_lr, weight_decay=1e-4)

        model.train()
        running_loss = 0.0
        t0 = time.perf_counter()
        for images, targets in train_loader:
            images, targets = images.to(device), targets.to(device)
            optimizer.zero_grad()
            logits = model(images)
            loss = criterion(logits, targets)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * images.size(0)

        train_loss = running_loss / max(len(train_ds), 1)
        val_probs, val_targets = collect_predictions(model, val_loader, device)
        val_metrics = compute_multilabel_metrics(val_probs, val_targets, default_thresholds, label_names)
        elapsed = time.perf_counter() - t0

        print(
            f"[train] Epoch {epoch:>2}/{total_epochs} | "
            f"loss={train_loss:.4f} | val_macro_f1@0.5={val_metrics['macro_f1']:.4f} | "
            f"({elapsed:.1f}s)"
        )

        if val_metrics["macro_f1"] > best_val_f1:
            best_val_f1 = val_metrics["macro_f1"]
            torch.save(model.state_dict(), weights_path)
            print(f"[train] New best val Macro-F1 ({best_val_f1:.4f}) -> saved {weights_path}")

    # Choose food thresholds using validation images, not test images.
    model.load_state_dict(torch.load(weights_path, map_location=device, weights_only=True))
    val_probs, val_targets = collect_predictions(model, val_loader, device)
    tuned_thresholds = tune_thresholds(val_probs, val_targets)
    val_tuned_metrics = compute_multilabel_metrics(val_probs, val_targets, tuned_thresholds, label_names)
    print(f"[train] Validation Macro-F1 after threshold tuning: {val_tuned_metrics['macro_f1']:.4f}")

    # Test the chosen model without adjusting its weights or thresholds.
    test_metrics = None
    if args.eval_test and test_path.exists():
        test_records = json.loads(test_path.read_text(encoding="utf-8"))
        test_ds = FoodSegMultiLabelDataset(data_root, test_records, label_to_idx, build_eval_transform(prep_cfg))
        test_loader = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False, num_workers=args.workers)
        test_probs, test_targets = collect_predictions(model, test_loader, device)
        test_metrics = compute_multilabel_metrics(test_probs, test_targets, tuned_thresholds, label_names)
        print(f"[train] Held-out Test Macro-F1 (frozen thresholds): {test_metrics['macro_f1']:.4f}")

    # Save the settings needed to use these weights later.
    model_version = f"foodseg103-effnetb0-{ver}"
    meta = {
        "model_version": model_version,
        "architecture": "efficientnet_b0",
        "dataset": "FoodSeg103",
        "dataset_version": ver,
        "preprocessing": prep_cfg.to_dict(),
        "labels": [
            {
                "label": c["label"],
                "display": c["display"],
                "threshold": round(float(tuned_thresholds[i]), 3),
                "foodseg_ids": c.get("foodseg_ids", []),
            }
            for i, c in enumerate(categories)
        ],
        "validation_metrics": val_tuned_metrics,
        "test_metrics": test_metrics,
    }
    meta_path = MODEL_DIR / "model_meta.json"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"[train] Saved model metadata to {meta_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train EfficientNet-B0 multi-label classifier on FoodSeg103")
    parser.add_argument("--data", default="data/FoodSeg103", help="FoodSeg103 root directory")
    parser.add_argument("--splits", default="data/processed", help="Directory with audit_dataset.py outputs")
    parser.add_argument("--version", default="v1", help="Dataset split version tag")
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--head-epochs", type=int, default=5, help="Epochs to train classifier head only")
    parser.add_argument("--finetune-epochs", type=int, default=10, help="Epochs to fine-tune later backbone layers")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--head-lr", type=float, default=1e-3)
    parser.add_argument("--finetune-lr", type=float, default=1e-4)
    parser.add_argument("--use-pos-weight", action="store_true", help="Weight positive classes in BCEWithLogitsLoss")
    parser.add_argument("--workers", type=int, default=0, help="DataLoader workers (0 is safest on Windows)")
    parser.add_argument("--eval-test", action="store_true", help="Evaluate frozen model on held-out test split")
    train(parser.parse_args())
