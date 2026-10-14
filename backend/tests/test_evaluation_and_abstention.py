"""
MediTriage AI — Test Suite for Evaluation and Abstention Requirements
Verifies:
1. 20x asymmetric clinical penalty for under-triaging true emergencies.
2. Emergency recall calculation with explicit numerator / denominator and empty-set handling.
3. Explicit abstention mandate ("Cannot assess — send to nurse now.") on malformed vitals,
   contradictory inputs, and low prediction confidence.
4. Deterministic emergency safety overrides always taking precedence over data issues or low confidence.
5. Invariant that abstentions are never automatically counted as autonomous Level 1 predictions.
6. Zero train-test split ID overlap and feature leakage prevention.
"""

import pytest
import numpy as np
import pandas as pd
from unittest.mock import MagicMock

from app.ml.evaluate import (
    compute_asymmetric_clinical_cost,
    compute_triage_metrics,
    compute_official_weighted_score,
    compute_abstention_metrics,
)
from app.ml.inference import TriageInferenceService
from app.ml.schema import FORBIDDEN_COLUMNS, NUMERICAL_FEATURE_COLUMNS, CATEGORICAL_FEATURE_COLUMNS
from app.ml.train import train_pipeline
from app.config import get_settings


def test_asymmetric_clinical_cost_calculation():
    """
    Verifies that under-triaging true emergencies (y_true=1, y_pred != 1)
    incurs an asymmetric 20x penalty, while non-emergency errors incur 1x.
    """
    # 4 patients:
    # 0: True emergency (1) predicted as Emergency (1) -> 0 cost
    # 1: True emergency (1) under-triaged as Routine (3) -> 20.0 cost
    # 2: Non-emergency (3) over-triaged as Priority (2) -> 1.0 cost
    # 3: Non-emergency (4) correctly predicted (4) -> 0 cost
    y_true = np.array([1, 1, 3, 4])
    y_pred = np.array([1, 3, 2, 4])

    cost_metrics = compute_asymmetric_clinical_cost(
        y_true=y_true,
        y_pred=y_pred,
        emergency_level=1,
        under_triage_penalty=20.0,
    )

    assert cost_metrics["under_triage_penalty_weight"] == 20.0
    assert cost_metrics["emergency_under_triage_count"] == 1
    assert cost_metrics["emergency_under_triage_cost"] == 20.0
    assert cost_metrics["non_emergency_misclassifications_count"] == 1
    assert cost_metrics["total_asymmetric_clinical_loss"] == 21.0
    assert cost_metrics["mean_clinical_loss_per_patient"] == 21.0 / 4.0
    assert cost_metrics["evaluator_dependency_status"] == "PROVISIONAL_SPECIFICATION_NO_EXTERNAL_EVALUATOR_SUPPLIED"


def test_emergency_recall_numerator_denominator_and_display():
    """
    Verifies emergency sensitivity reporting includes exact numerator,
    denominator, and readable ratio string.
    """
    # 5 true emergencies, model correctly identifies 4 of them
    y_true = np.array([1, 1, 1, 1, 1, 2, 3, 4])
    y_pred = np.array([1, 1, 1, 1, 3, 2, 3, 4])  # 4 TP, 1 FN

    metrics = compute_triage_metrics(
        y_true=y_true,
        y_pred=y_pred,
        labels=[1, 2, 3, 4],
        emergency_level=1,
    )

    assert metrics["emergency_cases_total"] == 5
    assert metrics["emergency_recall_numerator"] == 4
    assert metrics["emergency_recall_denominator"] == 5
    assert metrics["emergency_recall_sensitivity"] == 0.8
    assert metrics["emergency_false_negatives"] == 1
    assert "4/5" in metrics["emergency_recall_display"]
    assert "80.0%" in metrics["emergency_recall_display"]
    assert metrics["is_emergency_set_empty"] is False


