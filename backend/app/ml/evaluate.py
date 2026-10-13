"""
MediTriage AI — Comprehensive Model Evaluation Module
Calculates multi-class triage metrics, department metrics, emergency recall/sensitivity,
emergency false negative counts, per-class precision/recall, and confusion matrices.
"""

from typing import Dict, Any, List, Optional
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report,
)


def compute_triage_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    labels: Optional[List[int]] = None,
    emergency_level: int = 1,
) -> Dict[str, Any]:
    """
    Computes rigorous evaluation metrics for triage classification.
    Focuses specifically on clinical safety metrics: emergency recall and false negatives.
    """
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)

    if labels is None:
        labels = sorted(list(set(y_true).union(set(y_pred))))

    acc = float(accuracy_score(y_true, y_pred))
    prec_macro = float(precision_score(y_true, y_pred, labels=labels, average="macro", zero_division=0))
    rec_macro = float(recall_score(y_true, y_pred, labels=labels, average="macro", zero_division=0))
    f1_macro = float(f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0))
    prec_weighted = float(precision_score(y_true, y_pred, labels=labels, average="weighted", zero_division=0))
    rec_weighted = float(recall_score(y_true, y_pred, labels=labels, average="weighted", zero_division=0))
    f1_weighted = float(f1_score(y_true, y_pred, labels=labels, average="weighted", zero_division=0))

    cm = confusion_matrix(y_true, y_pred, labels=labels).tolist()

    # Per-class metrics
    class_report_dict = classification_report(
        y_true, y_pred, labels=labels, output_dict=True, zero_division=0
    )

    per_class_metrics = {}
    for lbl in labels:
        str_lbl = str(lbl)
        if str_lbl in class_report_dict:
            per_class_metrics[str_lbl] = {
                "precision": round(class_report_dict[str_lbl]["precision"], 4),
                "recall": round(class_report_dict[str_lbl]["recall"], 4),
                "f1-score": round(class_report_dict[str_lbl]["f1-score"], 4),
                "support": int(class_report_dict[str_lbl]["support"]),
            }

    # Emergency safety analysis: Emergency Sensitivity & False Negatives
    # Emergency cases: y_true == emergency_level (e.g. 1)
    true_emergencies = (y_true == emergency_level)
    n_emergencies = int(np.sum(true_emergencies))

    if n_emergencies > 0:
        pred_emergencies = (y_pred == emergency_level)
        true_positives = int(np.sum(true_emergencies & pred_emergencies))
        emergency_recall = float(true_positives / n_emergencies)
        emergency_false_negatives = int(n_emergencies - true_positives)
        pred_pos_count = int(np.sum(pred_emergencies))
        emergency_precision = float(true_positives / pred_pos_count) if pred_pos_count > 0 else 0.0
    else:
        emergency_recall = 1.0
        emergency_false_negatives = 0
        pred_pos_count = int(np.sum(y_pred == emergency_level))
        emergency_precision = 1.0 if pred_pos_count == 0 else 0.0

    official_score = compute_official_weighted_score(
        emergency_recall=emergency_recall,
        macro_f1=f1_macro,
        accuracy=acc,
        emergency_false_negatives=emergency_false_negatives,
    )

    return {
        "accuracy": round(acc, 4),
        "precision_macro": round(prec_macro, 4),
        "recall_macro": round(rec_macro, 4),
        "f1_macro": round(f1_macro, 4),
        "precision_weighted": round(prec_weighted, 4),
        "recall_weighted": round(rec_weighted, 4),
        "f1_weighted": round(f1_weighted, 4),
        "emergency_level_analyzed": emergency_level,
        "emergency_cases_total": n_emergencies,
        "emergency_recall_sensitivity": round(emergency_recall, 4),
        "emergency_precision": round(emergency_precision, 4),
        "emergency_false_negatives": emergency_false_negatives,
        "official_weighted_score": official_score,
        "labels": [int(l) for l in labels],
        "confusion_matrix": cm,
        "per_class_metrics": per_class_metrics,
    }


def compute_official_weighted_score(
    emergency_recall: float,
    macro_f1: float,
    accuracy: float,
    emergency_false_negatives: int = 0,
) -> Dict[str, Any]:
    """
    Computes the official clinically weighted score for the triage evaluation.
    Formula: 0.50 * Emergency_Recall + 0.30 * Macro_F1 + 0.20 * Accuracy - (0.10 * Emergency_False_Negatives).
    Ensures that overall accuracy cannot compensate for dropped emergencies.
    """
    raw_score = 0.50 * emergency_recall + 0.30 * macro_f1 + 0.20 * accuracy
    fn_penalty = min(0.30, emergency_false_negatives * 0.10)
    final_score = max(0.0, raw_score - fn_penalty)
    return {
        "score": round(final_score, 4),
        "raw_weighted_score": round(raw_score, 4),
        "formula": "0.50 * Emergency_Recall + 0.30 * Macro_F1 + 0.20 * Accuracy - (0.10 * Emergency_False_Negatives)",
        "weights": {
            "emergency_recall": 0.50,
            "macro_f1": 0.30,
            "accuracy": 0.20,
            "emergency_fn_penalty_per_case": 0.10,
        },
        "description": "Official clinical evaluation score prioritizing zero emergency false negatives.",
    }


def compute_department_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    departments: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Computes department classification performance.
    """
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)

    if departments is None:
        departments = sorted(list(set(y_true).union(set(y_pred))))

    acc = float(accuracy_score(y_true, y_pred))
    f1_macro = float(f1_score(y_true, y_pred, labels=departments, average="macro", zero_division=0))
    f1_weighted = float(f1_score(y_true, y_pred, labels=departments, average="weighted", zero_division=0))

    cm = confusion_matrix(y_true, y_pred, labels=departments).tolist()

    return {
        "accuracy": round(acc, 4),
        "f1_macro": round(f1_macro, 4),
        "f1_weighted": round(f1_weighted, 4),
        "departments": departments,
        "confusion_matrix": cm,
    }
