"""
MediTriage AI — ML Schema & Data Contract Specifications
Defines the configurable dataset schema, feature sanitization rules, and target definitions.
Notice: Does NOT fabricate hidden official datasets or official labels.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

# Model & Schema Versioning
ML_SCHEMA_VERSION = "2026.1-schema-spec-v1"

# Target Definitions
# 5-level Triage System (CTAS/ESI compatible) and 3-level OPD system (Emergency/Priority/Routine)
VALID_TRIAGE_LEVELS_5 = [1, 2, 3, 4, 5]
VALID_TRIAGE_LEVELS_3 = [1, 2, 3]

TRIAGE_5_TO_NAME: Dict[int, str] = {
    1: "Level 1 - Resuscitation / Immediate",
    2: "Level 2 - Emergent",
    3: "Level 3 - Urgent",
    4: "Level 4 - Less Urgent",
    5: "Level 5 - Non-Urgent",
}

TRIAGE_3_TO_NAME: Dict[int, str] = {
    1: "Level 1 - Emergency",
    2: "Level 2 - Priority",
    3: "Level 3 - Routine",
}

VALID_DEPARTMENTS: List[str] = [
    "General Medicine",
    "Emergency / Casualty",
    "Cardiology",
    "Pulmonology",
    "Pediatrics",
    "Orthopedics",
    "Obstetrics & Gynecology",
    "Dermatology",
]

# Explicit Feature Hygiene Lists
# FEATURES PERMITTED for model input
NUMERICAL_FEATURE_COLUMNS = [
    "age",
    "systolic_bp",
    "diastolic_bp",
    "pulse_bpm",
    "temperature_f",
    "spo2",
    "respiratory_rate",
]

CATEGORICAL_FEATURE_COLUMNS = [
    "gender",
    "temperature_unit",
    "avpu",
]

TEXT_FEATURE_COLUMNS = [
    "chief_complaint",
    "known_conditions_text",
]

# FORBIDDEN FEATURES (Data Leakage & Post-Outcome Fields)
FORBIDDEN_COLUMNS = {
    # Patient Identifiers
    "id",
    "patient_id",
    "token_number",
    "patient_name",
    "contact_phone",
    "opd_registration_number",
    "created_at",
    "updated_at",
    # Post-outcome & label-derived fields
    "admission_status",
    "discharged_at",
    "length_of_stay",
    "icu_transfer",
    "final_diagnosis",
    "doctor_room",
    "assigned_doctor",
    "billing_amount",
    "prescription",
    "triage_category",
    "triage_level",
    "department",
    "is_emergency",
}


def sanitize_features(df_columns: List[str]) -> List[str]:
    """Filters out any identifier, post-outcome, or label-derived column from feature matrix."""
    return [c for c in df_columns if c.lower() not in FORBIDDEN_COLUMNS]
