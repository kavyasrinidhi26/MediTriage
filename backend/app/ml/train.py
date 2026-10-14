"""
MediTriage AI — Reproducible ML Training & Artifact Serialization Pipeline
Trains triage level, department, and emergency classifiers with XGBoost / Scikit-learn fallback.
Prevents data leakage, evaluates emergency sensitivity, and saves versioned model artifacts.
"""

import os
import json
import argparse
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier

# Check for XGBoost availability
try:
    from xgboost import XGBClassifier
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False

from app.ml.schema import (
    ML_SCHEMA_VERSION,
    TRIAGE_5_TO_NAME,
    TRIAGE_3_TO_NAME,
)
from app.ml.pipeline import (
    build_preprocessor,
    prepare_features_and_targets,
)
from app.ml.evaluate import (
    compute_triage_metrics,
    compute_department_metrics,
)
from app.ml.synthetic_data import generate_synthetic_fixture

DEFAULT_ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "artifacts", "v1")


def select_classifier(
    use_xgboost: bool = True,
    random_state: int = 42,
    is_binary: bool = False,
):
    """
    Selects XGBoost if installed and requested, else falls back to HistGradientBoostingClassifier.
    """
    if use_xgboost and HAS_XGBOOST:
        model_name = "XGBoost"
        model = XGBClassifier(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.08,
            random_state=random_state,
            eval_metric="logloss" if is_binary else "mlogloss",
        )
    else:
        model_name = "HistGradientBoostingClassifier"
        model = HistGradientBoostingClassifier(
            max_iter=100,
            max_depth=5,
            random_state=random_state,
        )
    return model, model_name