def test_empty_emergency_evaluation_set_handling():
    """
    CRITICAL REQUIREMENT: Evaluator must handle an empty emergency evaluation set
    cleanly (returning None / N/A) without misleadingly reporting 100% recall.
    """
    # Evaluation set with only routine patients (no level 1)
    y_true = np.array([2, 3, 4, 5])
    y_pred = np.array([2, 3, 4, 5])

    metrics = compute_triage_metrics(
        y_true=y_true,
        y_pred=y_pred,
        labels=[2, 3, 4, 5],
        emergency_level=1,
    )

    assert metrics["emergency_cases_total"] == 0
    assert metrics["emergency_recall_sensitivity"] is None
    assert metrics["emergency_recall_numerator"] == 0
    assert metrics["emergency_recall_denominator"] == 0
    assert metrics["is_emergency_set_empty"] is True
    assert "Insufficient data" in metrics["emergency_recall_display"] or "N/A" in metrics["emergency_recall_display"]

    # Official weighted score must handle empty emergency set gracefully
    score_info = metrics["official_weighted_score"]
    assert score_info is not None
    assert score_info["emergency_set_evaluated"] is False


def test_explicit_abstention_on_malformed_and_contradictory_vitals():
    """
    Verifies that malformed or contradictory vitals trigger the exact required message:
    'Cannot assess — send to nurse now.' and hold in nurse review (Level 2 priority).
    """
    service = TriageInferenceService()

    # Contradictory vitals: Systolic BP 100, Diastolic BP 105 (diastolic > systolic, without shock or hypertensive crisis)
    res = service.assess(
        age=45,
        gender="Male",
        chief_complaint="Mild persistent cough for three days",
        systolic_bp=100,
        diastolic_bp=105,
        pulse_bpm=75,
        temperature=98.6,
        spo2=98.0,
    )

    assert res["triage_level_name"] == "Cannot assess — send to nurse now."
    assert "Cannot assess — send to nurse now." in res["clinical_disclaimer"]
    assert res["abstention_status"] == "ABSTAINED_DATA_QUALITY_HOLD"
    assert res["human_review_required"] is True
    assert res["triage_level"] == 2  # Priority nurse hold, never placed at end of queue


def test_explicit_abstention_on_low_confidence():
    """
    Verifies that when machine learning prediction confidence falls below the
    abstention threshold without a critical override, the system abstains with
    'Cannot assess — send to nurse now.'
    """
    service = TriageInferenceService()
    # Mock preprocessor and model to simulate loaded state with low confidence
    service.is_loaded = True
    service.preprocessor = MagicMock()
    service.preprocessor.transform.return_value = np.zeros((1, 10))
    service.metadata = {
        "model_version": "test-v1",
        "triage_label_mapping": {"1": 0, "2": 1, "3": 2, "4": 3, "5": 4},
        "department_label_mapping": {"General Medicine": 0},
    }

    mock_model = MagicMock()
    # 5 classes with max probability 0.25 (below default threshold 0.35)
    mock_model.predict_proba.return_value = np.array([[0.10, 0.20, 0.25, 0.25, 0.20]])
    mock_model.classes_ = np.array([0, 1, 2, 3, 4])
    service.model_triage = mock_model
    service.model_dept = None
    service.model_emergency = None

    res = service.assess(
        age=30,
        gender="Female",
        chief_complaint="Vague non-specific fatigue",
        systolic_bp=120,
        diastolic_bp=80,
        pulse_bpm=72,
        temperature=98.4,
        spo2=99.0,
        confidence_threshold=0.35,
    )

    assert res["triage_level_name"] == "Cannot assess — send to nurse now."
    assert res["abstention_status"] == "ABSTAINED_LOW_CONFIDENCE"
    assert "Cannot assess — send to nurse now." in res["clinical_disclaimer"]
    assert res["human_review_required"] is True
    assert res["triage_level"] == 2  # Nurse holding queue, never Level 4 or 5


