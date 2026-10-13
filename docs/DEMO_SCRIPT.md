# MediTriage AI — Hackathon Demonstration Script

> [!IMPORTANT]
> **SYNTHETIC CASE NOTICE**: All cases, vitals, patient identifiers, and timestamps in this script are **100% synthetic demonstration fixtures**. They do not reflect real hospital patients and must not be presented as clinically validated diagnostic findings.

---

## 🎯 Demonstration Objective & Flow

This script guides a 5-minute technical and clinical demonstration of **MediTriage AI** for hackathon judges and clinical evaluators.

---

## 📋 Scenario Walkthrough

### Scenario 1: Acute Emergency Preemption (Cardiac / Hypoxemia Override)
**Clinical Intent**: Demonstrate that deterministic emergency safety rules strictly override machine-learning predictions.

1. Navigate to **New Patient** (`/new-patient`).
2. Input synthetic patient details:
   - **Patient Name**: `K. Ramesh (Demo)`
   - **Age / Gender**: `58` / `Male`
   - **Chief Complaint**: `Severe retrosternal squeezing chest pain with cold sweating`
   - **Vitals**:
     - Blood Pressure: `85 / 55 mmHg` *(Hypotension / Cardiogenic shock alert)*
     - Heart Rate: `125 bpm` *(Tachycardia)*
     - SpO2: `88%` *(Critical hypoxemia alert)*
     - Respiratory Rate: `26 bpm`
     - Temperature: `98.4 °F`
     - AVPU: `Alert`
3. Click **Submit Patient Intake**.
4. **Expected Outcome**:
   - Immediate **Level 1 (Emergency)** assignment (`RED` badge).
   - Recommended routing: **Emergency Casualty / Resuscitation**.
   - Notice: Deterministic safety rules (`CRIT-RULE-HYPOXIA`, `CRIT-RULE-SHOCK-BP`) trigger an automated **SAFETY OVERRIDE**. Even if a machine-learning model predicted non-urgent, the patient is instantly fast-tracked.

---

### Scenario 2: Multilingual Telugu Complaint with Negation Handling
**Clinical Intent**: Demonstrate that local Indic languages are preserved verbatim and negations are not misinterpreted as positive symptoms.

1. Navigate to **New Patient** (`/new-patient`).
2. Input synthetic patient details:
   - **Patient Name**: `Lakshmi Devi (Demo)`
   - **Age / Gender**: `44` / `Female`
   - **Complaint Language**: Select **Telugu**
   - **Chief Complaint**: `తీవ్రమైన జ్వరం 3 రోజులుగా ఉంది, కానీ గుండె నొప్పి లేదు` *(Severe fever for 3 days, but NO chest pain)*
   - **Vitals**:
     - Blood Pressure: `122 / 80 mmHg`
     - Pulse: `92 bpm`
     - Temperature: `102.5 °F`
     - SpO2: `98%`
3. Click **Submit Patient Intake**.
4. **Expected Outcome**:
   - The NLP processor extracts `FEVER` as a **positive symptom concept** and `CHEST_PAIN` as a **negated concept**.
   - Patient is assigned **Level 3 (Routine)** and routed to **General Medicine** rather than erroneously triggering a cardiac emergency for negated chest pain.
   - The original Telugu script is stored verbatim without silent lossy translation.

---

### Scenario 3: Data Quality Guard & Clinical Abstention
**Clinical Intent**: Show that contradictory data or pulseless walking inputs trigger explicit abstention and place the patient on human-review hold instead of sending them to the back of the queue.

1. Navigate to **New Patient** (`/new-patient`).
2. Input synthetic patient details:
   - **Patient Name**: `Anand Kumar (Demo)`
   - **Age / Gender**: `35` / `Male`
   - **Chief Complaint**: `Patient walked into registration counter complaining of mild runny nose`
   - **Vitals**:
     - Pulse: `0 bpm` *(Transcription error or pulseless walking contradiction)*
