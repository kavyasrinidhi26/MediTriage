# MediTriage AI — OPD Triage Assistant for Overloaded Government Hospitals

An assistive clinical decision-support and queue stratification prototype built for crowded outpatient departments (OPDs) in public and district hospitals.

---

> [!CAUTION]
> **MANDATORY CLINICAL & ETHICAL PROTOTYPE DISCLAIMER**
> MediTriage AI is an **investigational decision-support prototype** designed for demonstration and hackathon evaluation.
> - It is **NOT** a certified medical diagnostic device.
> - It is **NOT** clinically validated for independent patient management.
> - It is **NOT** integrated into real-world hospital Electronic Health Record (EHR/HIS) systems.
> - All triage acuity assignments, vital warnings, and routing recommendations require **mandatory bedside verification by a licensed nurse or physician**.

---

## 🏥 Problem Statement & Solution

In overloaded government hospitals, hundreds of patients arrive every morning. In a typical first-come, first-served (FCFS) queue, critically ill patients (e.g. acute coronary syndromes, severe asthma attacks, shock, pediatric dehydration) wait for hours behind non-urgent consultations (e.g. knee ache, routine prescription renewals).

**MediTriage AI** solves this through:
1. **Bedside Nurse Intake**: Rapid intake capturing physiological parameters (SpO2, Heart Rate, BP, Respiratory Rate, Temp, AVPU consciousness level) with automated data quality holds.
2. **Safety-First Clinical Escalation Engine**: Transparent, deterministic rules adapting Emergency Severity Index (ESI) and Manchester Triage protocols:
   - 🔴 **EMERGENCY (Level 1)**: Immediate bypass to Emergency Resuscitation / Casualty.
   - 🟡 **PRIORITY (Level 2)**: Fast-track consultation ahead of non-urgent patients.
   - 🟢 **ROUTINE (Level 3–5)**: Standard outpatient consultation.
3. **Multilingual Telugu & English Complaint NLP**: Preserves original complaint verbatim, supports Telugu script and Latin transliteration, handles contextual negations ("no chest pain"), and detects historical symptoms.
4. **Machine Learning Inference with Clinical Preemption**: Multi-class acuity classifier and specialty routing where ML predictions are **strictly overridden** if any safety red flag or physiological derangement is detected.
5. **Persistent Acuity Queue & Nurse Audit Trail**: SQLite database with SQLite-backed review timestamps, deterioration reporting, bedside reassessments, and immutable audit logs.
6. **Genuine Multi-Split Model Evaluation**: Transparent metrics across training, validation, and holdout test splits, visually emphasizing **Emergency Recall / Sensitivity** and penalizing emergency false negatives.
7. **Reproducible Discrete-Event Queue Simulator**: Parameterized queue simulation comparing baseline FCFS against Triage-Assisted scheduling with anti-starvation guards.

---

## 📂 Project Architecture

