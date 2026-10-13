# MediTriage AI — Clinical Triage Protocol & Safety Specification

> [!WARNING]
> **PROTOTYPE CLINICAL DECISION SUPPORT NOTICE (NON-VALIDATED)**
> MediTriage AI is an experimental decision-support research prototype designed to assist healthcare personnel in public hospital outpatient departments (OPDs). It is **NOT** a certified Software as a Medical Device (SaMD) and has **NOT** undergone prospective randomized clinical trials. All outputs are assistive. Final triage level, diagnostic evaluation, and medical interventions are strictly under the authority of licensed healthcare professionals. Emergency care and resuscitation must **NEVER** be delayed for registration, counter queues, or AI processing.

---

## 1. Clinical Acuity Categories (5-Level ESI / CTAS Framework)

MediTriage AI evaluates patient presentations against standard 5-level international acuity frameworks (Emergency Severity Index / Canadian Triage and Acuity Scale), which are operationally mapped to hospital intake streams.

| Acuity Level | Clinical Designation | Acuity Color | Maximum Target Wait | Operational OPD Stream | Clinical Definition & Typical Presentation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Level 1** | **Resuscitation / Immediate** | **RED** | **0 minutes (Immediate)** | **Casualty / Resuscitation Bay** | Immediate threat to life or limb. Physiological collapse, cardiac arrest, respiratory arrest, severe shock, or severe red flags. Bypass OPD queue entirely. |
| **Level 2** | **Emergent / Very Urgent** | **ORANGE / YELLOW** | **&le; 15 minutes** | **Priority Review Queue** | High-risk presentation with potential rapid physiological deterioration or severe pain. Fast-track ahead of standard queue. |
| **Level 3** | **Urgent** | **YELLOW** | **&le; 30 minutes** | **Priority / Standard Queue** | Moderately abnormal vital signs, acute systemic illness, or complex presentation requiring rapid physician evaluation and investigations. |
| **Level 4** | **Less Urgent / Standard** | **GREEN** | **&le; 60 minutes** | **Standard OPD Token Queue** | Stable baseline vital signs, mild-to-moderate subacute symptoms (e.g., localized rash, minor soft tissue trauma, stable upper respiratory infection). |
| **Level 5** | **Non-Urgent / Primary Care** | **BLUE / GREEN** | **&le; 120 minutes** | **Standard OPD Token Queue** | Fully stable vital signs, chronic conditions, repeat medication prescriptions, routine checkups, or administrative consultations. |

---

## 2. Operational OPD Queue Mapping

In high-volume public hospital outpatient counters, the 5 clinical acuity levels are systematically routed into three operational queues:

1. **Immediate Resuscitation (Level 1)**: Zero-delay diversion to Red Trauma Bay / Casualty. Token numbers are flagged with `CRITICAL_EMERGENCY`.
2. **Priority Fast-Track (Level 2 & High-Urgency Level 3)**: Placed ahead of routine token holders for clinical review and bedside reassessment.
3. **General OPD Queue (Levels 3, 4, and 5)**: Processed sequentially according to token numbers, with Level 3 prioritized ahead of Levels 4 and 5.

---

## 3. Vital Signs Threshold Matrix

| Physiological Parameter | Normal Range (Level 4–5) | Borderline / Warning (Level 2–3) | Critical Emergency Trigger (Level 1) |
| :--- | :--- | :--- | :--- |
| **Oxygen Saturation (SpO2)** | &ge; 95% | 90% &ndash; 94% | **&lt; 90%** (Severe Hypoxemia) |
| **Heart Rate (Pulse)** | 51 &ndash; 100 bpm | 101 &ndash; 130 bpm or 40 &ndash; 50 bpm | **0 bpm** (Arrest) or **&lt; 40 bpm** / **&gt; 130 bpm** |
| **Systolic BP (SBP)** | 100 &ndash; 159 mmHg | 160 &ndash; 199 mmHg or 90 &ndash; 99 mmHg | **&lt; 90 mmHg** (Shock) or **&ge; 200 mmHg** (Crisis) |
| **Diastolic BP (DBP)** | 60 &ndash; 99 mmHg | 100 &ndash; 119 mmHg | **&ge; 120 mmHg** (Malignant Crisis) |
| **Respiratory Rate (RR)** | 12 &ndash; 20 /min | 21 &ndash; 30 /min | **&gt; 30 /min** or **&lt; 8 /min** |
| **Body Temperature** | 97.0 &ndash; 99.5 °F | 99.6 &ndash; 103.9 °F | **&ge; 104.0 °F** (Hyperpyrexia) or **&lt; 95.0 °F** |
| **AVPU Sensorium Scale** | Alert (A) | Responds to Voice (V) | **Responds to Pain (P)** or **Unresponsive (U)** |

