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

    # Over-triage analysis: non-emergency cases (y_true != emergency_level) predicted as emergency (y_pred == emergency_level)
    non_emergencies = (y_true != emergency_level)
    n_non_emergencies = int(np.sum(non_emergencies))
    pred_emergencies = (y_pred == emergency_level)
    emergency_false_positives = int(np.sum(non_emergencies & pred_emergencies))
    over_triage_rate = float(emergency_false_positives / n_non_emergencies) if n_non_emergencies > 0 else 0.0

    # Overall correctness counts
    correct_predictions_count = int(np.sum(y_true == y_pred))
    incorrect_predictions_count = int(np.sum(y_true != y_pred))

    if n_emergencies > 0:
        true_positives = int(np.sum(true_emergencies & pred_emergencies))
        emergency_recall = float(true_positives / n_emergencies)
        emergency_false_negatives = int(n_emergencies - true_positives)
        pred_pos_count = int(np.sum(pred_emergencies))
        emergency_precision = float(true_positives / pred_pos_count) if pred_pos_count > 0 else 0.0
        emergency_recall_numerator = true_positives
        emergency_recall_denominator = n_emergencies
        emergency_recall_display = f"{true_positives}/{n_emergencies} ({round(emergency_recall * 100, 1)}%)"
        is_emergency_set_empty = False
    else:
        # CRITICAL SAFETY REQUIREMENT: Handle empty emergency evaluation set explicitly
        # rather than reporting misleading 100% recall.
        emergency_recall = None
        emergency_false_negatives = 0
        pred_pos_count = int(np.sum(pred_emergencies))
        emergency_precision = 0.0 if pred_pos_count > 0 else None
        emergency_recall_numerator = 0
        emergency_recall_denominator = 0
        emergency_recall_display = "Insufficient data"
        is_emergency_set_empty = True

    asymmetric_cost = compute_asymmetric_clinical_cost(
        y_true=y_true,
        y_pred=y_pred,
        emergency_level=emergency_level,
        under_triage_penalty=20.0,
    )

    official_score = compute_official_weighted_score(
        emergency_recall=emergency_recall,
        macro_f1=f1_macro,
        accuracy=acc,
        emergency_false_negatives=emergency_false_negatives,
        is_emergency_set_empty=is_emergency_set_empty,
    )

    abstention_metrics = compute_abstention_metrics(
        y_true=y_true,
        y_pred=y_pred,
        emergency_level=emergency_level,
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
        "non_emergency_cases_total": n_non_emergencies,
        "emergency_recall_sensitivity": round(emergency_recall, 4) if emergency_recall is not None else None,
        "emergency_recall_numerator": emergency_recall_numerator,
        "emergency_recall_denominator": emergency_recall_denominator,
        "emergency_recall_display": emergency_recall_display,
        "is_emergency_set_empty": is_emergency_set_empty,
        "emergency_precision": round(emergency_precision, 4) if emergency_precision is not None else None,
        "emergency_false_negatives": emergency_false_negatives,
        "emergency_false_positives": emergency_false_positives,
        "over_triage_rate": round(over_triage_rate, 4),
        "over_triage_display": f"{emergency_false_positives}/{n_non_emergencies} ({round(over_triage_rate * 100, 2)}%)" if n_non_emergencies > 0 else "0/0 (0.0%)",
        "correct_predictions_count": correct_predictions_count,
        "incorrect_predictions_count": incorrect_predictions_count,
        "asymmetric_clinical_cost": asymmetric_cost,
        "official_weighted_score": official_score,
        "abstention_metrics": abstention_metrics,
        "labels": [int(l) for l in labels],
        "confusion_matrix": cm,
        "per_class_metrics": per_class_metrics,
    }


