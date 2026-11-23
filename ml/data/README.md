# Training Data — FoodSeg103

NutriLog uses **FoodSeg103** (7,118 meal images, 103 food categories + background) to train a **multi-label image classifier** without building a segmentation model: if rice, broccoli, and poultry appear in an image's segmentation mask, the training target includes all three.

We start with **~10–12 supported categories** selected after auditing the archive:
`rice`, `bread`, `noodles`, `potatoes`, `broccoli`, `carrots`, `tomatoes`, `lettuce`, `eggs`, `fish`, `steak`, `poultry`.

---

## Attribution & Terms

- **Dataset:** FoodSeg103 (Wu et al., *"A Large-Scale Benchmark for Food Image Segmentation"*, ACM Multimedia 2021)
- **Official project page:** https://xiongweiwu.github.io/foodseg103.html
- **Usage:** Academic / non-commercial research & educational use — review the dataset's license/terms on the official page before redistribution. Do **not** commit raw images or masks to this repository.

---

## Expected Directory Layout

Download and extract FoodSeg103 into `ml/data/FoodSeg103/`:

```text
ml/data/FoodSeg103/
├── category_id.txt
└── Images/
    ├── img_dir/
    │   ├── train/   (*.jpg)
    │   └── test/    (*.jpg)
    └── ann_dir/
        ├── train/   (*.png — pixel values are FoodSeg103 category IDs; 0 = background)
        └── test/    (*.png)
```

---

## Step 1 — Audit & Generate Versioned Splits

Once extracted, run the audit script to inspect class counts across all 103 categories and generate versioned splits in `ml/data/processed/`:

```powershell
cd C:\Users\valdi\LocalProjects\cs-152\NutriLog\ml
.venv\Scripts\activate
python audit_dataset.py --data data/FoodSeg103 --version v1
```

This creates:
- `data/processed/class_counts_v1.json` — full 103-category counts
- `data/processed/labels_v1.json` — versioned selected categories + FoodSeg103 ID mappings
- `data/processed/train_split_v1.json`, `val_split_v1.json`, `test_split_v1.json`

Review the printed counts table, adjust `--categories` if needed, and then run training:

```powershell
python train.py --data data/FoodSeg103 --splits data/processed --version v1 --use-pos-weight --eval-test
```

This saves `ml/model/weights.pth` and `ml/model/model_meta.json` together.