---

## 4. Critical Clinical Red Flags

Documenting any of the following triggers immediate escalation to **Level 1 / Resuscitation**, overriding any machine-learning model prediction:

1. **Severe Respiratory Distress**: Cyanosis, stridor, accessory muscle use, inability to complete sentences.
2. **Crushing Cardiac Chest Pain**: Retrosternal pressure radiating to left arm or jaw, diaphoresis.
3. **Acute Neurological Deficit**: Sudden hemiparesis, acute facial droop, dysarthria, or active status epilepticus.
4. **Massive Bleeding or Shock**: Profuse arterial hemorrhage, circulatory collapse, cold clammy extremities.
5. **Major Trauma**: High-speed road traffic accident, falls from height, penetrating trauma, crushed extremities.
6. **Obstetric Emergency**: Active second-stage labor, antepartum hemorrhage, eclamptic convulsions.
7. **Fever with Meningismus**: Neck rigidity, altered sensorium, photophobia, non-blanching petechial purpura.
8. **Severe Pediatric Dehydration**: Sunken fontanelle/eyes, skin pinch &gt; 2 seconds, lethargic or unresponsive infant.

---

## 5. Architectural Safeguards: Rules vs Model Suggestions vs Clinician Authority

MediTriage AI maintains a strict tripartite separation of concerns:

```
[ Incoming Patient Observations ]
            │
            ├─────────────────────────────────────────────────┐
            ▼                                                 ▼
[ Deterministic Clinical Rules ]                  [ Advisory ML Model ]
 (Hard Safety Thresholds & Red Flags)            (Gradient Boosted Regressor)
            │                                                 │
            │  Critical Rule Triggered?                       │
            ├──────────── YES ────────────┐                   │
            │                             ▼                   │
            │             [ EMERGENCY SAFETY OVERRIDE ]       │
            │             Level 1 Immediate Casualty          │
            │             (Model Advisory Discarded)          │
            │                                                 │
            ▼ NO                                              ▼
   [ Rule Guardrails Applied ] ◄─────────────── [ Advisory Suggestion ]
            │
            ▼
   [ Assistive Assessment Recommendation ]
            │
            ▼
   [ Licensed Clinician Review & Override ]
            │ (Mandatory justification note + audit log)
            ▼
   [ Final Triage Acuity & Department Routing ]
```

### Safety Invariants:
1. **Never Allow Model to Override Critical Rules**: An advisory ML score can never downgrade a critical rule trigger (e.g., SpO2 80% or Pulse 0 bpm) to routine or waiting status.
2. **Fail-Safe Abstention**: If the ML model encounters missing essential features, low confidence, or inference errors, the engine abstains safely. If critical rules are met, it assigns Level 1 Resuscitation immediately; otherwise, it assigns Level 2 Priority Review (`ABSTAINED_LOW_CONFIDENCE` / `ABSTAINED_INFERENCE_ERROR`) pending immediate human clinician review.
3. **Audit Trail Accountability**: Every status transition, priority change, and human review is permanently timestamped with the reviewing clinician's identifier and mandatory justification notes.
4. **Synthetic Record Distinction**: All synthetic demo or evaluation records bear the `is_synthetic = True` flag and a prominent `SYNTHETIC` badge in both API contracts and UI views, ensuring demo data is never confused with active hospital registrations.
