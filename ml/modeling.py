"""Build the same classifier for training and photo recognition."""

from torch import nn
from torchvision import models


def build_efficientnet_b0(num_classes: int, pretrained: bool = True) -> nn.Module:
    weights = models.EfficientNet_B0_Weights.DEFAULT if pretrained else None
    model = models.efficientnet_b0(weights=weights)
    # Give each supported food its own output score.
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model