def train_pipeline(
    data_path: Optional[str] = None,
    output_dir: str = DEFAULT_ARTIFACTS_DIR,
    use_xgboost: bool = True,
    random_seed: int = 42,
    synthetic_samples: int = 250,
) -> Dict[str, Any]:
    """
    Executes the full training, evaluation, and artifact serialization workflow.
    """
    os.makedirs(output_dir, exist_ok=True)

    # 1. Load Data
    is_synthetic = False
    if data_path:
        if not os.path.exists(data_path):
            raise FileNotFoundError(
                f"Dataset file not found at: {data_path}. "
                "Please verify the file path or omit --data to train on documented synthetic fixtures."
            )
        if data_path.endswith(".csv"):
            df = pd.read_csv(data_path)
        elif data_path.endswith(".parquet"):
            df = pd.read_parquet(data_path)
        else:
            df = pd.read_json(data_path)
        data_source_desc = f"Loaded from file: {data_path}"
    else:
        # User specified: If dataset is absent, use synthetic test fixtures only
        df = generate_synthetic_fixture(n_samples=synthetic_samples, random_seed=random_seed)
        is_synthetic = True
        data_source_desc = f"Synthetic training fixture ({synthetic_samples} samples, seed {random_seed})"

    # 2. Extract Features and Target
    X, y_triage = prepare_features_and_targets(df, target_col="triage_level")
    if y_triage is None:
        raise ValueError("Dataset does not contain 'triage_level' target column.")

    # 3. Stratified Train/Test Split (Prevent Leakage)
    # Check if min class count >= 2 for stratified split
    # 3. Stratified Train / Validation / Test Split (Strict Leakage Prevention)
    class_counts = y_triage.value_counts()
    stratify = y_triage if (class_counts.min() >= 3) else None

    # First hold out the test set (20%)
    X_train_val, X_test, y_train_val, y_test = train_test_split(
        X, y_triage,
        test_size=0.20,
        random_state=random_seed,
        stratify=stratify,
    )

    # Next split train_val into train (75%) and validation (25%) -> 60% train, 20% val, 20% test
    stratify_train = y_train_val if (y_train_val.value_counts().min() >= 2) else None
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_val, y_train_val,
        test_size=0.25,
        random_state=random_seed,
        stratify=stratify_train,
    )

    # Split integrity check: verify zero train-test ID / index overlap
    train_ids = set(X_train.index)
    val_ids = set(X_val.index)
    test_ids = set(X_test.index)
    train_test_overlap = len(train_ids.intersection(test_ids))
    train_val_overlap = len(train_ids.intersection(val_ids))
    val_test_overlap = len(val_ids.intersection(test_ids))
    assert train_test_overlap == 0, f"Train and test splits overlap by {train_test_overlap} samples!"
    assert train_val_overlap == 0, f"Train and validation splits overlap by {train_val_overlap} samples!"
    assert val_test_overlap == 0, f"Validation and test splits overlap by {val_test_overlap} samples!"

    # 4. Preprocessing Fit (Strictly on Train Split ONLY) & Transform
    preprocessor = build_preprocessor()
    X_train_trans = preprocessor.fit_transform(X_train)
    X_val_trans = preprocessor.transform(X_val)
    X_test_trans = preprocessor.transform(X_test)
    if hasattr(X_train_trans, "toarray"):
        X_train_trans = X_train_trans.toarray()
    if hasattr(X_val_trans, "toarray"):
        X_val_trans = X_val_trans.toarray()
    if hasattr(X_test_trans, "toarray"):
        X_test_trans = X_test_trans.toarray()

    # For XGBoost and Scikit-learn: labels must be 0-indexed contiguous integers based on train split
    unique_triage = sorted(list(y_triage.unique()))
    unique_train_triage = sorted(list(y_train.unique()))
    triage_to_idx = {val: idx for idx, val in enumerate(unique_train_triage)}
    idx_to_triage = {idx: val for val, idx in triage_to_idx.items()}

    y_train_encoded = y_train.map(triage_to_idx)
    y_val_encoded = y_val.map(triage_to_idx)
    y_test_encoded = y_test.map(triage_to_idx)

    # 5. Train Triage Classifier (Strictly on Train Split)
    triage_model, triage_model_name = select_classifier(
        use_xgboost=use_xgboost,
        random_state=random_seed,
        is_binary=(len(unique_triage) == 2),
    )
    triage_model.fit(X_train_trans, y_train_encoded)

    # Evaluate Triage Model across Train, Validation, and Test Splits separately
    train_preds_encoded = triage_model.predict(X_train_trans)
    train_triage_preds = pd.Series(train_preds_encoded).map(idx_to_triage).to_numpy()
    train_triage_metrics = compute_triage_metrics(
        y_true=y_train.to_numpy(),
        y_pred=train_triage_preds,
        labels=unique_triage,
        emergency_level=1,
    )

    val_preds_encoded = triage_model.predict(X_val_trans)
    val_triage_preds = pd.Series(val_preds_encoded).map(idx_to_triage).to_numpy()
    val_triage_metrics = compute_triage_metrics(
        y_true=y_val.to_numpy(),
        y_pred=val_triage_preds,
        labels=unique_triage,
        emergency_level=1,
    )

    test_preds_encoded = triage_model.predict(X_test_trans)
    test_triage_preds = pd.Series(test_preds_encoded).map(idx_to_triage).to_numpy()
    test_triage_metrics = compute_triage_metrics(
        y_true=y_test.to_numpy(),
        y_pred=test_triage_preds,
        labels=unique_triage,
        emergency_level=1,
    )

    # 6. Train Department Classifier (if supported by dataset)
    dept_model = None
    dept_train_metrics = None
    dept_val_metrics = None
    dept_test_metrics = None
    dept_to_idx = None
    idx_to_dept = None
    if "department" in df.columns and df["department"].nunique() > 1:
        y_dept = df.loc[X.index, "department"]
        unique_depts = sorted(list(y_dept.unique()))
        dept_to_idx = {d: idx for idx, d in enumerate(unique_depts)}
        idx_to_dept = {idx: d for d, idx in dept_to_idx.items()}

        y_dept_train = y_dept.loc[X_train.index].map(dept_to_idx)
        y_dept_val = y_dept.loc[X_val.index]
        y_dept_test = y_dept.loc[X_test.index]

        dept_model, dept_model_name = select_classifier(
            use_xgboost=use_xgboost,
            random_state=random_seed,
        )
        dept_model.fit(X_train_trans, y_dept_train)

        # Department metrics per split
        dept_train_preds = pd.Series(dept_model.predict(X_train_trans)).map(idx_to_dept).to_numpy()
        dept_train_metrics = compute_department_metrics(
            y_true=y_dept.loc[X_train.index].to_numpy(),
            y_pred=dept_train_preds,
            departments=unique_depts,
        )

        dept_val_preds = pd.Series(dept_model.predict(X_val_trans)).map(idx_to_dept).to_numpy()
        dept_val_metrics = compute_department_metrics(
            y_true=y_dept_val.to_numpy(),
            y_pred=dept_val_preds,
            departments=unique_depts,
        )

        dept_test_preds = pd.Series(dept_model.predict(X_test_trans)).map(idx_to_dept).to_numpy()
        dept_test_metrics = compute_department_metrics(
            y_true=y_dept_test.to_numpy(),
            y_pred=dept_test_preds,
            departments=unique_depts,
        )

    # 7. Train Emergency Classifier (if supported as distinct target)
    emerg_model = None
    if "is_emergency" in df.columns:
        y_emerg = df.loc[X.index, "is_emergency"]
        if y_emerg.nunique() == 2:
            emerg_model, _ = select_classifier(
                use_xgboost=use_xgboost,
                random_state=random_seed,
                is_binary=True,
            )
            emerg_model.fit(X_train_trans, y_emerg.loc[X_train.index])

    # 8. Save Preprocessor and Model Artifacts
    preprocessor_path = os.path.join(output_dir, "preprocessor.joblib")
    triage_model_path = os.path.join(output_dir, "model_triage.joblib")
    joblib.dump(preprocessor, preprocessor_path)
    joblib.dump(triage_model, triage_model_path)

    if dept_model is not None:
        dept_model_path = os.path.join(output_dir, "model_dept.joblib")
        joblib.dump(dept_model, dept_model_path)

    if emerg_model is not None:
        emerg_model_path = os.path.join(output_dir, "model_emergency.joblib")
        joblib.dump(emerg_model, emerg_model_path)

    # 9. Record Comprehensive Metadata
    metadata = {
        "model_version": "2026.1-triage-ml-v1",
        "schema_version": ML_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "random_seed": random_seed,
        "is_synthetic_training": is_synthetic,
        "data_source": data_source_desc,
        "training_samples_total": len(df),
        "train_samples": len(X_train),
        "val_samples": len(X_val),
        "test_samples": len(X_test),
        "split_counts": {
            "training": len(X_train),
            "validation": len(X_val),
            "test": len(X_test),
        },
        "split_integrity": {
            "train_test_id_overlap": train_test_overlap,
            "train_val_id_overlap": train_val_overlap,
            "val_test_id_overlap": val_test_overlap,
            "leakage_safeguard_verified": True,
        },
        "dataset_distribution": {
            "total_samples": len(df),
            "triage_class_counts": {str(k): int(v) for k, v in y_triage.value_counts().to_dict().items()},
            "train_class_counts": {str(k): int(v) for k, v in y_train.value_counts().to_dict().items()},
            "val_class_counts": {str(k): int(v) for k, v in y_val.value_counts().to_dict().items()},
            "test_class_counts": {str(k): int(v) for k, v in y_test.value_counts().to_dict().items()},
        },
        "triage_classifier_type": triage_model_name,
        "triage_label_mapping": {str(k): int(v) for k, v in triage_to_idx.items()},
        "department_supported": dept_model is not None,
        "department_label_mapping": dept_to_idx if dept_to_idx else {},
        "emergency_flag_supported": emerg_model is not None,
        "features_list": list(X.columns),
        "splits": {
            "training": {
                "sample_count": len(X_train),
                "triage": train_triage_metrics,
                "department": dept_train_metrics,
            },
            "validation": {
                "sample_count": len(X_val),
                "triage": val_triage_metrics,
                "department": dept_val_metrics,
            },
            "test": {
                "sample_count": len(X_test),
                "triage": test_triage_metrics,
                "department": dept_test_metrics,
            },
        },
        "evaluation_metrics": {
            "triage": test_triage_metrics,
            "department": dept_test_metrics,
            "train": train_triage_metrics,
            "validation": val_triage_metrics,
            "test": test_triage_metrics,
        },
        "disclaimer": (
            "HACKATHON PROTOCOL NOTICE: This machine-learning model is trained on "
            "synthetic fixtures / prototype records for decision support demonstration only. "
            "It is not approved as an independent clinical diagnostic device."
        ),
    }

    metadata_path = os.path.join(output_dir, "metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MediTriage AI ML Training Pipeline")
    parser.add_argument("--data", type=str, default=None, help="Path to CSV / Parquet dataset")
    parser.add_argument("--output", type=str, default=DEFAULT_ARTIFACTS_DIR, help="Output directory for artifacts")
    parser.add_argument("--no-xgb", action="store_true", help="Disable XGBoost and use Scikit-learn baseline")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--samples", type=int, default=250, help="Number of synthetic samples if dataset absent")

    args = parser.parse_args()
    meta = train_pipeline(
        data_path=args.data,
        output_dir=args.output,
        use_xgboost=not args.no_xgb,
        random_seed=args.seed,
        synthetic_samples=args.samples,
    )
    print("\n[SUCCESS] MediTriage AI Model Training Pipeline Completed.")
    print(f"Artifacts saved to: {args.output}")
    print(f"Triage Test Accuracy: {meta['evaluation_metrics']['triage']['accuracy'] * 100:.2f}%")
    print(f"Emergency Recall / Sensitivity: {meta['evaluation_metrics']['triage']['emergency_recall_sensitivity'] * 100:.2f}%")
    print(f"Emergency False Negatives: {meta['evaluation_metrics']['triage']['emergency_false_negatives']}")