```
meditriage-ai/
├── backend/                          # Python FastAPI Backend
│   ├── app/
│   │   ├── main.py                   # FastAPI app entry point & CORS
│   │   ├── config.py                 # Pydantic Settings & environment config
│   │   ├── db.py                     # SQLite engine & session management
│   │   ├── models.py                 # SQLAlchemy ORM: patients, safety audit, queue audit
│   │   ├── schemas.py                # Pydantic validation schemas & request models
│   │   ├── safety_rules.py           # Deterministic clinical rules & data quality checks
│   │   ├── triage_engine.py          # Bedside triage evaluation logic
│   │   ├── api/
│   │   │   └── routes.py             # Health, patients, queue, assessment, ML & simulation APIs
│   │   ├── ml/                       # Machine Learning Pipeline
│   │   │   ├── train.py              # Stratified 3-way split training (train/val/test)
│   │   │   ├── evaluate.py           # Multi-class metrics & official weighted score
│   │   │   ├── pipeline.py           # ColumnTransformer & feature hygiene
│   │   │   ├── inference.py          # Runtime inference service with safety fallback
│   │   │   └── artifacts/v1/         # Serialized models & metadata.json
│   │   ├── nlp/                      # Multilingual Complaint Processor
│   │   │   ├── complaint_processor.py# Telugu script & transliteration parsing, negation
│   │   │   └── symptom_dictionary.py # Configurable symptom concepts
│   │   └── simulation/               # Discrete-Event Queue Simulator
│   │       └── queue_simulator.py    # FCFS vs Triage multi-server simulation
│   ├── tests/                        # 66 Automated Backend Tests (Pytest)
│   │   ├── test_assessments.py       # End-to-end assessment API & abstention
│   │   ├── test_complaint_nlp.py     # Multilingual Telugu & negation tests
│   │   ├── test_health.py            # Health check endpoint test
│   │   ├── test_ml_pipeline.py       # Feature hygiene, train/test split, artifacts
│   │   ├── test_model_evaluation.py  # Evaluation endpoints & score penalties
│   │   ├── test_patients.py          # Patient registration, retrieval & validation
│   │   ├── test_safety_rules.py      # Critical overrides (pulse 0, SpO2 < 90, temp 96°F)
│   │   ├── test_saved_queue.py       # Queue persistence, ordering & audit trail
│   │   ├── test_simulation.py        # Queue simulator ordering, priority & fairness
│   │   └── test_triage.py            # Basic triage engine tests
│   ├── requirements.txt              # Backend dependencies
│   └── pytest.ini                    # Pytest configuration
├── frontend/                         # React 19 + Vite + TypeScript Frontend
│   ├── src/
│   │   ├── components/               # Healthcare UI components
│   │   │   ├── dashboard/            # Queue tables, review & audit modals
│   │   │   ├── intake/               # Nurse intake form, vitals, Telugu assistance
│   │   │   └── layout/               # Sidebar navigation, TopNavbar
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx     # Acuity queue & summary KPIs
│   │   │   ├── NewPatientPage.tsx    # Bedside patient intake registration
│   │   │   ├── QueuePage.tsx         # Comprehensive OPD queue manager
│   │   │   ├── ModelEvaluationPage.tsx # Genuine ML evaluation dashboard
│   │   │   ├── QueueSimulationPage.tsx # FCFS vs Triage simulation dashboard
│   │   │   └── GuidelinesPage.tsx    # ESI & Manchester triage protocols
│   │   ├── services/                 # API client with offline fallback resilience
│   │   └── types/                    # TypeScript interfaces & domain models
│   ├── tests/                        # 31 Automated Frontend Unit Tests (Node Test Runner)
│   │   ├── assessmentResults.test.ts # Decision support & safety overrides
│   │   ├── intakeValidation.test.ts  # Vitals validation & Telugu preservation
│   │   ├── modelEvaluation.test.ts   # Evaluation metrics & split verification
│   │   ├── patientQueue.test.ts      # Queue prioritization & filters
│   │   └── queueSimulation.test.ts   # Simulator parameters & reproducibility
│   ├── package.json
│   └── vite.config.ts                # Vite config with backend proxy (/api)
└── docs/                             # Documentation
    ├── ARCHITECTURE.md               # Technical & clinical system architecture
    ├── DEMO_SCRIPT.md                # Hackathon demonstration script with synthetic cases
    ├── TRIAGE_CRITERIA.md            # Clinical vital cutoffs and ESI rules
    └── API.md                        # REST API endpoints & payload specifications
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python**: Version 3.10+ (tested on Python 3.14.6)
- **Node.js**: Version 18+ (tested on Node v24.21.0, npm 11.19.0)

---

### Step 1: Run the Backend (FastAPI)

1. Open a terminal and navigate to the backend directory:
   ```powershell
   cd "D:\opd triange\meditriage-ai\backend"
   ```

2. (Optional, if virtualenv not yet present):
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\pip.exe install -r requirements.txt
   ```

3. Run the automated backend test suite (66 tests):
   ```powershell
   .\.venv\Scripts\pytest.exe -v
   ```

