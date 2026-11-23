"""
ml/preprocessing.py
-------------------
Shared image preprocessing for training, validation, testing, and production
inference. Keeping this in one module guarantees identical preprocessing
between evaluation and deployment.

Key design rule:
    Resize WITH padding (pad-to-square) instead of center/random cropping.
    Aggressive cropping can remove a food near the edge of the plate while
    leaving its label in the multi-label target.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Sequence

import torchvision.transforms as T
import torchvision.transforms.functional as TF
from PIL import Image


IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


@dataclass(frozen=True)
class PreprocessingConfig:
    image_size: int = 224
    pad_fill: int = 0
    mean: tuple[float, float, float] = IMAGENET_MEAN
    std: tuple[float, float, float] = IMAGENET_STD

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "PreprocessingConfig":
        return cls(
            image_size=int(data.get("image_size", 224)),
            pad_fill=int(data.get("pad_fill", 0)),
            mean=tuple(float(x) for x in data.get("mean", IMAGENET_MEAN)),  # type: ignore[arg-type]
            std=tuple(float(x) for x in data.get("std", IMAGENET_STD)),  # type: ignore[arg-type]
        )


class PadToSquare:
    """Pad a PIL image symmetrically to a square so the entire plate stays visible."""

    def __init__(self, fill: int | Sequence[int] = 0) -> None:
        self.fill = fill

    def __call__(self, image: Image.Image) -> Image.Image:
        width, height = image.size
        if width == height:
            return image
        max_side = max(width, height)
        pad_left = (max_side - width) // 2
        pad_top = (max_side - height) // 2
        pad_right = max_side - width - pad_left
        pad_bottom = max_side - height - pad_top
        return TF.pad(image, [pad_left, pad_top, pad_right, pad_bottom], fill=self.fill)


def build_eval_transform(config: PreprocessingConfig | None = None) -> T.Compose:
    """Deterministic transform used identically in validation, testing, and inference."""
    cfg = config or PreprocessingConfig()
    return T.Compose([
        PadToSquare(fill=cfg.pad_fill),
        T.Resize((cfg.image_size, cfg.image_size)),
        T.ToTensor(),
        T.Normalize(mean=cfg.mean, std=cfg.std),
    ])


def build_train_transform(config: PreprocessingConfig | None = None) -> T.Compose:
    """Modest, label-preserving augmentations that keep the whole plate in frame."""
    cfg = config or PreprocessingConfig()
    return T.Compose([
        PadToSquare(fill=cfg.pad_fill),
        T.Resize((cfg.image_size, cfg.image_size)),
        T.RandomHorizontalFlip(p=0.5),
        T.RandomRotation(degrees=12, fill=cfg.pad_fill),
        T.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15),
        T.ToTensor(),
        T.Normalize(mean=cfg.mean, std=cfg.std),
    ])
