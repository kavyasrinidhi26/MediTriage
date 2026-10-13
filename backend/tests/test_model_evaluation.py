"""
Tests for Model Evaluation Endpoints & Artifact Parsing
Tests valid evaluation results, missing artifacts empty state, and failure handling.
"""

import os
import tempfile
import pytest
from starlette.testclient import TestClient
from app.main import app
from app.ml.evaluate import compute_official_weighted_score, compute_triage_metrics
import numpy as np


@pytest.fixture
def client():
    return TestClient(app)


def test_valid_model_evaluation_metrics_and_splits(client):
    """Verify endpoint returns complete, separated split metrics and emergency sensitivity."""
    response = client.get("/api/model/evaluation")
    assert response.status_code == 200
    data = response.json()

    assert data["available"] is True
    assert "model_version" in data
    assert "dataset_version" in data
    assert data["sample_counts"]["total"] > 0
    assert data["sample_counts"]["training"] > 0
    assert data["sample_counts"]["test"] > 0

    # Verify emergency prominence
    emerg = data["emergency_metrics"]
    assert "emergency_recall" in emerg
    assert "emergency_false_negatives" in emerg
    assert "emergency_precision" in emerg
    assert emerg["emergency_recall"] >= 0.0

    # Verify official weighted score specification
    official = data["official_weighted_score"]
    assert "score" in official
    assert "formula" in official
    assert official["score"] >= 0.0

    # Verify split separation (train, validation, test)
    splits = data["splits"]
    assert "training" in splits
    assert "validation" in splits
    assert "test" in splits

    # Ensure evaluation metrics contain per-class and confusion matrix
    test_triage = splits["test"]["triage"]
    assert "confusion_matrix" in test_triage
    assert "per_class_metrics" in test_triage
    assert "accuracy" in test_triage
    assert "f1_macro" in test_triage

    # Verify clinical safety notice
    assert "CRITICAL CLINICAL SAFETY PRINCIPLE" in data["clinical_safety_notice"]
    assert "High overall accuracy" in data["clinical_safety_notice"]


def test_missing_evaluation_artifacts_returns_informative_empty_state(client):
    """Verify missing metadata returns explicit empty state rather than fabricated results."""
    with tempfile.TemporaryDirectory() as empty_dir:
        response = client.get(f"/api/model/evaluation?artifacts_dir={empty_dir}")
        assert response.status_code == 200
        data = response.json()
        assert data["available"] is False
        assert "not found" in data["reason"].lower()
        assert data["supports_job_execution"] is True


def test_official_weighted_score_penalizes_emergency_false_negatives():
    """Verify that clinical score heavily penalizes missed emergency patients."""
    # Scenario A: 100% emergency recall, 0 false negatives
    score_clean = compute_official_weighted_score(
        emergency_recall=1.0,
        macro_f1=0.90,
        accuracy=0.95,
        emergency_false_negatives=0,
    )
    # Scenario B: Missed 2 emergencies (2 false negatives)
    score_missed = compute_official_weighted_score(
        emergency_recall=0.70,
        macro_f1=0.90,
        accuracy=0.95,
        emergency_false_negatives=2,
    )

    assert score_clean["score"] > score_missed["score"]
    assert score_missed["score"] <= score_clean["score"] - 0.20


def test_evaluation_job_execution(client):
    """Verify running an evaluation job successfully updates artifacts."""
    response = client.post(
        "/api/model/evaluate",
        json={"synthetic_samples": 60, "random_seed": 99, "use_xgboost": False},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["evaluation"]["available"] is True
    assert data["evaluation"]["sample_counts"]["total"] == 60