def test_emergency_override_takes_precedence_over_invalid_vitals():
    """
    CRITICAL SAFETY REQUIREMENT: Life-threatening complaints (e.g. chest pain with diaphoresis)
    MUST trigger Level 1 emergency override even when vitals are malformed/contradictory,
    and must NEVER be demoted or silenced.
    """
    service = TriageInferenceService()

    res = service.assess(
        age=58,
        gender="Male",
        chief_complaint="Severe crushing retrosternal chest pain radiating to left arm with profuse sweating",
        systolic_bp=80,
        diastolic_bp=120,  # Contradictory BP entry
        pulse_bpm=110,
        temperature=98.6,
        spo2=95.0,
    )

    assert res["triage_level"] == 1
    assert "Resuscitation" in res["triage_level_name"] or "Level 1" in res["triage_level_name"]
    assert res["recommended_department"] == "Emergency / Casualty"
    assert res["model_emergency_flag"] is True
    # Blocking error is preserved and flagged in warnings
    assert len(res["invalid_data_warnings"]) > 0
    assert any("Diastolic" in w for w in res["invalid_data_warnings"])


def test_emergency_override_takes_precedence_over_low_confidence():
    """
    CRITICAL SAFETY REQUIREMENT: Life-threatening complaints MUST trigger Level 1
    emergency override even if model confidence is low. Low model confidence must
    NEVER downgrade a true emergency.
    """
    service = TriageInferenceService()
    service.is_loaded = True
    service.preprocessor = MagicMock()
    service.preprocessor.transform.return_value = np.zeros((1, 10))
    service.metadata = {
        "model_version": "test-v1",
        "triage_label_mapping": {"1": 0, "2": 1, "3": 2, "4": 3, "5": 4},
    }

    mock_model = MagicMock()
    # Model mistakenly predicts Level 4 with low confidence
    mock_model.predict_proba.return_value = np.array([[0.05, 0.10, 0.20, 0.40, 0.25]])
    mock_model.classes_ = np.array([0, 1, 2, 3, 4])
    service.model_triage = mock_model

    res = service.assess(
        age=62,
        gender="Female",
        chief_complaint="Sudden severe facial droop and right-sided arm weakness since 30 minutes",
        systolic_bp=160,
        diastolic_bp=95,
        pulse_bpm=88,
        temperature=98.4,
        spo2=98.0,
        confidence_threshold=0.50,
    )

    assert res["triage_level"] == 1
    assert "Resuscitation" in res["triage_level_name"] or "Level 1" in res["triage_level_name"]
    assert res["recommended_department"] == "Emergency / Casualty"
    assert res["model_emergency_flag"] is True
    assert res["abstention_status"] == "SAFETY_OVERRIDE"


def test_abstention_not_counted_as_autonomous_level1_prediction():
    """
    Verifies the evaluator invariant: an abstention routed to a nurse is NOT
    counted as an autonomous Level 1 prediction in model metrics.
    """
    y_true = np.array([1, 1, 3, 4, 5])
    # Model predicted routine (3) on case 1, and engine abstained on case 0 and 2
    y_pred = np.array([3, 1, 3, 4, 5])
    abstained_mask = np.array([True, False, True, False, False])

    abst_metrics = compute_abstention_metrics(
        y_true=y_true,
        y_pred=y_pred,
        abstained_mask=abstained_mask,
        emergency_level=1,
    )

    assert abst_metrics["abstention_count"] == 2
    assert abst_metrics["abstention_rate"] == 0.4
    assert abst_metrics["emergencies_in_abstained_count"] == 1
    # Autonomous recall: 1 TP out of 2 total emergencies = 50%
    assert abst_metrics["autonomous_emergency_recall"] == 0.5
    # Workflow safety rate (TP + Abstained emergencies / total emergencies) = (1 + 1)/2 = 100%
    assert "never" in abst_metrics["abstention_safety_invariant"].lower()
    assert "autonomous" in abst_metrics["abstention_safety_invariant"].lower()