def compute_asymmetric_clinical_cost(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    emergency_level: int = 1,
    under_triage_penalty: float = 20.0,
    over_triage_penalty: float = 1.0,
    standard_error_penalty: float = 1.0,
) -> Dict[str, Any]:
    """
    Computes asymmetric clinical evaluation cost where under-triaging a true emergency
    (predicting non-emergency when true status is emergency) incurs an explicit 20x penalty
    relative to routine misclassifications or over-triage false positives.

    Cost Matrix:
    - True Emergency classified as Non-Emergency: 20x penalty (clinical risk of harm)
    - Non-Emergency classified as Emergency: 1x penalty (resource cost / precautionary)
    - Routine class mismatch (e.g., Level 2 vs Level 3): 1x penalty
    - Correct classification: 0 penalty
    """
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    n = len(y_true)
    if n == 0:
        return {
            "total_cost": 0.0,
            "total_asymmetric_clinical_loss": 0.0,
            "mean_cost_per_patient": 0.0,
            "mean_clinical_loss_per_patient": 0.0,
            "under_triage_count": 0,
            "emergency_under_triage_count": 0,
            "under_triage_cost": 0.0,
            "emergency_under_triage_cost": 0.0,
            "over_triage_count": 0,
            "over_triage_cost": 0.0,
            "standard_error_count": 0,
            "non_emergency_misclassifications_count": 0,
            "under_triage_penalty_multiplier": under_triage_penalty,
            "under_triage_penalty_weight": under_triage_penalty,
            "evaluator_dependency_status": "PROVISIONAL_SPECIFICATION_NO_EXTERNAL_EVALUATOR_SUPPLIED",
        }

    costs = np.zeros(n, dtype=float)

    is_true_emerg = (y_true == emergency_level)
    is_pred_emerg = (y_pred == emergency_level)

    # 1. Critical under-triage: True emergency predicted as non-emergency
    under_triage_mask = is_true_emerg & (~is_pred_emerg)
    costs[under_triage_mask] = under_triage_penalty

    # 2. Over-triage: Non-emergency predicted as emergency
    over_triage_mask = (~is_true_emerg) & is_pred_emerg
    costs[over_triage_mask] = over_triage_penalty

    # 3. Standard misclassification among non-emergency classes
    other_misclass_mask = (~is_true_emerg) & (~is_pred_emerg) & (y_true != y_pred)
    costs[other_misclass_mask] = standard_error_penalty

    total_cost = float(np.sum(costs))
    under_triage_count = int(np.sum(under_triage_mask))
    over_triage_count = int(np.sum(over_triage_mask))
    standard_error_count = int(np.sum(other_misclass_mask))

    return {
        "total_cost": round(total_cost, 2),
        "total_asymmetric_clinical_loss": round(total_cost, 2),
        "mean_cost_per_patient": round(total_cost / n, 4),
        "mean_clinical_loss_per_patient": round(total_cost / n, 4),
        "under_triage_count": under_triage_count,
        "emergency_under_triage_count": under_triage_count,
        "under_triage_cost": round(under_triage_count * under_triage_penalty, 2),
        "emergency_under_triage_cost": round(under_triage_count * under_triage_penalty, 2),
        "over_triage_count": over_triage_count,
        "over_triage_cost": round(over_triage_count * over_triage_penalty, 2),
        "standard_error_count": standard_error_count,
        "non_emergency_misclassifications_count": over_triage_count + standard_error_count,
        "under_triage_penalty_multiplier": under_triage_penalty,
        "under_triage_penalty_weight": under_triage_penalty,
        "formula": "Cost = 20 * (Emergency FN) + 1 * (Emergency FP) + 1 * (Non-emergency error)",
        "evaluator_dependency_status": "PROVISIONAL_SPECIFICATION_NO_EXTERNAL_EVALUATOR_SUPPLIED",
    }


def compute_official_weighted_score(
    emergency_recall: Optional[float],
    macro_f1: float,
    accuracy: float,
    emergency_false_negatives: int = 0,
    is_emergency_set_empty: bool = False,
) -> Dict[str, Any]:
    """
    Computes the clinically weighted score for the triage evaluation.
    Formula: 0.50 * Emergency_Recall + 0.30 * Macro_F1 + 0.20 * Accuracy - (0.10 * Emergency_False_Negatives).
    Ensures that overall accuracy cannot compensate for dropped emergencies.
    If emergency evaluation set is empty, emergency recall is unmeasurable and
    labeled as provisional without fabricating a 100% score.
    """
    if is_emergency_set_empty or emergency_recall is None:
        raw_score = 0.60 * macro_f1 + 0.40 * accuracy
        return {
            "score": round(raw_score, 4),
            "raw_weighted_score": round(raw_score, 4),
            "formula": "0.60 * Macro_F1 + 0.40 * Accuracy (Emergency recall unmeasurable: 0 emergency cases in set)",
            "weights": {
                "macro_f1": 0.60,
                "accuracy": 0.40,
            },
            "emergency_set_evaluated": False,
            "emergency_recall_measurable": False,
            "description": "Provisional evaluation score with unmeasurable emergency recall due to zero emergency cases in evaluation split.",
        }

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
        "emergency_set_evaluated": True,
        "emergency_recall_measurable": True,
        "description": "Clinical evaluation score prioritizing zero emergency false negatives.",
    }


