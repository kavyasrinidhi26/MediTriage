"""
Synthetic Data Fixture Generator for MediTriage AI Pipeline Testing
Generates realistic synthetic tabular & text records adhering to the documented schema.
Explicitly labeled as synthetic mock data for reproducible pipeline development and unit testing.
"""

import random
from typing import Dict, Any, List
import pandas as pd
import numpy as np

from app.ml.schema import (
    VALID_TRIAGE_LEVELS_5,
    VALID_TRIAGE_LEVELS_3,
    VALID_DEPARTMENTS,
)

SAMPLE_COMPLAINTS = [
    # Cardiology / Level 1-2
    ("Severe crushing retrosternal chest pain radiating to left arm with diaphoresis", "Cardiology", 1, 1),
    ("Heavy retrosternal chest tightness and shortness of breath upon minimal exertion", "Cardiology", 2, 1),
    ("Sudden pounding palpitations with near-syncope and dizziness", "Cardiology", 2, 1),
    ("ఛాతీలో తీవ్రమైన నొప్పి మరియు చెమటలు (Severe retrosternal chest pain)", "Cardiology", 1, 1),
    ("ఛాతీ పట్టేసినట్లు ఉండటం మరియు దడ (Chest heaviness and palpitations in Telugu)", "Cardiology", 2, 1),
    # Pulmonology / Level 1-2
    ("Acute severe breathlessness, audible wheezing, unable to speak full sentences", "Pulmonology", 1, 1),
    ("Chronic cough exacerbation with purulent sputum and moderate dyspnea", "Pulmonology", 3, 0),
    ("Sudden onset pleuritic sharp chest pain with shallow rapid breathing", "Pulmonology", 2, 1),
    ("శ్వాస తీసుకోవడంలో తీవ్రమైన ఇబ్బంది (Severe breathing difficulty in Telugu)", "Pulmonology", 1, 1),
    ("తీవ్రమైన దగ్గు మరియు శ్వాసలో పిల్లికూతలు (Severe cough and wheezing in Telugu)", "Pulmonology", 2, 1),
    # Emergency / Casualty / Level 1
    ("Sudden onset left-sided facial droop and right arm weakness for 1 hour", "Emergency / Casualty", 1, 1),
    ("Severe motor vehicle trauma with right femoral deformity and bleeding", "Emergency / Casualty", 1, 1),
    ("Sudden collapse, pulselessness requiring immediate cardiopulmonary evaluation", "Emergency / Casualty", 1, 1),
    # General Medicine / Level 2-5
    ("High fever 103 F with severe rigors, confusion and severe myalgia for 2 days", "General Medicine", 2, 1),
    ("High grade fever with chills and intermittent generalized body ache for 3 days", "General Medicine", 3, 0),
    ("Persistent dry cough, mild throat irritation and nasal congestion for 4 days", "General Medicine", 4, 0),
    ("Moderate persistent epigastric burning pain radiating to back with vomiting", "General Medicine", 3, 0),
    ("Mild generalized fatigue, malaise and loss of appetite for 2 weeks", "General Medicine", 5, 0),
    ("Routine monthly blood pressure checkup and chronic medicine prescription refill", "General Medicine", 5, 0),
    ("తీవ్రమైన కడుపు నొప్పి మరియు వాంతులు (Severe abdominal pain and vomiting in Telugu)", "General Medicine", 3, 0),
    ("తీవ్రమైన జ్వరం మరియు ఒళ్ళు నొప్పులు (High fever and generalized body ache in Telugu)", "General Medicine", 3, 0),
    ("సాధారణ తలనొప్పి మరియు నీరసం (Mild routine headache and fatigue in Telugu)", "General Medicine", 5, 0),
    # Pediatrics / Level 2-4
    ("3-year-old child with barking seal-like cough, inspiratory stridor at rest, and fever", "Pediatrics", 2, 1),
    ("18-month infant with persistent high fever and decreased oral fluid intake for 2 days", "Pediatrics", 2, 1),
    ("7-year-old child with runny nose, mild throat irritation and normal activity", "Pediatrics", 4, 0),
    # Obstetrics & Gynecology / Level 2-3
    ("Active labour contractions occurring every 3 minutes with ruptured amniotic membranes", "Obstetrics & Gynecology", 2, 1),
    ("Severe lower abdominal cramping in early pregnancy with mild vaginal spotting", "Obstetrics & Gynecology", 2, 1),
    ("Routine prenatal third-trimester health checkup and ultrasound review", "Obstetrics & Gynecology", 4, 0),
    # Orthopedics / Level 3-4
    ("Twisted right ankle while playing sports, rapid swelling, unable to bear weight", "Orthopedics", 3, 0),
    ("Chronic bilateral knee osteoarthritis pain worse after prolonged standing", "Orthopedics", 4, 0),
    ("మోకాలి కీళ్ల నొప్పి మరియు నడవడంలో ఇబ్బంది (Knee joint pain and walking difficulty)", "Orthopedics", 4, 0),
    # Dermatology / Level 4-5
    ("Mild intensely itchy rash and erythematous papules on bilateral forearms for 1 week", "Dermatology", 5, 0),
    ("Localized fungal skin patch on right groin with peripheral scaling and itching", "Dermatology", 5, 0),
]

