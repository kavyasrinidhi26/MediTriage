"""
MediTriage AI — Discrete-Event OPD Queue Scheduling Simulator
Compares baseline First-Come-First-Served (FCFS) against Triage-Assisted scheduling.
Evaluates waiting times, target adherence, starvation prevention, and emergency priority.
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
import heapq
import numpy as np


@dataclass
class PatientArrival:
    patient_id: str
    arrival_minute: int
    arrival_time_str: str
    chief_complaint: str
    triage_level: int  # 1 = Emergency, 2 = Priority, 3 = Routine
    urgency_category: str  # EMERGENCY, PRIORITY, ROUTINE
    service_time_minutes: int
    target_wait_minutes: int
    is_escalated: bool = False


@dataclass
class PatientServiceRecord:
    patient_id: str
    arrival_minute: int
    arrival_time_str: str
    triage_level: int
    urgency_category: str
    service_time_minutes: int
    target_wait_minutes: int
    is_escalated: bool
    service_start_minute: int
    service_end_minute: int
    wait_time_minutes: int
    exceeded_target: bool
    assigned_doctor_id: int
    reassessment_escalated: bool = False


def generate_synthetic_arrivals(
    n_patients: int = 50,
    random_seed: int = 42,
    service_time_emergency: int = 20,
    service_time_priority: int = 15,
    service_time_routine: int = 10,
    emergency_proportion: Optional[float] = None,
    scenario_duration_minutes: int = 240,
    avg_service_duration: Optional[int] = None,
) -> List[PatientArrival]:
    """
    Generates a reproducible, clearly-labelled synthetic arrival stream representing
    a typical hospital intake shift (default 240 minutes).
    """
    if n_patients <= 0:
        return []

    rng = np.random.default_rng(random_seed)

    # Configurable or default urgency proportions
    if emergency_proportion is not None and 0.0 <= emergency_proportion <= 1.0:
        em_prob = max(0.01, min(0.90, float(emergency_proportion)))
        rem_prob = 1.0 - em_prob
        pr_prob = rem_prob * 0.45
        ro_prob = rem_prob * 0.55
        urgency_choices = [1, 2, 3]
        urgency_probs = [em_prob, pr_prob, ro_prob]
    else:
        # Default distribution: ~12% Emergency, ~38% Priority, ~50% Routine
        urgency_choices = [1, 2, 3]
        urgency_probs = [0.12, 0.38, 0.50]

    triage_levels = rng.choice(urgency_choices, size=n_patients, p=urgency_probs)

    # Clustered arrival distribution during modeled shift
    max_arrival = max(10, scenario_duration_minutes - 25)
    arrival_minutes = sorted(rng.integers(0, max_arrival, size=n_patients))

    complaint_samples = {
        1: [
            "Severe retrosternal chest pain with diaphoresis",
            "Acute severe dyspnea, SpO2 86%",
            "High grade fever with lethargy in 4-month infant",
            "Anaphylactic allergic reaction with stridor",
        ],
        2: [
            "Acute high fever 103°F with intense chills",
            "Suspected forearm fracture after fall, deformity",
            "Persistent vomiting with mild dehydration signs",
            "Uncontrolled hypertension with headache (190/110)",
        ],
        3: [
            "Chronic bilateral knee pain for 6 months",
            "Mild dry cough for 3 days, no breathing difficulty",
            "Routine monthly hypertension medication refill",
            "Localized minor skin rash on forearm",
        ],
    }

    target_wait_map = {
        1: 5,    # Level 1 Emergency target <= 5 min
        2: 45,   # Level 2 Priority target <= 45 min
        3: 120,  # Level 3 Routine target <= 120 min
    }

    urgency_name_map = {
        1: "EMERGENCY",
        2: "PRIORITY",
        3: "ROUTINE",
    }

    arrivals: List[PatientArrival] = []
    for idx, (arr_min, lvl) in enumerate(zip(arrival_minutes, triage_levels)):
        lvl = int(lvl)
        hour = 8 + (arr_min // 60)
        minute = arr_min % 60
        ampm = "AM" if hour < 12 else "PM"
        display_hour = hour if hour <= 12 else hour - 12
        time_str = f"{display_hour:02d}:{minute:02d} {ampm}"

        complaints_list = complaint_samples[lvl]
        complaint = str(complaints_list[idx % len(complaints_list)])

        # Configurable service time with minor random variation (+/- 2 mins)
        if avg_service_duration is not None and avg_service_duration > 0:
            eff_emerg = max(6, int(avg_service_duration * 1.35))
            eff_prior = max(5, int(avg_service_duration * 1.0))
            eff_rout = max(3, int(avg_service_duration * 0.75))
        else:
            eff_emerg = service_time_emergency
            eff_prior = service_time_priority
            eff_rout = service_time_routine

        base_service = (
            eff_emerg if lvl == 1 else
            eff_prior if lvl == 2 else
            eff_rout
        )
        jitter = int(rng.integers(-2, 3))
        service_time = max(3, base_service + jitter)

        is_escalated = (lvl == 1) and (rng.random() < 0.3)

        arrivals.append(
            PatientArrival(
                patient_id=f"SIM-P{idx + 1:03d}",
                arrival_minute=int(arr_min),
                arrival_time_str=time_str,
                chief_complaint=complaint,
                triage_level=lvl,
                urgency_category=urgency_name_map[lvl],
                service_time_minutes=service_time,
                target_wait_minutes=target_wait_map[lvl],
                is_escalated=is_escalated,
            )
        )

    return arrivals


def simulate_fcfs(
    arrivals: List[PatientArrival],
    num_doctors: int = 3,
) -> List[PatientServiceRecord]:
    """
    Baseline First-Come-First-Served (FCFS) discrete-event simulation.
    Patients are served strictly in order of arrival timestamps.
    """
    if not arrivals:
        return []

    num_doctors = max(1, int(num_doctors))
    # Doctors represented by available minute: (available_time, doctor_id)
    doctors = [(0, doc_id) for doc_id in range(1, num_doctors + 1)]
    heapq.heapify(doctors)

    records: List[PatientServiceRecord] = []
    # Sort strictly by arrival minute
    sorted_arrivals = sorted(arrivals, key=lambda a: a.arrival_minute)

    for p in sorted_arrivals:
        earliest_doc_time, doc_id = heapq.heappop(doctors)
        service_start = max(earliest_doc_time, p.arrival_minute)
        service_end = service_start + p.service_time_minutes
        wait_time = service_start - p.arrival_minute

        records.append(
            PatientServiceRecord(
                patient_id=p.patient_id,
                arrival_minute=p.arrival_minute,
                arrival_time_str=p.arrival_time_str,
                triage_level=p.triage_level,
                urgency_category=p.urgency_category,
                service_time_minutes=p.service_time_minutes,
                target_wait_minutes=p.target_wait_minutes,
                is_escalated=p.is_escalated,
                service_start_minute=service_start,
                service_end_minute=service_end,
                wait_time_minutes=wait_time,
                exceeded_target=wait_time > p.target_wait_minutes,
                assigned_doctor_id=doc_id,
                reassessment_escalated=False,
            )
        )

        heapq.heappush(doctors, (service_end, doc_id))

    return records


def simulate_triage_assisted(
    arrivals: List[PatientArrival],
    num_doctors: int = 3,
    starvation_reassessment_threshold: int = 90,
) -> List[PatientServiceRecord]:
    """
    Triage-Assisted Scheduling Simulation:
    - Emergency Level 1 always takes absolute priority (never overridden by lower triage).
    - Emergency escalation cases take immediate precedence.
    - Anti-Starvation Monitoring: Routine patients waiting over starvation_reassessment_threshold
      are dynamically escalated via clinical reassessment bump to avoid perpetual starvation.
    """
    if not arrivals:
        return []

    num_doctors = max(1, int(num_doctors))
    # Sort arrivals by arrival time
    unprocessed = sorted(arrivals, key=lambda a: a.arrival_minute)
    n_total = len(unprocessed)

    # Doctors represented by (available_time, doctor_id)
    doctors = [(0, doc_id) for doc_id in range(1, num_doctors + 1)]
    heapq.heapify(doctors)

    waiting_pool: List[PatientArrival] = []
    records: List[PatientServiceRecord] = []
    arr_idx = 0

    current_time = 0

    while len(records) < n_total:
        earliest_doc_time, doc_id = heapq.heappop(doctors)
        current_time = earliest_doc_time

        # If waiting pool is empty, advance time to next arrival
        if not waiting_pool and arr_idx < n_total and unprocessed[arr_idx].arrival_minute > current_time:
            current_time = unprocessed[arr_idx].arrival_minute

        # Admit all patients who have arrived up to current_time
        while arr_idx < n_total and unprocessed[arr_idx].arrival_minute <= current_time:
            waiting_pool.append(unprocessed[arr_idx])
            arr_idx += 1

        if not waiting_pool:
            heapq.heappush(doctors, (current_time, doc_id))
            continue

        # Priority calculation for all waiting patients:
        # Score calculation:
        # - Emergency (Level 1): 10000 + (1000 if escalated else 0) - arrival_minute (FCFS within tier)
        # - Priority (Level 2): 2000 + (wait_time * 10)
        # - Routine (Level 3): 100 + wait_time
        # Reassessment policy: if routine patient wait > threshold, bump score significantly to 3000!
        best_idx = 0
        best_score = -float("inf")
        was_reassessed = False

        for idx, p in enumerate(waiting_pool):
            wait = current_time - p.arrival_minute
            reassessed = False

            if p.triage_level == 1:
                # Emergency absolute priority
                score = 10000 + (2000 if p.is_escalated else 0) - (p.arrival_minute * 0.1)
            elif p.triage_level == 2:
                # Priority Level 2
                score = 2000 + (wait * 2.0) - (p.arrival_minute * 0.05)
            else:
                # Routine Level 3 with Anti-Starvation Reassessment
                if wait >= starvation_reassessment_threshold:
                    # Clinical reassessment bump: escalated priority to prevent starvation
                    score = 2500 + (wait * 1.5)
                    reassessed = True
                else:
                    score = 100 + wait - (p.arrival_minute * 0.01)

            if score > best_score:
                best_score = score
                best_idx = idx
                was_reassessed = reassessed

        selected_patient = waiting_pool.pop(best_idx)
        service_start = current_time
        service_end = service_start + selected_patient.service_time_minutes
        wait_time = service_start - selected_patient.arrival_minute

        records.append(
            PatientServiceRecord(
                patient_id=selected_patient.patient_id,
                arrival_minute=selected_patient.arrival_minute,
                arrival_time_str=selected_patient.arrival_time_str,
                triage_level=selected_patient.triage_level,
                urgency_category=selected_patient.urgency_category,
                service_time_minutes=selected_patient.service_time_minutes,
                target_wait_minutes=selected_patient.target_wait_minutes,
                is_escalated=selected_patient.is_escalated,
                service_start_minute=service_start,
                service_end_minute=service_end,
                wait_time_minutes=wait_time,
                exceeded_target=wait_time > selected_patient.target_wait_minutes,
                assigned_doctor_id=doc_id,
                reassessment_escalated=was_reassessed,
            )
        )

        heapq.heappush(doctors, (service_end, doc_id))

    return records


def calculate_group_metrics(records: List[PatientServiceRecord]) -> Dict[str, Any]:
    """Computes summary wait time and target adherence metrics by triage category."""
    if not records:
        return {
            "by_urgency": {
                "EMERGENCY": {
                    "triage_level": 1,
                    "urgency_category": "EMERGENCY",
                    "patient_count": 0,
                    "avg_wait_minutes": 0.0,
                    "median_wait_minutes": 0.0,
                    "max_wait_minutes": 0,
                    "min_wait_minutes": 0,
                    "target_minutes": 5,
                    "exceeded_target_count": 0,
                    "target_adherence_percent": 100.0,
                    "reassessment_escalated_count": 0,
                },
                "PRIORITY": {
                    "triage_level": 2,
                    "urgency_category": "PRIORITY",
                    "patient_count": 0,
                    "avg_wait_minutes": 0.0,
                    "median_wait_minutes": 0.0,
                    "max_wait_minutes": 0,
                    "min_wait_minutes": 0,
                    "target_minutes": 45,
                    "exceeded_target_count": 0,
                    "target_adherence_percent": 100.0,
                    "reassessment_escalated_count": 0,
                },
                "ROUTINE": {
                    "triage_level": 3,
                    "urgency_category": "ROUTINE",
                    "patient_count": 0,
                    "avg_wait_minutes": 0.0,
                    "median_wait_minutes": 0.0,
                    "max_wait_minutes": 0,
                    "min_wait_minutes": 0,
                    "target_minutes": 120,
                    "exceeded_target_count": 0,
                    "target_adherence_percent": 100.0,
                    "reassessment_escalated_count": 0,
                },
            },
            "overall": {
                "total_patients": 0,
                "avg_wait_minutes": 0.0,
                "median_wait_minutes": 0.0,
                "max_wait_minutes": 0,
                "min_wait_minutes": 0,
                "total_exceeded_target": 0,
                "target_adherence_rate": 100.0,
                "total_reassessed_escalations": 0,
            },
        }

    categories = ["EMERGENCY", "PRIORITY", "ROUTINE"]
    by_urgency: Dict[str, Any] = {}

    for cat in categories:
        group_records = [r for r in records if r.urgency_category == cat]
        count = len(group_records)
        if count > 0:
            waits = [r.wait_time_minutes for r in group_records]
            exceeded = sum(1 for r in group_records if r.exceeded_target)
            reassessed_count = sum(1 for r in group_records if r.reassessment_escalated)
            target = group_records[0].target_wait_minutes
            by_urgency[cat] = {
                "triage_level": group_records[0].triage_level,
                "urgency_category": cat,
                "patient_count": count,
                "avg_wait_minutes": round(float(np.mean(waits)), 1),
                "median_wait_minutes": round(float(np.median(waits)), 1),
                "max_wait_minutes": int(np.max(waits)),
                "min_wait_minutes": int(np.min(waits)),
                "target_minutes": target,
                "exceeded_target_count": exceeded,
                "target_adherence_percent": round((1.0 - (exceeded / count)) * 100.0, 1),
                "reassessment_escalated_count": reassessed_count,
            }
        else:
            by_urgency[cat] = {
                "triage_level": 1 if cat == "EMERGENCY" else (2 if cat == "PRIORITY" else 3),
                "urgency_category": cat,
                "patient_count": 0,
                "avg_wait_minutes": 0.0,
                "median_wait_minutes": 0.0,
                "max_wait_minutes": 0,
                "min_wait_minutes": 0,
                "target_minutes": 5 if cat == "EMERGENCY" else (45 if cat == "PRIORITY" else 120),
                "exceeded_target_count": 0,
                "target_adherence_percent": 100.0,
                "reassessment_escalated_count": 0,
            }

    all_waits = [r.wait_time_minutes for r in records]
    total_exceeded = sum(1 for r in records if r.exceeded_target)
    total_reassessed = sum(1 for r in records if r.reassessment_escalated)

    overall = {
        "total_patients": len(records),
        "avg_wait_minutes": round(float(np.mean(all_waits)), 1),
        "median_wait_minutes": round(float(np.median(all_waits)), 1),
        "max_wait_minutes": int(np.max(all_waits)),
        "min_wait_minutes": int(np.min(all_waits)),
        "total_exceeded_target": total_exceeded,
        "target_adherence_rate": round((1.0 - (total_exceeded / len(records))) * 100.0, 1),
        "total_reassessed_escalations": total_reassessed,
    }

    return {
        "by_urgency": by_urgency,
        "overall": overall,
    }


def calculate_queue_over_time(
    fcfs_records: List[PatientServiceRecord],
    triage_records: List[PatientServiceRecord],
    scenario_duration_minutes: int = 240,
) -> Dict[str, Any]:
    """Calculates queue length minute-by-minute across modeled scenario."""
    all_end_times = [r.service_end_minute for r in fcfs_records + triage_records]
    max_minute = max([scenario_duration_minutes] + all_end_times) if all_end_times else scenario_duration_minutes
    step = 10 if max_minute <= 360 else 15
    time_points = list(range(0, max_minute + 1, step))
    if max_minute not in time_points:
        time_points.append(max_minute)

    series = []
    fcfs_max_q = 0
    triage_max_q = 0

    for t in time_points:
        fcfs_q = sum(1 for r in fcfs_records if r.arrival_minute <= t and r.service_start_minute > t)
        triage_q = sum(1 for r in triage_records if r.arrival_minute <= t and r.service_start_minute > t)

        if fcfs_q > fcfs_max_q:
            fcfs_max_q = fcfs_q
        if triage_q > triage_max_q:
            triage_max_q = triage_q

        hour = 8 + (t // 60)
        minute = t % 60
        ampm = "AM" if hour < 12 else "PM"
        disp_h = hour if hour <= 12 else hour - 12
        time_str = f"{disp_h:02d}:{minute:02d} {ampm}"

        series.append({
            "minute": t,
            "time_str": time_str,
            "fcfs_queue": fcfs_q,
            "triage_queue": triage_q,
        })

    return {
        "series": series,
        "fcfs_max_queue_length": fcfs_max_q,
        "triage_max_queue_length": triage_max_q,
    }


def calculate_case_completion_summary(
    fcfs_records: List[PatientServiceRecord],
    triage_records: List[PatientServiceRecord],
    scenario_duration_minutes: int,
) -> Dict[str, Any]:
    """Calculates completed vs remaining patients within scenario period."""
    fcfs_completed = sum(1 for r in fcfs_records if r.service_end_minute <= scenario_duration_minutes)
    fcfs_remaining = len(fcfs_records) - fcfs_completed

    triage_completed = sum(1 for r in triage_records if r.service_end_minute <= scenario_duration_minutes)
    triage_remaining = len(triage_records) - triage_completed

    return {
        "scenario_duration_minutes": scenario_duration_minutes,
        "fcfs_completed": fcfs_completed,
        "fcfs_remaining": fcfs_remaining,
        "triage_completed": triage_completed,
        "triage_remaining": triage_remaining,
    }


def calculate_clinician_workload(
    fcfs_records: List[PatientServiceRecord],
    triage_records: List[PatientServiceRecord],
    num_doctors: int,
    scenario_duration_minutes: int,
) -> List[Dict[str, Any]]:
    """Calculates patient throughput, service minutes, and utilization per clinician."""
    workload = []
    for doc_id in range(1, num_doctors + 1):
        fcfs_doc = [r for r in fcfs_records if r.assigned_doctor_id == doc_id]
        triage_doc = [r for r in triage_records if r.assigned_doctor_id == doc_id]

        fcfs_pts = len(fcfs_doc)
        triage_pts = len(triage_doc)

        fcfs_busy = sum(r.service_time_minutes for r in fcfs_doc)
        triage_busy = sum(r.service_time_minutes for r in triage_doc)

        fcfs_emerg = sum(1 for r in fcfs_doc if r.triage_level == 1)
        triage_emerg = sum(1 for r in triage_doc if r.triage_level == 1)

        fcfs_util = round(min(100.0, (fcfs_busy / max(1, scenario_duration_minutes)) * 100.0), 1)
        triage_util = round(min(100.0, (triage_busy / max(1, scenario_duration_minutes)) * 100.0), 1)

        workload.append({
            "clinician_id": doc_id,
            "clinician_name": f"Doctor {doc_id}",
            "fcfs_patients": fcfs_pts,
            "triage_patients": triage_pts,
            "fcfs_busy_minutes": fcfs_busy,
            "triage_busy_minutes": triage_busy,
            "fcfs_emergency_patients": fcfs_emerg,
            "triage_emergency_patients": triage_emerg,
            "fcfs_utilization_percent": fcfs_util,
            "triage_utilization_percent": triage_util,
        })
    return workload


def calculate_waiting_time_distribution(
    fcfs_records: List[PatientServiceRecord],
    triage_records: List[PatientServiceRecord],
) -> List[Dict[str, Any]]:
    """Segments waiting times into clinical interval buckets."""
    buckets = [
        {"range": "0-15m", "min": 0, "max": 15},
        {"range": "16-30m", "min": 16, "max": 30},
        {"range": "31-60m", "min": 31, "max": 60},
        {"range": "61-120m", "min": 61, "max": 120},
        {"range": ">120m", "min": 121, "max": 999999},
    ]
    distribution = []
    for b in buckets:
        fcfs_c = sum(1 for r in fcfs_records if b["min"] <= r.wait_time_minutes <= b["max"])
        triage_c = sum(1 for r in triage_records if b["min"] <= r.wait_time_minutes <= b["max"])
        distribution.append({
            "range": b["range"],
            "fcfs_count": fcfs_c,
            "triage_count": triage_c,
        })
    return distribution


def build_event_timeline(
    records: List[PatientServiceRecord],
    limit: int = 60,
) -> List[Dict[str, Any]]:
    """Builds chronological arrival, consultation start, and completion timeline."""
    events = []
    for r in records:
        # Arrival
        events.append({
            "minute": r.arrival_minute,
            "time_str": r.arrival_time_str,
            "patient_id": r.patient_id,
            "urgency_category": r.urgency_category,
            "triage_level": r.triage_level,
            "event_type": "ARRIVAL",
            "title": f"Arrival & Triage ({r.urgency_category})",
            "description": f"Patient {r.patient_id} arrived and queued. Target wait: <= {r.target_wait_minutes}m.",
        })
        # Service Start
        h = 8 + (r.service_start_minute // 60)
        m = r.service_start_minute % 60
        ampm = "AM" if h < 12 else "PM"
        disp_h = h if h <= 12 else h - 12
        events.append({
            "minute": r.service_start_minute,
            "time_str": f"{disp_h:02d}:{m:02d} {ampm}",
            "patient_id": r.patient_id,
            "urgency_category": r.urgency_category,
            "triage_level": r.triage_level,
            "event_type": "SERVICE_START",
            "title": f"Consultation Started — Doctor {r.assigned_doctor_id}",
            "description": f"Waited {r.wait_time_minutes}m ({'Breached Target' if r.exceeded_target else 'Within Target'}).",
            "wait_time_minutes": r.wait_time_minutes,
            "exceeded_target": r.exceeded_target,
            "reassessment_escalated": r.reassessment_escalated,
        })
        # Service End
        h_end = 8 + (r.service_end_minute // 60)
        m_end = r.service_end_minute % 60
        ampm_end = "AM" if h_end < 12 else "PM"
        disp_h_end = h_end if h_end <= 12 else h_end - 12
        events.append({
            "minute": r.service_end_minute,
            "time_str": f"{disp_h_end:02d}:{m_end:02d} {ampm_end}",
            "patient_id": r.patient_id,
            "urgency_category": r.urgency_category,
            "triage_level": r.triage_level,
            "event_type": "COMPLETED",
            "title": f"Consultation Completed",
            "description": f"Service duration: {r.service_time_minutes}m with Doctor {r.assigned_doctor_id}.",
        })

    events.sort(key=lambda e: (e["minute"], 0 if e["event_type"] == "ARRIVAL" else (1 if e["event_type"] == "SERVICE_START" else 2)))
    return events[:limit]


def generate_simulation_summary(
    fcfs_metrics: Dict[str, Any],
    triage_metrics: Dict[str, Any],
    num_doctors: int,
    n_patients: int,
    scenario_duration: int,
    max_q_fcfs: int,
    max_q_triage: int,
    completed_triage: int,
    remaining_triage: int,
) -> str:
    """Generates an objective textual summary calculated strictly from simulated outputs."""
    if n_patients == 0:
        return "SIMULATED SCENARIO SUMMARY: Zero patient arrivals were modeled. All clinicians remained idle with 0 wait time."

    emerg_fcfs = fcfs_metrics["by_urgency"].get("EMERGENCY", {})
    emerg_triage = triage_metrics["by_urgency"].get("EMERGENCY", {})
    fcfs_overall = fcfs_metrics.get("overall", {})
    triage_overall = triage_metrics.get("overall", {})

    e_wait_f = emerg_fcfs.get("avg_wait_minutes", 0)
    e_wait_t = emerg_triage.get("avg_wait_minutes", 0)
    e_count = emerg_triage.get("patient_count", 0)
    e_breach_f = emerg_fcfs.get("exceeded_target_count", 0)
    e_breach_t = emerg_triage.get("exceeded_target_count", 0)

    e_reduct = 0.0
    if e_wait_f > 0:
        e_reduct = round(((e_wait_f - e_wait_t) / e_wait_f) * 100.0, 1)

    all_wait_f = fcfs_overall.get("avg_wait_minutes", 0)
    all_wait_t = triage_overall.get("avg_wait_minutes", 0)
    reassessed = triage_overall.get("total_reassessed_escalations", 0)

    return (
        f"SIMULATION RUN SUMMARY: Under a modeled {scenario_duration}-minute clinical shift with {num_doctors} clinicians "
        f"and {n_patients} synthetic patient arrivals ({e_count} Level 1 emergencies):\n"
        f"• Baseline FCFS produced an average wait of {all_wait_f}m across all patients (peak wait {fcfs_overall.get('max_wait_minutes', 0)}m, peak queue {max_q_fcfs} cases). "
        f"Level 1 emergency cases waited an average of {e_wait_f}m with {e_breach_f} target breaches.\n"
        f"• Proposed Emergency-Priority policy reduced Level 1 emergency average wait to {e_wait_t}m "
        f"({'-' if e_reduct >= 0 else '+'}{abs(e_reduct)}%), resulting in {e_breach_t} emergency target breaches. "
        f"Overall average wait was {all_wait_t}m (median {triage_overall.get('median_wait_minutes', 0)}m, peak wait {triage_overall.get('max_wait_minutes', 0)}m, peak queue {max_q_triage} cases).\n"
        f"• Shift Output: {completed_triage} cases completed consultation and {remaining_triage} cases remained in queue at minute {scenario_duration}. "
        f"Anti-starvation protocol triggered {reassessed} dynamic priority reassessment(s) to protect lower-urgency patients from indefinite waiting."
    )


def run_comparative_simulation(
    n_patients: int = 50,
    num_doctors: int = 3,
    random_seed: int = 42,
    service_time_emergency: int = 20,
    service_time_priority: int = 15,
    service_time_routine: int = 10,
    starvation_reassessment_threshold: int = 90,
    emergency_proportion: Optional[float] = None,
    scenario_duration_minutes: int = 240,
    avg_service_duration: Optional[int] = None,
    custom_arrivals: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Executes a side-by-side comparative simulation of FCFS vs Triage policies
    using the identical arrival stream and service times.
    """
    if custom_arrivals is not None:
        arrivals = [
            PatientArrival(
                patient_id=item["patient_id"],
                arrival_minute=int(item["arrival_minute"]),
                arrival_time_str=item.get("arrival_time_str", f"{item['arrival_minute']}m"),
                chief_complaint=item.get("chief_complaint", "Clinical intake"),
                triage_level=int(item["triage_level"]),
                urgency_category=item.get(
                    "urgency_category",
                    "EMERGENCY" if item["triage_level"] == 1 else ("PRIORITY" if item["triage_level"] == 2 else "ROUTINE")
                ),
                service_time_minutes=int(item.get("service_time_minutes", 12)),
                target_wait_minutes=int(item.get("target_wait_minutes", 5 if item["triage_level"] == 1 else 45)),
                is_escalated=bool(item.get("is_escalated", False)),
            )
            for item in custom_arrivals
        ]
        data_source_label = "Custom / Supplied arrival log"
    else:
        arrivals = generate_synthetic_arrivals(
            n_patients=n_patients,
            random_seed=random_seed,
            service_time_emergency=service_time_emergency,
            service_time_priority=service_time_priority,
            service_time_routine=service_time_routine,
            emergency_proportion=emergency_proportion,
            scenario_duration_minutes=scenario_duration_minutes,
            avg_service_duration=avg_service_duration,
        )
        data_source_label = f"Synthetic Demonstration Log ({n_patients} patients, seed {random_seed})"

    # Run FCFS and Triage on the exact same arrivals
    fcfs_records = simulate_fcfs(arrivals, num_doctors=num_doctors)
    triage_records = simulate_triage_assisted(
        arrivals,
        num_doctors=num_doctors,
        starvation_reassessment_threshold=starvation_reassessment_threshold,
    )

    fcfs_metrics = calculate_group_metrics(fcfs_records)
    triage_metrics = calculate_group_metrics(triage_records)

    # Dynamic metrics & visualizations
    queue_data = calculate_queue_over_time(fcfs_records, triage_records, scenario_duration_minutes)
    case_completion = calculate_case_completion_summary(fcfs_records, triage_records, scenario_duration_minutes)
    workload = calculate_clinician_workload(fcfs_records, triage_records, num_doctors, scenario_duration_minutes)
    waiting_dist = calculate_waiting_time_distribution(fcfs_records, triage_records)
    timeline = build_event_timeline(triage_records, limit=60)

    # Comparative difference analysis
    emerg_fcfs = fcfs_metrics["by_urgency"].get("EMERGENCY", {})
    emerg_triage = triage_metrics["by_urgency"].get("EMERGENCY", {})

    emergency_wait_reduction_pct = 0.0
    if emerg_fcfs.get("avg_wait_minutes", 0) > 0:
        reduction = emerg_fcfs["avg_wait_minutes"] - emerg_triage.get("avg_wait_minutes", 0)
        emergency_wait_reduction_pct = round((reduction / emerg_fcfs["avg_wait_minutes"]) * 100.0, 1)

    summary_text = generate_simulation_summary(
        fcfs_metrics=fcfs_metrics,
        triage_metrics=triage_metrics,
        num_doctors=num_doctors,
        n_patients=len(arrivals),
        scenario_duration=scenario_duration_minutes,
        max_q_fcfs=queue_data["fcfs_max_queue_length"],
        max_q_triage=queue_data["triage_max_queue_length"],
        completed_triage=case_completion["triage_completed"],
        remaining_triage=case_completion["triage_remaining"],
    )

    return {
        "simulation_id": f"SIM-{random_seed}-{num_doctors}DOC-{len(arrivals)}PTS",
        "data_source": data_source_label,
        "is_synthetic": custom_arrivals is None,
        "parameters": {
            "num_doctors": num_doctors,
            "patient_count": len(arrivals),
            "random_seed": random_seed,
            "scenario_duration_minutes": scenario_duration_minutes,
            "emergency_proportion": emergency_proportion or 0.12,
            "avg_service_duration": avg_service_duration,
            "service_time_assumptions": {
                "emergency_minutes": service_time_emergency,
                "priority_minutes": service_time_priority,
                "routine_minutes": service_time_routine,
            },
            "starvation_reassessment_threshold_minutes": starvation_reassessment_threshold,
        },
        "fcfs": fcfs_metrics,
        "triage": triage_metrics,
        "queue_over_time": queue_data["series"],
        "max_queue_length": {
            "fcfs": queue_data["fcfs_max_queue_length"],
            "triage": queue_data["triage_max_queue_length"],
        },
        "case_completion": case_completion,
        "clinician_workload": workload,
        "waiting_time_distribution": waiting_dist,
        "event_timeline": timeline,
        "auto_generated_summary": summary_text,
        "comparison_highlights": {
            "emergency_avg_wait_fcfs": emerg_fcfs.get("avg_wait_minutes", 0),
            "emergency_avg_wait_triage": emerg_triage.get("avg_wait_minutes", 0),
            "emergency_wait_reduction_percent": emergency_wait_reduction_pct,
            "emergency_exceeded_target_fcfs": emerg_fcfs.get("exceeded_target_count", 0),
            "emergency_exceeded_target_triage": emerg_triage.get("exceeded_target_count", 0),
            "starvation_safeguards_triggered": triage_metrics["overall"]["total_reassessed_escalations"],
            "fcfs_max_queue_length": queue_data["fcfs_max_queue_length"],
            "triage_max_queue_length": queue_data["triage_max_queue_length"],
        },
        "sample_patient_records": {
            "fcfs": [asdict(r) for r in fcfs_records[:15]],
            "triage": [asdict(r) for r in triage_records[:15]],
        },
        "methodology_and_limitations": {
            "methodology": (
                "Discrete-event queue simulation modeling multi-server (M/G/c) queueing dynamics. "
                "The baseline policy serves strictly in arrival order (FCFS). The triage policy assigns "
                "absolute preemption to Level 1 emergencies, clinical weighting to Level 2 priorities, and "
                "dynamically monitors wait times to trigger reassessment bumps for routine cases exceeding the starvation threshold."
            ),
            "assumptions": [
                "Physicians work continuously across the modeled shift with zero unmodeled breaks.",
                "Patient service times are approximated with normal distribution around clinical acuity averages.",
                "Zero balking or reneging: all queued patients remain until seen.",
                "Both policies evaluate the exact same arrival sequence and service times to isolate policy impact.",
            ],
            "limitations_disclaimer": (
                "SIMULATION DISCLAIMER: This simulation uses a parameterized demonstration model. "
                "Numerical wait time improvements represent mathematical policy trade-offs rather than proven real-world clinical outcomes. "
                "Physical hospital flow involves triage reassessment, bed availability, diagnostics turnaround, and registration staffing constraints."
            ),
        },
    }