4. Start the FastAPI backend server:
   ```powershell
   .\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

The backend server is live at:
- **API Health Check**: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)
- **Interactive Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Model Evaluation API**: [http://127.0.0.1:8000/api/model/evaluation](http://127.0.0.1:8000/api/model/evaluation)

---

### Step 2: Run the Frontend (React + Vite)

1. Open a second terminal and navigate to the frontend directory:
   ```powershell
   cd "D:\opd triange\meditriage-ai\frontend"
   ```

2. Run the frontend unit tests (31 tests):
   ```powershell
   npm test
   ```

3. Verify production compilation and type checking:
   ```powershell
   npm run build
   ```

4. Start the development server:
   ```powershell
   npm run dev
   ```

The application is live at [http://localhost:5173](http://localhost:5173).

---

## 🧪 Comprehensive Automated Test Coverage

The project enforces automated test suites covering both backend and frontend layers:

| Layer | Test Suite | Test Count | Key Areas Covered |
|:---|:---|:---:|:---|
| **Backend** | `tests/test_assessments.py` | 11 | End-to-end assessment, critical overrides, abstention, non-fabrication of confidence |
| **Backend** | `tests/test_complaint_nlp.py` | 9 | Telugu script, Latin transliteration, negation detection ("no chest pain"), red flags |
| **Backend** | `tests/test_health.py` | 1 | Health check endpoint availability |
| **Backend** | `tests/test_ml_pipeline.py` | 8 | Feature hygiene, non-leakage, synthetic reproducibility, Scikit-learn fallback |
| **Backend** | `tests/test_model_evaluation.py`| 4 | Valid multi-split metrics, missing artifacts empty state, score penalty for missed emergencies |
| **Backend** | `tests/test_patients.py` | 6 | Patient intake creation, ID collision prevention, BP sanity validation, SQLite persistence |
| **Backend** | `tests/test_safety_rules.py` | 7 | Pulse=0 (cardiac arrest protocol), SpO2<90%, Temp 96°F verification, conflicting inputs |
| **Backend** | `tests/test_saved_queue.py` | 9 | Persistent queue ranking, human-review retention, escalation prominence, nurse audit trail |
| **Backend** | `tests/test_simulation.py` | 6 | FCFS vs Triage discrete-event simulation, emergency preemption, anti-starvation bump |
| **Backend** | `tests/test_triage.py` | 5 | Rule engine core assessment logic |
| **Frontend**| `tests/assessmentResults.test.ts`| 6 | Decision support rendering, offline resilience, safety overrides |
| **Frontend**| `tests/intakeValidation.test.ts` | 10 | Vitals boundary validation, Telugu preservation, pulse 0 handling |
| **Frontend**| `tests/patientQueue.test.ts` | 5 | Queue ordering, escalation visibility, filter and search |
| **Frontend**| `tests/modelEvaluation.test.ts`| 4 | Multi-split metric validation, empty state handling, weighted clinical score |
| **Frontend**| `tests/queueSimulation.test.ts` | 4 | FCFS comparison, emergency priority, reproducibility, arrival logs |
| **Frontend**| `tests/nurseIntakeService.test.ts`| 2 | Intake draft saving and non-diagnostic placeholder |
| **TOTAL** | **All Automated Tests** | **97** | **97 passed, 0 failed, 0 errors** |

---

## 🔒 Safety Invariants & Clinical Guardrails

1. **Deterministic Rule Preemption**: An emergency clinical alert (e.g. SpO2 < 90%, Pulse = 0 bpm, SBP < 90 with chest pain) **strictly overrides** any machine-learning prediction. Critical symptoms can never be downgraded by an ML score.
2. **Missing Vitals are Never Fabricated**: If blood pressure or SpO2 is unrecorded, it is flagged as `MISSING` with an explicit clinical warning. The system never injects default "120/80 mmHg" or "98% SpO2" values.
3. **Abstention on Ambiguity**: When data is contradictory (e.g., pulseless walking patient) or vital fields are insufficient, the system abstains (`ABSTAINED_DATA_QUALITY_HOLD`) and places the patient in high-priority review holding. It **never** places abstained patients at the back of the queue.
4. **Anti-Starvation in Queue Simulation**: To prevent routine patients from waiting indefinitely during high-acuity surges, the queue simulation includes dynamic waiting-time monitoring and automated reassessment priority bumps.