KNOWN_CONDITIONS_POOL = [
    "Hypertension",
    "Type 2 Diabetes",
    "Asthma / COPD",
    "Ischemic Heart Disease (CAD)",
    "Chronic Kidney Disease",
    "None / Unknown",
]


def generate_synthetic_fixture(
    n_samples: int = 150,
    random_seed: int = 42,
    triage_levels: int = 5,
) -> pd.DataFrame:
    """
    Generates a synthetic DataFrame fixture matching the schema for pipeline testing.
    All data is generated deterministically with the specified random seed.
    """
    rng = np.random.default_rng(random_seed)
    random.seed(random_seed)

    records: List[Dict[str, Any]] = []

    for i in range(n_samples):
        complaint_tuple = random.choice(SAMPLE_COMPLAINTS)
        complaint_text, default_dept, level_5, default_is_emerg = complaint_tuple

        age = int(rng.integers(1, 85))
        gender = random.choice(["Male", "Female", "Other"])
        temp_unit = "F" if random.random() < 0.85 else "C"

        # Baseline vitals correlated loosely with urgency
        if level_5 <= 2:
            pulse = int(rng.choice([0, rng.integers(115, 160), rng.integers(35, 48)]))
            sys_bp = int(rng.integers(70, 95)) if random.random() < 0.4 else int(rng.integers(160, 210))
            dia_bp = int(sys_bp * rng.uniform(0.55, 0.70))
            spo2 = float(rng.uniform(82.0, 93.0))
            temp_f = float(rng.choice([96.0, rng.uniform(102.0, 104.5)]))
            avpu = random.choice(["ALERT", "VERBAL", "PAIN", "UNRESPONSIVE"])
        else:
            pulse = int(rng.integers(60, 98))
            sys_bp = int(rng.integers(110, 138))
            dia_bp = int(rng.integers(68, 88))
            spo2 = float(rng.uniform(95.0, 99.5))
            temp_f = float(rng.uniform(97.8, 99.2))
            avpu = "ALERT"

        # Convert temperature if unit is Celsius
        temp = temp_f if temp_unit == "F" else round((temp_f - 32.0) * 5.0 / 9.0, 1)

        # Introduce realistic missingness in ~10% of records
        if random.random() < 0.10:
            sys_bp = None
            dia_bp = None
        if random.random() < 0.08:
            pulse = None
        if random.random() < 0.12:
            spo2 = None
        if random.random() < 0.10:
            temp = None

        cond_sample = random.sample(KNOWN_CONDITIONS_POOL, k=random.randint(0, 2))
        conditions_text = ", ".join(cond_sample) if cond_sample else ""

        # Target triage level
        if triage_levels == 3:
            # Map 1-2 -> 1 (Emergency), 3 -> 2 (Priority), 4-5 -> 3 (Routine)
            t_level = 1 if level_5 <= 2 else (2 if level_5 == 3 else 3)
        else:
            t_level = level_5

        is_emergency = 1 if t_level in (1, 2) or default_is_emerg else 0

        record = {
            # Features
            "age": age,
            "gender": gender,
            "chief_complaint": complaint_text,
            "known_conditions_text": conditions_text,
            "systolic_bp": sys_bp,
            "diastolic_bp": dia_bp,
            "pulse_bpm": pulse,
            "temperature": temp,
            "temperature_unit": temp_unit,
            "temperature_f": temp_f,
            "spo2": spo2,
            "respiratory_rate": int(rng.integers(12, 32)),
            "avpu": avpu,
            # Targets
            "triage_level": t_level,
            "department": default_dept,
            "is_emergency": is_emergency,
            # Non-feature identifiers (to test feature sanitizer)
            "patient_id": f"SYN-PT-{1000 + i}",
            "patient_name": f"Synthetic Patient {i}",
        }
        records.append(record)

    return pd.DataFrame(records)