3. Click **Submit Patient Intake**.
4. **Expected Outcome**:
   - The system detects `CONTRADICTORY_AMBULATORY_PULSELESS`.
   - Instead of crashing or guessing, the system triggers **ABSTAINED_DATA_QUALITY_HOLD**.
   - The patient is placed in **NEEDS_HUMAN_REVIEW** priority holding.
   - **Safety Invariant Verified**: The patient is kept in high priority and is **never dropped to the back of the queue**.

---

### Scenario 4: Live Acuity Queue Board & Nurse Review Workflow
**Clinical Intent**: Demonstrate persistent queue management, nurse review audit trail, deterioration flagging, and bedside reassessment.

1. Navigate to **Patient Queue** (`/queue`).
2. Observe queue ranking:
   - Level 1 emergencies and deteriorating patients appear prominently at the top.
   - Test filters: Click **Emergency (Level 1)**, **Unreviewed**, or department filters.
   - Search by UHID: Type `UHID-2026-901` in the search bar.
3. Click on a patient to open **Review & Audit**:
   - Click **Mark Reviewed** &rarr; Enter review notes: *"Vitals rechecked by Staff Nurse Kavitha; ECG ordered."*
   - Click **Report Deterioration** &rarr; Report acute deterioration: *"Patient became drowsy and diaphoretic in waiting area."*
   - Observe the patient immediately escalate to the top of the queue with an active **DETERIORATING** alert banner.
   - Open **Audit Trail Modal** to show the immutable chronological log of actions, timestamps, and staff IDs.

---

### Scenario 5: Genuine Model Evaluation Dashboard
**Clinical Intent**: Demonstrate genuine multi-split evaluation metrics, visual prominence of emergency recall, and why high accuracy alone is clinically misleading.

1. Navigate to **Model Evaluation** (`/evaluation`).
2. Point out the **Clinical Principle Banner**:
   - *"High overall accuracy (e.g. 96%) can dangerously conceal missed emergencies. In triage, Emergency Recall (Sensitivity) and Zero False Negatives are the primary safety metrics."*
3. Inspect Key Metrics:
   - **Emergency Sensitivity (Recall)**: `100.0%` (Prominently displayed in bold red card).
   - **Emergency False Negatives**: `0` (Zero missed emergencies).
   - **Official Clinical Weighted Score**: `0.9907` ($0.50 \times \text{Recall} + 0.30 \times \text{F1} + 0.20 \times \text{Accuracy}$).
4. Toggle Split Tabs:
   - Switch between **Holdout Test Split (20%)**, **Validation Split (20%)**, and **Training Split (60%)**.
   - Show the multi-class **Confusion Matrix** and class-wise precision/recall breakdown across all 5 triage tiers.
   - Highlight that metrics are genuine from the training pipeline and never fabricated.

---

### Scenario 6: OPD Queue Scheduling Simulation
**Clinical Intent**: Demonstrate reproducible discrete-event simulation comparing FCFS with Triage-Assisted scheduling and anti-starvation guards.

1. Navigate to **Queue Simulation** (`/simulation`).
2. Review parameters:
   - Doctors: `3`, Patient Volume: `50`, Random Seed: `42`.
3. Click **Run Simulation**:
   - Compare results side-by-side:
     - **Emergency Average Wait**: Reduced from `~75–85 minutes` (FCFS) down to `< 5 minutes` (Triage-Assisted), achieving a `>90%` reduction.
     - **Target Breaches**: Emergency target window breaches drop from multiple cases down to 0.
     - **Anti-Starvation Safeguard**: Point out the count of lower-urgency patients who received dynamic reassessment bumps after waiting past the 90-minute threshold.
4. Switch to the **Sample Patient Service Log** tab to show the exact service timestamps, assigned doctor IDs, and priority preemption in action.
5. Emphasize the **Simulation Limitations Notice**: Simulated results represent mathematical policy trade-offs on synthetic logs and are not claims of physical hospital throughput improvements.
