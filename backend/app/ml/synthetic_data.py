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

COMMON_MEDICATIONS_POOL = [
    "Metformin 500mg BD, Amlodipine 5mg OD",
    "Paracetamol 650mg SOS",
    "Salbutamol Inhaler PRN, Budesonide 200mcg",
    "Telmisartan 40mg, Atorvastatin 10mg",
    "Omeprazole 20mg OD",
    "Levothyroxine 50mcg",
    "Insulin Glargine 10 units HS",
    "None / Not on regular medications",
]


def generate_synthetic_fixture(
    n_samples: int = 150,
    random_seed: int = 42,
    triage_levels: int = 5,
    emergency_prevalence: float = 0.04,
) -> pd.DataFrame:
    """
    Generates a synthetic DataFrame fixture matching the schema for pipeline testing and training.
    All data is generated deterministically with the specified random seed.
    Calibrates emergency prevalence to approximately 4% (clinical OPD baseline).
    """
    rng = np.random.default_rng(random_seed)
    random.seed(random_seed)

    emergency_complaints = [c for c in SAMPLE_COMPLAINTS if c[2] == 1]
    non_emergency_complaints = [c for c in SAMPLE_COMPLAINTS if c[2] > 1]

    records: List[Dict[str, Any]] = []

    for i in range(n_samples):
        # Calibrated ~4% emergency prevalence (problem statement baseline)
        is_emerg_draw = bool(rng.random() < emergency_prevalence)
        if is_emerg_draw and emergency_complaints:
            complaint_tuple = random.choice(emergency_complaints)
            level_5 = 1
        else:
            complaint_tuple = random.choice(non_emergency_complaints)
            level_5 = complaint_tuple[2]  # Acuity levels 2, 3, 4, 5

        complaint_text, default_dept, _, _ = complaint_tuple

        age = int(rng.integers(1, 85))
        gender = random.choice(["Male", "Female", "Other"])
        temp_unit = "F" if random.random() < 0.85 else "C"

        # Baseline vitals correlated with acuity
        if level_5 == 1:
            pulse = int(rng.choice([0, rng.integers(135, 175), rng.integers(30, 42)]))
            sys_bp = int(rng.integers(65, 88)) if random.random() < 0.6 else int(rng.integers(205, 240))
            dia_bp = int(sys_bp * rng.uniform(0.50, 0.65))
            spo2 = float(rng.uniform(75.0, 89.0))
            temp_f = float(rng.choice([96.0, rng.uniform(104.0, 105.5)]))
            avpu = random.choice(["PAIN", "UNRESPONSIVE", "VERBAL", "ALERT"])
        elif level_5 == 2:
            pulse = int(rng.integers(105, 130))
            sys_bp = int(rng.integers(150, 185)) if random.random() < 0.5 else int(rng.integers(90, 105))
            dia_bp = int(sys_bp * rng.uniform(0.58, 0.72))
            spo2 = float(rng.uniform(90.0, 94.0))
            temp_f = float(rng.uniform(100.5, 103.5))
            avpu = random.choice(["ALERT", "VERBAL"])
        elif level_5 == 3:
            pulse = int(rng.integers(75, 102))
            sys_bp = int(rng.integers(118, 145))
            dia_bp = int(rng.integers(74, 92))
            spo2 = float(rng.uniform(94.0, 97.0))
            temp_f = float(rng.uniform(98.6, 100.4))
            avpu = "ALERT"
        else:
            pulse = int(rng.integers(62, 88))
            sys_bp = int(rng.integers(110, 130))
            dia_bp = int(rng.integers(68, 84))
            spo2 = float(rng.uniform(97.0, 99.5))
            temp_f = float(rng.uniform(97.8, 98.8))
            avpu = "ALERT"

        # Convert temperature if unit is Celsius
        temp = temp_f if temp_unit == "F" else round((temp_f - 32.0) * 5.0 / 9.0, 1)

        # Introduce realistic missingness in ~8% of records
        if random.random() < 0.08:
            sys_bp = None
            dia_bp = None
        if random.random() < 0.06:
            pulse = None
        if random.random() < 0.08:
            spo2 = None
        if random.random() < 0.06:
            temp = None

        cond_sample = random.sample(KNOWN_CONDITIONS_POOL, k=random.randint(0, 2))
        conditions_text = ", ".join(cond_sample) if cond_sample else ""
        medications_text = random.choice(COMMON_MEDICATIONS_POOL)

        # Target triage level and calibrated ground-truth emergency flag (~4%)
        if triage_levels == 3:
            t_level = 1 if is_emerg_draw else (2 if level_5 <= 3 else 3)
        else:
            t_level = 1 if is_emerg_draw else level_5

        is_emergency = 1 if is_emerg_draw else 0

        record = {
            # Features (all required intake dimensions)
            "age": age,
            "gender": gender,
            "chief_complaint": complaint_text,
            "known_conditions_text": conditions_text,
            "medications": medications_text,
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
            # Non-feature identifiers
            "patient_id": f"SYN-PT-{10000 + i}",
            "patient_name": f"Synthetic Patient {i}",
        }
        records.append(record)

    return pd.DataFrame(records)


def generate_and_save_dataset_30k(output_csv_path: str, random_seed: int = 42) -> pd.DataFrame:
    """Generates 30,000 synthetic patient records with ~4% emergency prevalence and saves to disk."""
    import os
    os.makedirs(os.path.dirname(output_csv_path), exist_ok=True)
    df = generate_synthetic_fixture(n_samples=30000, random_seed=random_seed, emergency_prevalence=0.04)
    df.to_csv(output_csv_path, index=False)
    return df
