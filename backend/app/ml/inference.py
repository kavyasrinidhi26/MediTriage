"""
MediTriage AI — ML Inference & Decision Support Engine
Implements the 7-step decision flow integrating machine-learning predictions
with the independent safety rules engine and explicit abstention logic.
"""

import os
import json
from typing import Dict, Any, Optional, List, Tuple
import joblib
import pandas as pd
import numpy as np

from app.ml.schema import (
    TRIAGE_5_TO_NAME,
    TRIAGE_3_TO_NAME,
    NUMERICAL_FEATURE_COLUMNS,
    CATEGORICAL_FEATURE_COLUMNS,
)
from app.schemas import RedFlagChecklist
from app.triage_engine import determine_department_with_reason
from app.nlp.complaint_processor import process_complaint
from app.safety_rules import (
    evaluate_data_quality,
    evaluate_clinical_escalation_rules,
    apply_safety_override,
    SAFETY_RULE_VERSION,
    CONFIGURED_SAFETY_RULES,
    DataQualityStatus,
    RuleAcuity,
)

DEFAULT_ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "artifacts", "v1")


class TriageInferenceService:
    """
    Thread-safe inference service that loads versioned model artifacts,
    executes safety checks, applies escalation policies, and manages abstention.
    """
    def __init__(self, artifacts_dir: str = DEFAULT_ARTIFACTS_DIR):
        self.artifacts_dir = artifacts_dir
        self.preprocessor = None
        self.model_triage = None
        self.model_dept = None
        self.model_emergency = None
        self.metadata = None
        self.is_loaded = False
        self._load_artifacts()

    def _load_artifacts(self):
        meta_path = os.path.join(self.artifacts_dir, "metadata.json")
        prep_path = os.path.join(self.artifacts_dir, "preprocessor.joblib")
        triage_path = os.path.join(self.artifacts_dir, "model_triage.joblib")

        if os.path.exists(meta_path) and os.path.exists(prep_path) and os.path.exists(triage_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)
                self.preprocessor = joblib.load(prep_path)
                self.model_triage = joblib.load(triage_path)

                dept_path = os.path.join(self.artifacts_dir, "model_dept.joblib")
                if os.path.exists(dept_path):
                    self.model_dept = joblib.load(dept_path)

                emerg_path = os.path.join(self.artifacts_dir, "model_emergency.joblib")
                if os.path.exists(emerg_path):
                    self.model_emergency = joblib.load(emerg_path)

                self.is_loaded = True
            except Exception as e:
                self.is_loaded = False
        else:
            self.is_loaded = False

    def assess(
        self,
        age: int,
        gender: str,
        chief_complaint: str,
        complaint_language: str = "English",
        known_conditions: Optional[List[str]] = None,
        medications: Optional[Any] = None,
        systolic_bp: Optional[int] = None,
        diastolic_bp: Optional[int] = None,
        pulse_bpm: Optional[int] = None,
        temperature: Optional[float] = None,
        temperature_unit: str = "F",
        spo2: Optional[float] = None,
        respiratory_rate: Optional[int] = None,
        notes: Optional[str] = None,
        confidence_threshold: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Executes the required 7-step decision flow:
        1. Validate input data quality.
        2. Execute independent safety checks.
        3. Check whether a validated critical rule requires escalation.
        4. Run model only when artifacts and inputs are valid.
        5. Apply escalation policy to model output.
        6. Abstain when information/model support is insufficient (never placing patient at back of queue).
        7. Return structured, auditable response.
        """
        from app.config import get_settings
        if confidence_threshold is None:
            confidence_threshold = get_settings().CONFIDENCE_ABSTENTION_THRESHOLD

        known_conditions = known_conditions or []
        complaint_res = process_complaint(chief_complaint)

        def _attach_nlp(d: Dict[str, Any]) -> Dict[str, Any]:
            d["detected_language"] = complaint_res.detected_language.value
            d["extracted_symptoms"] = [s.model_dump() for s in complaint_res.extracted_symptoms]
            d["positive_concepts"] = complaint_res.positive_concepts
            d["negated_concepts"] = complaint_res.negated_concepts
            d["uncertain_concepts"] = complaint_res.uncertain_concepts
            d["original_complaint"] = complaint_res.original_complaint
            d["requires_complaint_review"] = complaint_res.requires_nurse_review
            d["complaint_review_reason"] = complaint_res.review_reason
            d["rules_evaluated"] = list(CONFIGURED_SAFETY_RULES)
            return d

        # Step 1 & 2: Independent Safety & Data Quality Checks
        dq_issues = evaluate_data_quality(
            age=age,
            gender=gender,
            chief_complaint=chief_complaint,
            systolic_bp=systolic_bp,
            diastolic_bp=diastolic_bp,
            pulse_bpm=pulse_bpm,
            temperature=temperature,
            temperature_unit=temperature_unit,
            spo2=spo2,
            notes=notes,
        )

        clinical_alerts = evaluate_clinical_escalation_rules(
            age=age,
            gender=gender,
            chief_complaint=chief_complaint,
            known_conditions=known_conditions,
            systolic_bp=systolic_bp,
            diastolic_bp=diastolic_bp,
            pulse_bpm=pulse_bpm,
            temperature=temperature,
            temperature_unit=temperature_unit,
            spo2=spo2,
            respiratory_rate=respiratory_rate,
        )

        has_blocking_data_error = any(issue.is_blocking for issue in dq_issues)
        has_critical_clinical_rule = any(alert.is_critical_override for alert in clinical_alerts)
        has_priority_rule = any(alert.acuity_level == RuleAcuity.PRIORITY for alert in clinical_alerts)

        # Warnings about missing measurements
        missing_warnings = [issue.message for issue in dq_issues if issue.status == DataQualityStatus.MISSING]
        invalid_warnings = [issue.message for issue in dq_issues if issue.status in (DataQualityStatus.MALFORMED, DataQualityStatus.CONTRADICTORY)]

        # Collect red flag symptoms detected
        red_flag_symptoms = [alert.rule_name for alert in clinical_alerts]

        model_version = self.metadata.get("model_version", "unavailable") if self.metadata else "unavailable"
        rules_version = SAFETY_RULE_VERSION

        # Collect observed input facts (strictly objective observations)
        observed_facts = [
            f"Demographics: {age}yo {gender}",
            f"Presenting Complaint: \"{chief_complaint}\"",
        ]
        if systolic_bp is not None:
            observed_facts.append(f"Recorded BP: {systolic_bp}/{diastolic_bp or '-'} mmHg")
        if pulse_bpm is not None:
            observed_facts.append(f"Recorded Pulse: {pulse_bpm} bpm")
        if spo2 is not None:
            observed_facts.append(f"Recorded SpO2: {spo2}%")
        if respiratory_rate is not None:
            observed_facts.append(f"Recorded Respiratory Rate: {respiratory_rate}/min")
        if temperature is not None:
            observed_facts.append(f"Recorded Temperature: {temperature}°{temperature_unit}")
        if known_conditions:
            observed_facts.append(f"Known Conditions: {', '.join(known_conditions)}")
        if medications:
            med_obs_str = ", ".join(medications) if isinstance(medications, list) else str(medications)
            if med_obs_str:
                observed_facts.append(f"Reported Medications: {med_obs_str}")

        # Inferred risk indicators from physiological criteria
        inferred_risks = [alert.rule_name for alert in clinical_alerts]

        # Clinical department determination and reasoning
        dept_enum, dept_reason, requires_dept_review = determine_department_with_reason(
            complaint=chief_complaint,
            age=age,
            is_emergency=has_critical_clinical_rule,
            red_flags=RedFlagChecklist(),
        )

        # Step 3: Handle Blocking Data Errors (with Emergency Override Protection)
        if has_blocking_data_error:
            if has_critical_clinical_rule:
                # Critical emergency rules ALWAYS take absolute precedence even with clerical errors!
                explanation = (
                    "🚨 CRITICAL CLINICAL SAFETY OVERRIDE: Severe physiological red flag or acute emergency complaint triggered. "
                    "Emergency resuscitation triage assigned. Note: Vital sign data entry errors flagged for concurrent bedside nurse verification."
                )
                return _attach_nlp({
                    "triage_level": 1,
                    "triage_level_name": TRIAGE_5_TO_NAME[1],
                    "raw_model_level": None,
                    "raw_model_name": None,
                    "model_confidence": None,
                    "override_applied": True,
                    "recommended_department": "Emergency / Casualty",
                    "department_reason": "Emergency clinical safety override: patient routed immediately to emergency resuscitation.",
                    "requires_department_review": False,
                    "detected_red_flags": red_flag_symptoms,
                    "observed_facts": observed_facts,
                    "inferred_risks": inferred_risks,
                    "model_explanation": explanation,
                    "triggered_safety_rule_ids": [a.rule_id for a in clinical_alerts] + [i.code for i in dq_issues if i.is_blocking],
                    "safety_rule_explanations": [a.clinical_explanation for a in clinical_alerts] + [i.message for i in dq_issues if i.is_blocking],
                    "missing_data_warnings": missing_warnings,
                    "invalid_data_warnings": invalid_warnings,
                    "human_review_required": True,
                    "abstention_status": "SAFETY_OVERRIDE_WITH_DATA_WARNING",
                    "decision_source": "CLINICAL_SAFETY_OVERRIDE",
                    "model_available": False,
                    "model_version": model_version,
                    "rules_version": rules_version,
                    "model_emergency_flag": True,
                    "clinical_disclaimer": "ASSISTIVE DECISION SUPPORT ONLY: Red flag alert overrides lower acuity. Immediate emergency physician evaluation required.",
                })
            else:
                return _attach_nlp({
                    "triage_level": 2,  # Priority holding status: never placed at end of queue
                    "triage_level_name": "Cannot assess — send to nurse now.",
                    "raw_model_level": None,
                    "raw_model_name": None,
                    "model_confidence": None,
                    "override_applied": False,
                    "recommended_department": dept_enum.value,
                    "department_reason": dept_reason,
                    "requires_department_review": True,
                    "detected_red_flags": red_flag_symptoms,
                    "observed_facts": observed_facts,
                    "inferred_risks": inferred_risks,
                    "model_explanation": "Model execution held: Input data contains contradictory or out-of-range measurements requiring immediate nurse verification.",
                    "triggered_safety_rule_ids": [i.code for i in dq_issues if i.is_blocking],
                    "safety_rule_explanations": [i.message for i in dq_issues if i.is_blocking],
                    "missing_data_warnings": missing_warnings,
                    "invalid_data_warnings": invalid_warnings,
                    "human_review_required": True,
                    "abstention_status": "ABSTAINED_DATA_QUALITY_HOLD",
                    "decision_source": "SAFETY_ABSTENTION_HOLD",
                    "model_available": False,
                    "model_version": model_version,
                    "rules_version": rules_version,
                    "model_emergency_flag": False,
                    "clinical_disclaimer": "Cannot assess — send to nurse now. Safety protocol active: Data quality hold requires manual nurse verification.",
                })

        # Step 3b: Handle Unreliable or Ambiguous Complaint Text (if not overridden by a critical clinical rule)
        if complaint_res.requires_nurse_review and not has_critical_clinical_rule:
            return _attach_nlp({
                "triage_level": 2,  # Priority holding status: never placed at end of queue
                "triage_level_name": "Cannot assess safely — send to nurse now.",
                "raw_model_level": None,
                "raw_model_name": None,
                "model_confidence": None,
                "override_applied": False,
                "recommended_department": dept_enum.value,
                "department_reason": dept_reason,
                "requires_department_review": True,
                "detected_red_flags": red_flag_symptoms,
                "observed_facts": observed_facts,
                "inferred_risks": inferred_risks,
                "model_explanation": f"Model execution held: {complaint_res.review_reason}",
                "triggered_safety_rule_ids": ["WARN-RULE-COMPLAINT-REVIEW"],
                "safety_rule_explanations": [complaint_res.review_reason],
                "missing_data_warnings": missing_warnings,
                "invalid_data_warnings": invalid_warnings,
                "human_review_required": True,
                "abstention_status": "ABSTAINED_COMPLAINT_UNCERTAIN",
                "decision_source": "SAFETY_ABSTENTION_HOLD",
                "model_available": False,
                "model_version": model_version,
                "rules_version": rules_version,
                "model_emergency_flag": False,
                "clinical_disclaimer": "Cannot assess safely — send to nurse now. Complaint language is unconfirmed, contradictory, or ambiguous. Nurse review required.",
            })

        # Step 4: Check if Model Artifacts are Available
        if not self.is_loaded or self.preprocessor is None or self.model_triage is None:
            # Model is unavailable: Fallback cleanly to safety rules and clinical baseline without inventing predictions
            fallback_level = 1 if has_critical_clinical_rule else (2 if has_priority_rule else 3)
            return _attach_nlp({
                "triage_level": fallback_level,
                "triage_level_name": TRIAGE_3_TO_NAME.get(fallback_level, f"Level {fallback_level}"),
                "raw_model_level": None,
                "raw_model_name": None,
                "model_confidence": None,
                "override_applied": bool(fallback_level == 1 and not has_critical_clinical_rule),
                "recommended_department": "Emergency / Casualty" if fallback_level == 1 else dept_enum.value,
                "department_reason": "Emergency clinical safety override" if fallback_level == 1 else dept_reason,
                "requires_department_review": requires_dept_review,
                "detected_red_flags": red_flag_symptoms,
                "observed_facts": observed_facts,
                "inferred_risks": inferred_risks,
                "model_explanation": "Model artifacts currently unavailable. Triage assigned via deterministic safety guidelines.",
                "triggered_safety_rule_ids": [a.rule_id for a in clinical_alerts],
                "safety_rule_explanations": [a.clinical_explanation for a in clinical_alerts],
                "missing_data_warnings": missing_warnings,
                "invalid_data_warnings": invalid_warnings,
                "human_review_required": True,
                "abstention_status": "SAFETY_OVERRIDE" if has_critical_clinical_rule else "ABSTAINED_MODEL_UNAVAILABLE",
                "decision_source": "CLINICAL_SAFETY_OVERRIDE" if has_critical_clinical_rule else "DETERMINISTIC_SAFETY_ENGINE",
                "model_available": False,
                "model_version": "none",
                "rules_version": rules_version,
                "model_emergency_flag": bool(fallback_level == 1),
                "clinical_disclaimer": "Model unavailable. Assessment generated strictly from rule-based safety criteria.",
            })

        # Step 5: Format Features for ML Model
        temp_f = temperature
        if temperature is not None and temperature_unit.upper() == "C":
            temp_f = round((temperature * 9.0 / 5.0) + 32.0, 1)

        med_text = ", ".join(medications) if isinstance(medications, list) else (str(medications) if medications else "")

        input_df = pd.DataFrame([{
            "age": age,
            "gender": gender,
            "chief_complaint": chief_complaint,
            "known_conditions_text": ", ".join(known_conditions) if known_conditions else "",
            "medications": med_text,
            "systolic_bp": systolic_bp,
            "diastolic_bp": diastolic_bp,
            "pulse_bpm": pulse_bpm,
            "temperature_f": temp_f,
            "temperature_unit": (temperature_unit or "F").upper(),
            "spo2": spo2,
            "respiratory_rate": respiratory_rate,
            "avpu": "ALERT",
        }])

        try:
            X_trans = self.preprocessor.transform(input_df)
            if hasattr(X_trans, "toarray"):
                X_trans = X_trans.toarray()

            # Predict Triage
            pred_probs = self.model_triage.predict_proba(X_trans)[0]
            pred_idx = int(np.argmax(pred_probs))
            if hasattr(self.model_triage, "classes_"):
                predicted_encoded = self.model_triage.classes_[pred_idx]
            else:
                predicted_encoded = pred_idx

            idx_to_triage = {int(v): int(k) for k, v in self.metadata["triage_label_mapping"].items()}
            raw_ml_level = idx_to_triage.get(int(predicted_encoded), 3)
            pred_confidence = float(pred_probs[pred_idx])

            # Predict Department (if model present)
            pred_dept = "General Medicine"
            if self.model_dept is not None and "department_label_mapping" in self.metadata:
                idx_to_dept = {int(v): k for k, v in self.metadata["department_label_mapping"].items()}
                dept_pred_raw = self.model_dept.predict(X_trans)[0]
                pred_dept = idx_to_dept.get(int(dept_pred_raw), "General Medicine")

            # Predict Emergency Flag (if model present)
            model_emerg_flag = False
            if self.model_emergency is not None:
                emerg_pred = int(self.model_emergency.predict(X_trans)[0])
                model_emerg_flag = bool(emerg_pred == 1)

        except Exception as e:
            # Model prediction exception -> Fall back safely to safety rules
            fallback_level = 1 if has_critical_clinical_rule else (2 if has_priority_rule else 2)
            fallback_name = TRIAGE_5_TO_NAME.get(fallback_level, f"Level {fallback_level}")
            return _attach_nlp({
                "triage_level": fallback_level,
                "triage_level_name": f"{fallback_name} (Model Exception)" if has_critical_clinical_rule else "Cannot assess — send to nurse now.",
                "recommended_department": "Emergency / Casualty" if fallback_level == 1 else dept_enum.value,
                "department_reason": "Emergency clinical safety override" if fallback_level == 1 else dept_reason,
                "requires_department_review": True,
                "detected_red_flags": red_flag_symptoms,
                "observed_facts": observed_facts,
                "inferred_risks": inferred_risks,
                "model_explanation": (
                    f"🚨 CRITICAL OVERRIDE: Emergency rule triggered during model exception ({str(e)}). Immediate emergency casualty triage assigned."
                    if has_critical_clinical_rule
                    else f"Model inference error: {str(e)}. Cannot assess — send to nurse now."
                ),
                "triggered_safety_rule_ids": [a.rule_id for a in clinical_alerts],
                "safety_rule_explanations": [a.clinical_explanation for a in clinical_alerts],
                "missing_data_warnings": missing_warnings,
                "invalid_data_warnings": invalid_warnings,
                "human_review_required": True,
                "abstention_status": "SAFETY_OVERRIDE" if has_critical_clinical_rule else "ABSTAINED_INFERENCE_ERROR",
                "decision_source": "CLINICAL_SAFETY_OVERRIDE" if has_critical_clinical_rule else "SAFETY_ABSTENTION_HOLD",
                "model_available": False,
                "model_version": model_version,
                "rules_version": rules_version,
                "model_emergency_flag": bool(fallback_level == 1),
                "clinical_disclaimer": "Cannot assess — send to nurse now. Inference failed safely; manual clinical assessment required.",
            })

        # Step 6 & 7: Apply Approved Clinical Escalation Policy and Handle Model Confidence
        # SAFETY REQUIREMENT: Validated critical safety rule MUST OVERRIDE lower-urgency model prediction or model uncertainty!
        if has_critical_clinical_rule:
            # Critical emergency rules ALWAYS take precedence over ML predictions and confidence thresholds.
            # Never allow a low-confidence or routine model suggestion to downgrade an emergency patient.
            override_applied = (raw_ml_level != 1)
            final_level = 1
            abstention_status = "SAFETY_OVERRIDE"
            pred_dept = "Emergency / Casualty"
            human_review = True
            model_emerg_flag = True
            raw_name = TRIAGE_5_TO_NAME.get(raw_ml_level, f"Level {raw_ml_level}")
            explanation = (
                f"🚨 CRITICAL CLINICAL SAFETY OVERRIDE: Severe physiological red flag triggered. "
                f"Elevated triage from ML recommendation ({raw_name}) to Level 1 / Emergency."
                if override_applied else
                "🚨 CRITICAL CLINICAL SAFETY OVERRIDE: Severe physiological red flag confirmed Level 1 Emergency resuscitation triage."
            )
        elif pred_confidence < confidence_threshold:
            # Uncertain model without critical emergency rule: Abstain to Nurse (never Routine / end of queue)
            return _attach_nlp({
                "triage_level": 2,
                "triage_level_name": "Cannot assess — send to nurse now.",
                "raw_model_level": raw_ml_level,
                "raw_model_name": TRIAGE_5_TO_NAME.get(raw_ml_level, f"Level {raw_ml_level}") if raw_ml_level else None,
                "model_confidence": pred_confidence,
                "recommended_department": pred_dept,
                "department_reason": dept_reason,
                "requires_department_review": True,
                "detected_red_flags": red_flag_symptoms,
                "observed_facts": observed_facts,
                "inferred_risks": inferred_risks,
                "model_explanation": f"Model prediction confidence ({pred_confidence:.2f}) fell below safe decision threshold ({confidence_threshold}). Explicit abstention triggered: send to nurse now.",
                "triggered_safety_rule_ids": [a.rule_id for a in clinical_alerts],
                "safety_rule_explanations": [a.clinical_explanation for a in clinical_alerts],
                "missing_data_warnings": missing_warnings,
                "invalid_data_warnings": invalid_warnings,
                "human_review_required": True,
                "abstention_status": "ABSTAINED_LOW_CONFIDENCE",
                "decision_source": "SAFETY_ABSTENTION_HOLD",
                "model_available": True,
                "model_version": model_version,
                "rules_version": rules_version,
                "model_emergency_flag": model_emerg_flag,
                "clinical_disclaimer": "Cannot assess — send to nurse now. Model confidence insufficient. Clinician evaluation mandatory.",
            })
        elif has_priority_rule and raw_ml_level > 2:
            override_applied = True
            final_level = 2
            abstention_status = "SAFETY_OVERRIDE"
            human_review = True
            explanation = "⚠️ PRIORITY CLINICAL SAFETY OVERRIDE: Urgent clinical finding elevated acuity from Routine to Priority Level 2."
        else:
            override_applied = False
            final_level = raw_ml_level
            abstention_status = "EVALUATED"
            human_review = (final_level <= 2 or len(clinical_alerts) > 0)
            explanation = (
                f"Assessed as Level {final_level} via machine-learning model inference. "
                f"Routing to {pred_dept} based on clinical complaints and physiological vital signs."
            )

        triage_name = TRIAGE_5_TO_NAME.get(final_level, f"Level {final_level}")

        final_dept_reason = (
            "Emergency clinical safety override: patient routed immediately to emergency resuscitation."
            if final_level == 1
            else dept_reason
        )
        final_dept_review = False if final_level == 1 else requires_dept_review

        return _attach_nlp({
            "triage_level": final_level,
            "triage_level_name": triage_name,
            "raw_model_level": raw_ml_level,
            "raw_model_name": TRIAGE_5_TO_NAME.get(raw_ml_level, f"Level {raw_ml_level}") if raw_ml_level else None,
            "model_confidence": pred_confidence,
            "override_applied": override_applied,
            "decision_source": "CLINICAL_SAFETY_OVERRIDE" if (has_critical_clinical_rule or override_applied) else "MACHINE_LEARNING_MODEL",
            "model_available": True,
            "recommended_department": pred_dept,
            "department_reason": final_dept_reason,
            "requires_department_review": final_dept_review,
            "detected_red_flags": red_flag_symptoms,
            "observed_facts": observed_facts,
            "inferred_risks": inferred_risks,
            "model_explanation": explanation,
            "triggered_safety_rule_ids": [a.rule_id for a in clinical_alerts],
            "safety_rule_explanations": [a.clinical_explanation for a in clinical_alerts],
            "missing_data_warnings": missing_warnings,
            "invalid_data_warnings": invalid_warnings,
            "human_review_required": human_review,
            "abstention_status": abstention_status,
            "model_version": model_version,
            "rules_version": rules_version,
            "model_emergency_flag": model_emerg_flag,
            "clinical_disclaimer": (
                "ASSISTIVE DECISION SUPPORT ONLY: This evaluation is generated by MediTriage AI. "
                "An emergency flag or triage category from the model alone does NOT constitute a confirmed medical diagnosis. "
                "All patient assignments remain subject to physician bedside review."
            ),
        })
