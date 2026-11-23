"""Prepare images the same way during training, evaluation, and photo recognition."""

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
    """Add borders instead of cropping foods out of the photo."""

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


def _build_transform(config: PreprocessingConfig | None, training: bool) -> T.Compose:
    cfg = config or PreprocessingConfig()
    steps = [
        PadToSquare(fill=cfg.pad_fill),
        T.Resize((cfg.image_size, cfg.image_size)),
    ]
    if training:
        # Vary training photos a little to handle different camera conditions.
        steps.extend([
            T.RandomHorizontalFlip(p=0.5),
            T.RandomRotation(degrees=12, fill=cfg.pad_fill),
            T.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15),
        ])
    steps.extend([
        T.ToTensor(),
        T.Normalize(mean=cfg.mean, std=cfg.std),
    ])
    return T.Compose(steps)


def build_eval_transform(config: PreprocessingConfig | None = None) -> T.Compose:
    """Use fixed image settings when checking or serving the model."""
    return _build_transform(config, training=False)


def build_train_transform(config: PreprocessingConfig | None = None) -> T.Compose:
    """Use the same base settings with small changes for training photos."""
    return _build_transform(config, training=True)
