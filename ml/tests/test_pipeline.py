"""Check model math, image handling, and training without downloading weights."""

import io
import json
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import torch
from fastapi.testclient import TestClient
from PIL import Image

import server
import train
from audit_dataset import project_records, resolve_selected_categories
from metrics import compute_multilabel_metrics, precision_recall_f1, tune_thresholds
from modeling import build_efficientnet_b0
from predict import FoodPrediction, SupportedCategory
from preprocessing import PadToSquare, PreprocessingConfig, build_eval_transform


class MetricTests(unittest.TestCase):
    def test_false_positives_and_missed_foods(self):
        predicted = np.array([1, 1, 1, 0, 0])
        actual = np.array([1, 1, 0, 1, 1])
        precision, recall, f1 = precision_recall_f1(predicted, actual)
        self.assertAlmostEqual(precision, 2 / 3)
        self.assertAlmostEqual(recall, 1 / 2)
        self.assertAlmostEqual(f1, 4 / 7)

    def test_no_positive_predictions(self):
        for actual in [np.zeros(3), np.ones(3)]:
            self.assertEqual(precision_recall_f1(np.zeros(3), actual), (0, 0, 0))

    def test_macro_f1_gives_each_food_equal_weight(self):
        probs = np.array([[0.8, 0.2], [0.9, 0.1], [0.7, 0.2]])
        actual = np.array([[1, 1], [1, 0], [1, 0]])
        result = compute_multilabel_metrics(probs, actual, np.array([0.5, 0.5]), ['rice', 'fish'])
        self.assertEqual(result['macro_f1'], 0.5)
        self.assertEqual(result['per_class']['rice']['support'], 3)
        self.assertEqual(result['per_class']['fish']['f1'], 0)

    def test_threshold_selection_keeps_first_tie(self):
        thresholds = tune_thresholds(np.array([[0.8], [0.2]]), np.array([[1], [0]]), np.array([0.3, 0.5, 0.9]))
        self.assertAlmostEqual(float(thresholds[0]), 0.3)


class ImageAndLabelTests(unittest.TestCase):
    def test_padding_keeps_edge_pixels(self):
        padded = PadToSquare()(Image.new('RGB', (5, 2), 'red'))
        self.assertEqual(padded.size, (5, 5))
        self.assertEqual(padded.getpixel((0, 1)), (255, 0, 0))
        self.assertEqual(padded.getpixel((4, 2)), (255, 0, 0))
        self.assertEqual(padded.getpixel((0, 0)), (0, 0, 0))

    def test_saved_preprocessing_settings_round_trip(self):
        config = PreprocessingConfig(image_size=32, pad_fill=10)
        restored = PreprocessingConfig.from_dict(json.loads(json.dumps(config.to_dict())))
        image = Image.new('RGB', (15, 8), 'green')
        torch.testing.assert_close(build_eval_transform(config)(image), build_eval_transform(restored)(image))

    def test_category_aliases_and_negative_images(self):
        selected = resolve_selected_categories({0: 'background', 1: 'noodles', 2: 'pasta'}, ['noodles'])
        records = [{'image': 'meal.jpg', 'foodseg_ids': [1, 2]}, {'image': 'other.jpg', 'foodseg_ids': [9]}]
        self.assertEqual(project_records(records, selected, True), [
            {'image': 'meal.jpg', 'labels': ['noodles']},
            {'image': 'other.jpg', 'labels': []},
        ])
        self.assertEqual(len(project_records(records, selected, False)), 1)


class UploadTests(unittest.TestCase):
    def setUp(self):
        model = SimpleNamespace(
            model_ready=True,
            model_version='test-model',
            supported_categories=[SupportedCategory('rice', 'Rice')],
            predict=lambda image: [FoodPrediction('rice', 'Rice', 0.9)],
        )
        self.patch = patch.object(server, 'FoodClassifier', return_value=model)
        self.patch.start()
        self.client = TestClient(server.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.patch.stop()

    def test_valid_photo_returns_existing_response_shape(self):
        content = io.BytesIO()
        Image.new('RGB', (10, 10), 'green').save(content, format='PNG')
        response = self.client.post('/analyze', files={'file': ('meal.png', content.getvalue(), 'image/png')})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'predictions': [{'label': 'rice', 'display': 'Rice', 'confidence': 0.9}],
            'model_ready': True,
            'model_version': 'test-model',
            'supported_categories': [{'label': 'rice', 'display': 'Rice'}],
        })

    def test_invalid_uploads_get_useful_errors(self):
        cases = [(b'', 'image/png', 422), (b'not an image', 'image/jpeg', 422), (b'<svg/>', 'image/svg+xml', 422), (b'x' * (20 * 1024 * 1024 + 1), 'image/png', 413)]
        for content, content_type, expected in cases:
            with self.subTest(content_type=content_type, length=len(content)):
                response = self.client.post('/analyze', files={'file': ('meal', content, content_type)})
                self.assertEqual(response.status_code, expected)
                self.assertIn('detail', response.json())

    def test_truncated_image_is_rejected_before_prediction(self):
        content = io.BytesIO()
        Image.new('RGB', (100, 100), 'red').save(content, format='PNG')
        response = self.client.post('/analyze', files={'file': ('meal.png', content.getvalue()[:80], 'image/png')})
        self.assertEqual(response.status_code, 422)

    def test_startup_error_remains_retryable(self):
        with patch.object(server, '_classifier', None):
            response = self.client.post('/analyze', files={'file': ('meal.png', b'image', 'image/png')})
        self.assertEqual(response.status_code, 503)


class TrainingTests(unittest.TestCase):
    def test_small_training_run_saves_reloadable_bundle(self):
        # Temporary files keep this check from overwriting the real model.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = []
            for index, color in enumerate(['red', 'green']):
                name = f'{index}.png'
                Image.new('RGB', (32, 32), color).save(root / name)
                records.append({'image': name, 'labels': ['rice'] if index == 0 else []})
            for split in ['train', 'val', 'test']:
                (root / f'{split}_split_test.json').write_text(json.dumps(records))
            (root / 'labels_test.json').write_text(json.dumps({'categories': [{'label': 'rice', 'display': 'Rice'}]}))
            args = Namespace(data=str(root), splits=str(root), version='test', image_size=32, batch_size=2, workers=0, use_pos_weight=True, head_epochs=1, finetune_epochs=1, head_lr=0.001, finetune_lr=0.0001, eval_test=True)
            with patch.object(train, 'MODEL_DIR', root / 'model'), patch.object(train, 'build_efficientnet_b0', side_effect=lambda num_classes, pretrained: build_efficientnet_b0(num_classes, pretrained=False)), patch.object(torch.cuda, 'is_available', return_value=False):
                train.train(args)
            meta = json.loads((root / 'model/model_meta.json').read_text())
            self.assertIn('macro_f1', meta['test_metrics'])
            model = build_efficientnet_b0(1, pretrained=False)
            model.load_state_dict(torch.load(root / 'model/weights.pth', weights_only=True))
            self.assertEqual(meta['labels'][0]['label'], 'rice')


if __name__ == '__main__':
    unittest.main()
