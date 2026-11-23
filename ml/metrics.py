"""Measure food predictions and choose thresholds using validation data."""

import numpy as np


def precision_recall_f1(predictions: np.ndarray, targets: np.ndarray) -> tuple[float, float, float]:
    """Score one food category, including cases with no positive predictions."""
    true_positives = int(((predictions == 1) & (targets == 1)).sum())
    false_positives = int(((predictions == 1) & (targets == 0)).sum())
    false_negatives = int(((predictions == 0) & (targets == 1)).sum())

    predicted_count = true_positives + false_positives
    actual_count = true_positives + false_negatives
    precision = true_positives / predicted_count if predicted_count else 0.0
    recall = true_positives / actual_count if actual_count else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return precision, recall, f1


def compute_multilabel_metrics(
    probs: np.ndarray,
    targets: np.ndarray,
    thresholds: np.ndarray,
    label_names: list[str],
) -> dict:
    predictions = (probs >= thresholds[None, :]).astype(np.int32)
    targets = targets.astype(np.int32)
    per_class = {}
    f1_scores = []

    for index, name in enumerate(label_names):
        precision, recall, f1 = precision_recall_f1(predictions[:, index], targets[:, index])
        per_class[name] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "threshold": round(float(thresholds[index]), 3),
            "support": int(targets[:, index].sum()),
        }
        f1_scores.append(f1)

    # Macro-F1 gives each food equal weight, even if some appear less often.
    macro_f1 = float(np.mean(f1_scores)) if f1_scores else 0.0
    return {"macro_f1": round(macro_f1, 4), "per_class": per_class}


def tune_thresholds(
    probs: np.ndarray,
    targets: np.ndarray,
    grid: np.ndarray | None = None,
) -> np.ndarray:
    """Choose the best F1 threshold for each food using validation data only."""
    if grid is None:
        grid = np.linspace(0.20, 0.85, 27)
    thresholds = np.full(probs.shape[1], 0.5, dtype=np.float32)

    for index in range(probs.shape[1]):
        actual = targets[:, index].astype(np.int32)
        best_f1 = -1.0
        for threshold in grid:
            predicted = (probs[:, index] >= threshold).astype(np.int32)
            _, _, f1 = precision_recall_f1(predicted, actual)
            # Keep the first threshold when two choices have the same score.
            if f1 > best_f1:
                best_f1 = f1
                thresholds[index] = float(threshold)

    return thresholds