def test_train_pipeline_split_integrity_zero_overlap():
    """
    Verifies that train_pipeline enforces 0 overlap between train, val, and test splits
    and records split_integrity in metadata.
    """
    metadata = train_pipeline(
        data_path=None,  # Generates reproducible synthetic fixture
        use_xgboost=False,
        random_seed=42,
        synthetic_samples=100,
    )

    split_integrity = metadata.get("split_integrity", {})
    assert split_integrity["train_test_id_overlap"] == 0
    assert split_integrity["train_val_id_overlap"] == 0
    assert split_integrity["val_test_id_overlap"] == 0
    assert split_integrity["leakage_safeguard_verified"] is True

    # Check emergency metrics on test split
    test_metrics = metadata["splits"]["test"]["triage"]
    assert "emergency_recall_numerator" in test_metrics
    assert "emergency_recall_denominator" in test_metrics
    assert "asymmetric_clinical_cost" in test_metrics
    assert test_metrics["asymmetric_clinical_cost"]["under_triage_penalty_weight"] == 20.0


def test_feature_sanitization_forbids_hidden_labels():
    """
    Verifies that ground truth labels and forbidden columns are never included
    in training features or model inference inputs.
    """
    for forbidden in FORBIDDEN_COLUMNS:
        assert forbidden not in NUMERICAL_FEATURE_COLUMNS
        assert forbidden not in CATEGORICAL_FEATURE_COLUMNS


def test_over_triage_and_false_positive_calculation():
    """
    Verifies calculation of emergency false positives and over-triage rate
    with non-emergency cases as denominator.
    """
    # 6 cases:
    # 0, 1: True emergency (1), predicted as 1 -> TP = 2
    # 2: Non-emergency (2), predicted as 1 -> FP = 1 (Over-triage)
    # 3: Non-emergency (3), predicted as 1 -> FP = 1 (Over-triage)
    # 4: Non-emergency (4), predicted as 4 -> Correct routine = 1
    # 5: Non-emergency (5), predicted as 5 -> Correct routine = 1
    y_true = np.array([1, 1, 2, 3, 4, 5])
    y_pred = np.array([1, 1, 1, 1, 4, 5])

    metrics = compute_triage_metrics(
        y_true=y_true,
        y_pred=y_pred,
        labels=[1, 2, 3, 4, 5],
        emergency_level=1,
    )

    assert metrics["emergency_cases_total"] == 2
    assert metrics["non_emergency_cases_total"] == 4
    assert metrics["emergency_recall_sensitivity"] == 1.0
    assert metrics["emergency_false_negatives"] == 0
    assert metrics["emergency_false_positives"] == 2  # Cases 2 and 3
    assert metrics["over_triage_rate"] == 2 / 4  # 50.0%
    assert "2/4" in metrics["over_triage_display"]
    assert metrics["correct_predictions_count"] == 4  # Cases 0, 1, 4, 5
    assert metrics["incorrect_predictions_count"] == 2  # Cases 2, 3


def test_abstention_definitive_cases_and_breakdown():
    """
    Verifies calculation of definitive cases, nurse referrals, and emergency
    breakdown among abstained cases.
    """
    y_true = np.array([1, 1, 2, 3, 4, 5])
    y_pred = np.array([1, 2, 2, 3, 4, 5])
    abstained_mask = np.array([False, True, True, False, False, False])

    abst = compute_abstention_metrics(
        y_true=y_true,
        y_pred=y_pred,
        abstained_mask=abstained_mask,
        emergency_level=1,
    )

    assert abst["total_cases"] == 6
    assert abst["abstention_count"] == 2
    assert abst["definitive_cases_count"] == 4
    assert abst["cases_referred_for_nurse_review"] == 2
    assert abst["emergencies_in_abstained_count"] == 1  # Case 1
    assert abst["non_emergencies_in_abstained_count"] == 1  # Case 2
    assert abst["autonomous_emergency_recall"] == 0.5  # 1 autonomous TP / 2 total emergencies
    assert abst["autonomous_emergency_recall_denominator"] == 2
    assert "1/2" in abst["autonomous_emergency_recall_display"]
