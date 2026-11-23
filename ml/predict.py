"""
ml/predict.py
-------------
Multi-label food image classifier backed by torchvision EfficientNet-B0.

Loads the versioned artifact bundle produced by ml/train.py:
    - ml/model/weights.pth
    - ml/model/model_meta.json (label order, per-class thresholds, preprocessing, model_version)

Inference rules:
    - Uses identical pad-to-square + resize preprocessing as evaluation.
    - Applies sigmoid independently to each supported category logit.
    - Returns only categories whose score >= their frozen validation threshold.
    - An empty list [] is a valid result when no supported food passes threshold.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import torch
from PIL import Image
from torchvision import models

from preprocessing import PreprocessingConfig, build_eval_transform

ML_DIR = Path(__file__).parent
MODEL_PATH = ML_DIR / "model" / "weights.pth"
META_PATH = ML_DIR / "model" / "model_meta.json"

DEFAULT_CANDIDATE_LABELS: list[dict] = [
    {"label": "rice", "display": "Rice", "threshold": 0.5},
    {"label": "bread", "display": "Bread", "threshold": 0.5},
    {"label": "noodles", "display": "Noodles", "threshold": 0.5},
    {"label": "potatoes", "display": "Potatoes", "threshold": 0.5},
    {"label": "broccoli", "display": "Broccoli", "threshold": 0.5},
    {"label": "carrots", "display": "Carrots", "threshold": 0.5},
    {"label": "tomatoes", "display": "Tomatoes", "threshold": 0.5},
    {"label": "lettuce", "display": "Lettuce", "threshold": 0.5},
    {"label": "eggs", "display": "Eggs", "threshold": 0.5},
    {"label": "fish", "display": "Fish", "threshold": 0.5},
    {"label": "steak", "display": "Steak", "threshold": 0.5},
    {"label": "poultry", "display": "Poultry", "threshold": 0.5},
]


@dataclass(frozen=True)
class SupportedCategory:
    label: str
    display: str


@dataclass(frozen=True)
class FoodPrediction:
    label: str        # e.g. "poultry"
    display: str      # e.g. "Poultry"
    confidence: float # independent sigmoid score, 0.0 - 1.0


class FoodClassifier:
    """Multi-label EfficientNet-B0 classifier loaded once at server startup."""

    def __init__(self) -> None:
        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model_ready: bool = False
        self.model_version: str = "untrained-dev"
        self._label_entries: list[dict] = DEFAULT_CANDIDATE_LABELS
        self._prep_config = PreprocessingConfig()
        self._transform = build_eval_transform(self._prep_config)
        self._model: torch.nn.Module | None = None

        self._load_bundle()

    def _load_bundle(self) -> None:
        if META_PATH.exists() and MODEL_PATH.exists():
            meta = json.loads(META_PATH.read_text(encoding="utf-8"))
            self.model_version = str(meta.get("model_version", "foodseg103-effnetb0-v1"))
            self._label_entries = list(meta["labels"])
            self._prep_config = PreprocessingConfig.from_dict(meta.get("preprocessing", {}))
            self._transform = build_eval_transform(self._prep_config)

            model = models.efficientnet_b0(weights=None)
            in_features = model.classifier[1].in_features
            model.classifier[1] = torch.nn.Linear(in_features, len(self._label_entries))
            state = torch.load(MODEL_PATH, map_location=self._device, weights_only=True)
            model.load_state_dict(state)
            model.to(self._device)
            model.eval()

            self._model = model
            self.model_ready = True
            print(
                f"[ml] Loaded {self.model_version} ({len(self._label_entries)} categories) "
                f"from {MODEL_PATH} on {self._device}"
            )
        else:
            print(
                "[ml] WARNING: model bundle not found (need ml/model/weights.pth and "
                "ml/model/model_meta.json). Running in untrained dev mode (model_ready=False). "
                "Run audit_dataset.py and train.py to generate a trained model."
            )

    @property
    def supported_categories(self) -> list[SupportedCategory]:
        return [
            SupportedCategory(label=entry["label"], display=entry["display"])
            for entry in self._label_entries
        ]

    def predict(self, image: Image.Image) -> list[FoodPrediction]:
        """Return thresholded multi-label food predictions sorted by confidence."""
        if not self.model_ready or self._model is None:
            return []

        tensor = self._transform(image.convert("RGB")).unsqueeze(0).to(self._device)

        with torch.no_grad():
            logits = self._model(tensor)[0]
            scores = torch.sigmoid(logits).cpu().tolist()

        predictions: list[FoodPrediction] = []
        for entry, score in zip(self._label_entries, scores):
            threshold = float(entry.get("threshold", 0.5))
            if score >= threshold:
                predictions.append(
                    FoodPrediction(
                        label=entry["label"],
                        display=entry["display"],
                        confidence=round(float(score), 4),
                    )
                )

        predictions.sort(key=lambda item: item.confidence, reverse=True)
        return predictions
