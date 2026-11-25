"""Load the saved food model and return predictions above its chosen thresholds."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import torch
from PIL import Image

from categories import DEFAULT_CANDIDATES
from modeling import build_efficientnet_b0
from preprocessing import PreprocessingConfig, build_eval_transform

ML_DIR = Path(__file__).parent
MODEL_PATH = ML_DIR / "model" / "weights.pth"
META_PATH = ML_DIR / "model" / "model_meta.json"

DEFAULT_CANDIDATE_LABELS = [
    {"label": label, "display": label.title(), "threshold": 0.5}
    for label in DEFAULT_CANDIDATES
]


@dataclass(frozen=True)
class SupportedCategory:
    label: str
    display: str


@dataclass(frozen=True)
class FoodPrediction:
    label: str
    display: str
    confidence: float


class FoodClassifier:
    """Load the model once and reuse it for each photo."""

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
            # Read saved labels, thresholds, and image resize settings.
            meta = json.loads(META_PATH.read_text(encoding="utf-8"))
            self.model_version = str(meta.get("model_version", "foodseg103-effnetb0-v1"))
            self._label_entries = list(meta["labels"])
            self._prep_config = PreprocessingConfig.from_dict(meta.get("preprocessing", {}))
            self._transform = build_eval_transform(self._prep_config)

            # Build the same EfficientNet-B0 layout and load the trained weights.
            model = build_efficientnet_b0(len(self._label_entries), pretrained=False)
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
        """Return matching foods, highest confidence first."""
        if not self.model_ready or self._model is None:
            return []

        # Pad and resize the photo the same way we did during evaluation.
        tensor = self._transform(image.convert("RGB")).unsqueeze(0).to(self._device)

        with torch.no_grad():
            logits = self._model(tensor)[0]
            # Sigmoid gives each food an independent 0-1 score so multiple foods can match.
            scores = torch.sigmoid(logits).cpu().tolist()

        # Keep only foods that pass their saved confidence threshold.
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