def compute_abstention_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    is_abstained_mask: Optional[np.ndarray] = None,
    emergency_level: int = 1,
    abstained_mask: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    """
    Evaluates both the frequency and safety of abstentions ("Cannot assess — send to nurse now.").

    SAFETY INVARIANTS:
    1. Abstentions must NEVER be counted automatically as correctly identified emergencies (Level 1).
    2. Measures frequency: how often does the system trigger safe nurse referral?
    3. Measures safety: among abstained cases, how many were true emergencies?
    """
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    n = len(y_true)

    if is_abstained_mask is None and abstained_mask is not None:
        is_abstained_mask = abstained_mask

    if is_abstained_mask is None:
        is_abstained_mask = (
            (y_pred == -1)
            | (y_pred == "Cannot assess — send to nurse now.")
            | (y_pred == "ABSTAINED")
            | (y_pred == "ABSTAINED_DATA_QUALITY_HOLD")
            | (y_pred == "ABSTAINED_LOW_CONFIDENCE")
            | (y_pred == "ABSTAINED_INFERENCE_ERROR")
        )
    else:
        is_abstained_mask = np.asarray(is_abstained_mask, dtype=bool)

    if n == 0:
        return {
            "total_cases": 0,
            "abstention_count": 0,
            "abstention_rate": 0.0,
            "abstention_percentage": "0.0%",
            "abstention_message": "Cannot assess — send to nurse now.",
            "emergency_cases_total": 0,
            "emergencies_in_abstained_count": 0,
            "autonomous_emergency_recall": None,
            "workflow_safety_rate_with_nurse_review": None,
            "safety_principle": "Abstentions route to nurse; never automatically counted as emergency predictions.",
            "abstention_safety_invariant": "Abstentions route safely to immediate bedside nurse review, but are NEVER automatically counted as autonomous Level 1 predictions.",
        }

    abstention_count = int(np.sum(is_abstained_mask))
    abstention_rate = float(abstention_count / n)

    true_emergencies = (y_true == emergency_level)
    total_emergencies = int(np.sum(true_emergencies))

    if total_emergencies > 0:
        emergencies_abstained = int(np.sum(true_emergencies & is_abstained_mask))
        autonomous_emerg_preds = (y_pred == emergency_level) & (~is_abstained_mask)
        autonomous_tp = int(np.sum(true_emergencies & autonomous_emerg_preds))
        autonomous_recall = float(autonomous_tp / total_emergencies)
        workflow_safe_count = autonomous_tp + emergencies_abstained
        workflow_safety_rate = float(workflow_safe_count / total_emergencies)
    else:
        emergencies_abstained = 0
        autonomous_recall = None
        workflow_safety_rate = None

    definitive_cases_count = int(n - abstention_count)
    non_emergencies_count = int(n - total_emergencies)
    non_emergencies_abstained = int(np.sum((~true_emergencies) & is_abstained_mask))

    return {
        "total_cases": n,
        "definitive_cases_count": definitive_cases_count,
        "abstention_count": abstention_count,
        "cases_referred_for_nurse_review": abstention_count,
        "abstention_rate": round(abstention_rate, 4),
        "abstention_percentage": f"{round(abstention_rate * 100, 2)}%",
        "abstention_message": "Cannot assess — send to nurse now.",
        "emergency_cases_total": total_emergencies,
        "emergencies_in_abstained_count": emergencies_abstained,
        "non_emergencies_in_abstained_count": non_emergencies_abstained,
        "autonomous_emergency_recall": round(autonomous_recall, 4) if autonomous_recall is not None else None,
        "autonomous_emergency_recall_numerator": autonomous_tp if total_emergencies > 0 else 0,
        "autonomous_emergency_recall_denominator": total_emergencies,
        "autonomous_emergency_recall_display": f"{autonomous_tp}/{total_emergencies} ({round(autonomous_recall * 100, 1)}%)" if total_emergencies > 0 and autonomous_recall is not None else "Insufficient data",
        "workflow_safety_rate_with_nurse_review": round(workflow_safety_rate, 4) if workflow_safety_rate is not None else None,
        "safety_principle": (
            "Abstentions route safely to immediate bedside nurse review, but are NEVER "
            "automatically counted as autonomous Level 1 predictions."
        ),
        "abstention_safety_invariant": (
            "Abstentions route safely to immediate bedside nurse review, but are NEVER "
            "automatically counted as autonomous Level 1 predictions."
        ),
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
