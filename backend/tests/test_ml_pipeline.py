"""
Unit & Integration Tests for MediTriage AI ML Training & Evaluation Pipeline
Tests feature hygiene, non-leakage, reproducible splits, fallback models, and artifacts.
"""

import os
import tempfile
import pytest
import pandas as pd
import numpy as np

from app.ml.schema import (
    sanitize_features,
    FORBIDDEN_COLUMNS,
    NUMERICAL_FEATURE_COLUMNS,
    CATEGORICAL_FEATURE_COLUMNS,
)
from app.ml.synthetic_data import generate_synthetic_fixture
from app.ml.pipeline import build_preprocessor, prepare_features_and_targets
from app.ml.train import train_pipeline
from app.ml.evaluate import compute_triage_metrics, compute_department_metrics


def test_feature_hygiene_and_leakage_prevention():
    """Test that all identifiers, post-outcome fields, and target labels are strictly filtered out."""
    dirty_columns = [
        "age",
        "pulse_bpm",
        "patient_id",
        "patient_name",
        "token_number",
        "admission_status",
        "discharged_at",
        "final_diagnosis",
        "triage_category",
        "is_emergency",
        "chief_complaint",
    ]
    clean_columns = sanitize_features(dirty_columns)

    for forbidden in ["patient_id", "patient_name", "token_number", "admission_status", "discharged_at", "final_diagnosis"]:
        assert forbidden not in clean_columns, f"Leaked forbidden column: {forbidden}"

    assert "age" in clean_columns
    assert "pulse_bpm" in clean_columns
    assert "chief_complaint" in clean_columns


def test_synthetic_fixture_generation_reproducibility():
    """Test that synthetic fixture generates deterministic records matching schema."""
    df1 = generate_synthetic_fixture(n_samples=50, random_seed=123)
    df2 = generate_synthetic_fixture(n_samples=50, random_seed=123)

    assert len(df1) == 50
    assert df1.equals(df2), "Synthetic fixture generator must be strictly reproducible given random_seed."
    assert "triage_level" in df1.columns
    assert "department" in df1.columns
    assert "is_emergency" in df1.columns
    assert "chief_complaint" in df1.columns


def test_preprocessor_handles_missing_values_and_text():
    """Test that ColumnTransformer handles missing vitals and extracts text without raising errors."""
    df = generate_synthetic_fixture(n_samples=30, random_seed=42)
    X, y = prepare_features_and_targets(df, target_col="triage_level")

    preprocessor = build_preprocessor()
    X_trans = preprocessor.fit_transform(X)

    assert isinstance(X_trans, np.ndarray)
    assert X_trans.shape[0] == 30
    assert not np.isnan(X_trans).any(), "Preprocessed matrix must have all missing values imputed."


def test_metrics_computation_emergency_recall_and_false_negatives():
    """Test that triage evaluation correctly identifies emergency false negatives and recall."""
    y_true = np.array([1, 1, 1, 2, 3, 4, 5])
    # 2 true emergencies predicted correctly as 1; 1 true emergency mistakenly predicted as 3 (false negative!)
    y_pred = np.array([1, 1, 3, 2, 3, 4, 5])

    metrics = compute_triage_metrics(y_true, y_pred, emergency_level=1)

    assert metrics["emergency_cases_total"] == 3
    assert metrics["emergency_false_negatives"] == 1
    assert metrics["emergency_recall_sensitivity"] == round(2 / 3, 4)
    assert "confusion_matrix" in metrics
    assert "per_class_metrics" in metrics


def test_train_pipeline_scikit_learn_fallback_and_artifact_saving():
    """Test full training pipeline execution with Scikit-learn fallback in a temporary directory."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        meta = train_pipeline(
            data_path=None,  # triggers synthetic fixture
            output_dir=tmp_dir,
            use_xgboost=False,  # forces Scikit-learn baseline
            random_seed=42,
            synthetic_samples=80,
        )

        assert meta["triage_classifier_type"] == "HistGradientBoostingClassifier"
        assert meta["train_samples"] > 0
        assert meta["test_samples"] > 0
        assert "accuracy" in meta["evaluation_metrics"]["triage"]

        # Verify saved artifacts on disk
        assert os.path.exists(os.path.join(tmp_dir, "model_triage.joblib"))
        assert os.path.exists(os.path.join(tmp_dir, "preprocessor.joblib"))
        assert os.path.exists(os.path.join(tmp_dir, "metadata.json"))


def test_train_pipeline_missing_dataset_raises_explicit_file_not_found():
    """Verify that specifying a non-existent dataset raises FileNotFoundError explicitly."""
    with pytest.raises(FileNotFoundError) as exc_info:
        train_pipeline(data_path="/non/existent/missing_dataset.csv")
    assert "Dataset file not found at" in str(exc_info.value)


def test_inference_does_not_display_made_up_confidence_percentage():
    """Verify inference explanations do not fabricate confidence percentages."""
    from app.ml.inference import TriageInferenceService
    service = TriageInferenceService()
    res = service.assess(
        age=45,
        gender="Male",
        chief_complaint="Routine high blood pressure checkup and tablet renewal",
        systolic_bp=125,
        diastolic_bp=82,
        pulse_bpm=72,
        temperature=98.6,
        spo2=99.0,
    )
    # The explanation must NOT include made-up confidence percentages
    assert "% model confidence" not in res["model_explanation"]
    assert "confidence_score" not in res
    assert "confidence_percentage" not in res


def test_multilingual_indic_text_tokenization():
    """Verify preprocessor tokenizes Telugu and mixed multilingual complaints properly."""
    preprocessor = build_preprocessor()
    sample_df = pd.DataFrame([{
        "age": 50,
        "gender": "Female",
        "chief_complaint": "ఛాతీలో తీవ్రమైన నొప్పి మరియు చెమటలు (Severe chest pain in Telugu)",
        "known_conditions_text": "Hypertension",
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "pulse_bpm": 80,
        "temperature_f": 98.6,
        "temperature_unit": "F",
        "spo2": 98.0,
        "respiratory_rate": 18,
        "avpu": "ALERT",
    }])
    transformed = preprocessor.fit_transform(sample_df)
    assert transformed.shape[0] == 1
    assert transformed.shape[1] > 0

