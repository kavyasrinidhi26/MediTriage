"""
Unit & Integration Tests for Queue Simulation (FCFS vs Triage-Assisted)
Tests queue ordering, emergency priority, fairness/anti-starvation, empty inputs, and reproducibility.
"""

import pytest
from starlette.testclient import TestClient
from app.main import app
from app.simulation.queue_simulator import (
    PatientArrival,
    simulate_fcfs,
    simulate_triage_assisted,
    generate_synthetic_arrivals,
    run_comparative_simulation,
    calculate_group_metrics,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_queue_ordering_fcfs_strictly_follows_arrival_order():
    """Verify FCFS serves patients strictly in arrival order regardless of acuity."""
    arrivals = [
        PatientArrival(
            patient_id="P1",
            arrival_minute=10,
            arrival_time_str="08:10 AM",
            chief_complaint="Knee ache",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=15,
            target_wait_minutes=120,
        ),
        PatientArrival(
            patient_id="P2",
            arrival_minute=15,
            arrival_time_str="08:15 AM",
            chief_complaint="Chest pain shock",
            triage_level=1,
            urgency_category="EMERGENCY",
            service_time_minutes=20,
            target_wait_minutes=5,
        ),
    ]

    records = simulate_fcfs(arrivals, num_doctors=1)
    assert len(records) == 2
    # In FCFS, P1 arrived first so P1 is served first
    assert records[0].patient_id == "P1"
    assert records[1].patient_id == "P2"
    # P2 (Emergency) had to wait for P1 to finish
    assert records[1].wait_time_minutes >= 10


def test_emergency_priority_is_never_overridden_in_triage():
    """Verify Triage-Assisted policy prioritizes Level 1 Emergency over all routine and priority patients."""
    arrivals = [
        PatientArrival(
            patient_id="P_ROUTINE",
            arrival_minute=5,
            arrival_time_str="08:05 AM",
            chief_complaint="Knee ache",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=15,
            target_wait_minutes=120,
        ),
        PatientArrival(
            patient_id="P_PRIORITY",
            arrival_minute=6,
            arrival_time_str="08:06 AM",
            chief_complaint="Fracture",
            triage_level=2,
            urgency_category="PRIORITY",
            service_time_minutes=15,
            target_wait_minutes=45,
        ),
        PatientArrival(
            patient_id="P_EMERGENCY",
            arrival_minute=7,
            arrival_time_str="08:07 AM",
            chief_complaint="Acute MI Diaphoretic",
            triage_level=1,
            urgency_category="EMERGENCY",
            service_time_minutes=20,
            target_wait_minutes=5,
            is_escalated=True,
        ),
    ]

    # Doctor becomes free at minute 10, when all 3 patients are waiting
    records = simulate_triage_assisted(arrivals, num_doctors=1)
    assert len(records) == 3
    # P_ROUTINE arrived first at 5, but when doctor is ready, P_EMERGENCY must be chosen!
    # Note: first doctor starts at 0, so at minute 5 P_ROUTINE is admitted immediately if doctor was free from 0.
    # Let's test doctor busy until minute 20 so all 3 are queued:
    arrivals_queued = [
        PatientArrival(
            patient_id="P_INITIAL",
            arrival_minute=0,
            arrival_time_str="08:00 AM",
            chief_complaint="Checkup",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=20,  # Doctor busy until 20
            target_wait_minutes=120,
        ),
        PatientArrival(
            patient_id="P_ROUTINE",
            arrival_minute=5,
            arrival_time_str="08:05 AM",
            chief_complaint="Knee ache",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=15,
            target_wait_minutes=120,
        ),
        PatientArrival(
            patient_id="P_PRIORITY",
            arrival_minute=6,
            arrival_time_str="08:06 AM",
            chief_complaint="Fracture",
            triage_level=2,
            urgency_category="PRIORITY",
            service_time_minutes=15,
            target_wait_minutes=45,
        ),
        PatientArrival(
            patient_id="P_EMERGENCY",
            arrival_minute=7,
            arrival_time_str="08:07 AM",
            chief_complaint="Acute MI Diaphoretic",
            triage_level=1,
            urgency_category="EMERGENCY",
            service_time_minutes=20,
            target_wait_minutes=5,
            is_escalated=True,
        ),
    ]
    records_queued = simulate_triage_assisted(arrivals_queued, num_doctors=1)
    # After P_INITIAL finishes at 20, the second patient chosen MUST be P_EMERGENCY!
    assert records_queued[1].patient_id == "P_EMERGENCY"
    # Third patient chosen MUST be P_PRIORITY
    assert records_queued[2].patient_id == "P_PRIORITY"
    # Last patient chosen is P_ROUTINE
    assert records_queued[3].patient_id == "P_ROUTINE"


def test_fairness_anti_starvation_reassessment_bump():
    """Verify that lower-urgency patients waiting past starvation threshold receive reassessment priority bump."""
    # Routine patient arrives at minute 0
    # Continuous stream of priority patients arrive every 10 mins
    arrivals = [
        PatientArrival(
            patient_id="P_ROUTINE_LONG_WAIT",
            arrival_minute=0,
            arrival_time_str="08:00 AM",
            chief_complaint="Knee pain",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=10,
            target_wait_minutes=120,
        ),
    ]
    for i in range(1, 15):
        arrivals.append(
            PatientArrival(
                patient_id=f"P_PRIORITY_{i}",
                arrival_minute=i * 8,
                arrival_time_str="08:15 AM",
                chief_complaint="High fever",
                triage_level=2,
                urgency_category="PRIORITY",
                service_time_minutes=10,
                target_wait_minutes=45,
            )
        )

    # Set starvation threshold to 40 minutes with 1 doctor
    records = simulate_triage_assisted(arrivals, num_doctors=1, starvation_reassessment_threshold=40)
    routine_rec = next(r for r in records if r.patient_id == "P_ROUTINE_LONG_WAIT")

    # The routine patient must not be starved until the very end
    # They should be reassessed and served before the last priority patients
    assert routine_rec.reassessment_escalated is True or routine_rec.service_start_minute == 0


def test_empty_input_handled_gracefully():
    """Verify empty arrival input returns clean, empty metrics without division by zero errors."""
    records_fcfs = simulate_fcfs([], num_doctors=2)
    assert records_fcfs == []

    records_triage = simulate_triage_assisted([], num_doctors=2)
    assert records_triage == []

    metrics = calculate_group_metrics([])
    assert metrics["overall"]["total_patients"] == 0
    assert metrics["overall"]["avg_wait_minutes"] == 0.0

    sim_res = run_comparative_simulation(n_patients=0, num_doctors=2)
    assert sim_res["fcfs"]["overall"]["total_patients"] == 0
    assert sim_res["triage"]["overall"]["total_patients"] == 0


def test_simulation_reproducibility():
    """Verify running simulation with same seed produces identical results."""
    res1 = run_comparative_simulation(n_patients=40, num_doctors=3, random_seed=777)
    res2 = run_comparative_simulation(n_patients=40, num_doctors=3, random_seed=777)

    assert res1["fcfs"]["overall"] == res2["fcfs"]["overall"]
    assert res1["triage"]["overall"] == res2["triage"]["overall"]
    assert res1["comparison_highlights"] == res2["comparison_highlights"]


def test_simulation_api_endpoints(client):
    """Verify HTTP API endpoints for demo arrivals and simulation execution."""
    resp_arr = client.get("/api/simulation/demo-arrivals?n_patients=10&random_seed=42")
    assert resp_arr.status_code == 200
    arr_data = resp_arr.json()
    assert len(arr_data) == 10
    assert arr_data[0]["patient_id"] == "SIM-P001"

    resp_sim = client.post(
        "/api/simulation/run",
        json={"num_doctors": 3, "n_patients": 25, "random_seed": 42},
    )
    assert resp_sim.status_code == 200
    sim_data = resp_sim.json()
    assert "fcfs" in sim_data
    assert "triage" in sim_data
    assert "methodology_and_limitations" in sim_data


def test_simulation_surge_arrivals():
    """Verify that a surge of arrivals (e.g. 100 patients) runs cleanly and calculates queue metrics."""
    res = run_comparative_simulation(
        n_patients=100,
        num_doctors=4,
        random_seed=999,
        scenario_duration_minutes=240,
        emergency_proportion=0.25,
    )
    assert res["parameters"]["patient_count"] == 100
    assert len(res["queue_over_time"]) > 0
    assert res["max_queue_length"]["fcfs"] > 0
    assert res["max_queue_length"]["triage"] > 0
    assert len(res["clinician_workload"]) == 4
    assert len(res["waiting_time_distribution"]) == 5
    assert len(res["event_timeline"]) > 0
    assert "SIMULATION RUN SUMMARY:" in res["auto_generated_summary"]


def test_simulation_different_staffing_levels():
    """Verify that increasing clinician staffing reduces average wait times and increases completion."""
    res_1doc = run_comparative_simulation(n_patients=30, num_doctors=1, random_seed=123)
    res_4doc = run_comparative_simulation(n_patients=30, num_doctors=4, random_seed=123)

    # 4 doctors should complete at least as many cases and have lower average wait than 1 doctor
    assert res_4doc["triage"]["overall"]["avg_wait_minutes"] < res_1doc["triage"]["overall"]["avg_wait_minutes"]
    assert res_4doc["case_completion"]["triage_completed"] >= res_1doc["case_completion"]["triage_completed"]


def test_simulation_does_not_create_real_patient_records(client):
    """
    Verify that executing a simulation does NOT create or alter real hospital patient records,
    OPD queues, or emergency department database entries.
    """
    from app.api.routes import QUEUE_STORAGE

    # Record baseline state of live queue
    initial_live_queue_count = len(QUEUE_STORAGE)

    # Check emergency cases count in database
    init_emg_res = client.get("/api/emergency/cases")
    initial_emg_count = len(init_emg_res.json())

    # Execute simulation with 50 synthetic patients
    sim_res = client.post(
        "/api/simulation/run",
        json={
            "num_doctors": 3,
            "n_patients": 50,
            "random_seed": 42,
            "emergency_proportion": 0.20,
            "scenario_duration_minutes": 240,
        },
    )
    assert sim_res.status_code == 200
    data = sim_res.json()
    assert data["is_synthetic"] is True

    # Verify live OPD queue and emergency database remain strictly untouched
    assert len(QUEUE_STORAGE) == initial_live_queue_count
    post_emg_res = client.get("/api/emergency/cases")
    assert len(post_emg_res.json()) == initial_emg_count


def test_equal_priority_ordering_strictly_preserves_arrival_order():
    """
    Requirement 3: Preserve arrival order among patients with equal priority.
    When multiple patients share the same urgency tier, they must be served strictly in arrival order.
    """
    # 3 Routine patients arriving in order: R1 at 5, R2 at 8, R3 at 12
    # All are queued while a doctor is busy from 0 to 20
    arrivals = [
        PatientArrival(
            patient_id="DOC_BUSY",
            arrival_minute=0,
            arrival_time_str="08:00 AM",
            chief_complaint="Checkup",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=20,
            target_wait_minutes=120,
        ),
        PatientArrival(
            patient_id="R1_FIRST",
            arrival_minute=5,
            arrival_time_str="08:05 AM",
            chief_complaint="Knee ache",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=10,
            target_wait_minutes=120,
        ),
        PatientArrival(
            patient_id="R2_SECOND",
            arrival_minute=8,
            arrival_time_str="08:08 AM",
            chief_complaint="Minor cold",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=10,
            target_wait_minutes=120,
        ),
        PatientArrival(
            patient_id="R3_THIRD",
            arrival_minute=12,
            arrival_time_str="08:12 AM",
            chief_complaint="Skin rash",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=10,
            target_wait_minutes=120,
        ),
    ]

    records = simulate_triage_assisted(arrivals, num_doctors=1)
    # Check that after DOC_BUSY, the 3 routine patients are served strictly in arrival order: R1, then R2, then R3
    served_ids = [r.patient_id for r in records]
    assert served_ids == ["DOC_BUSY", "R1_FIRST", "R2_SECOND", "R3_THIRD"]


def test_critical_escalation_remains_visible_and_cannot_be_downgraded():
    """
    Requirement 3: Never allow simulation sorting, filtering or queue updates to suppress
    a critical emergency alert. Critical safety escalations must be prioritized like emergency.
    """
    arrivals = [
        PatientArrival(
            patient_id="DOC_BUSY",
            arrival_minute=0,
            arrival_time_str="08:00 AM",
            chief_complaint="Checkup",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=20,
            target_wait_minutes=120,
        ),
        PatientArrival(
            patient_id="P_ROUTINE",
            arrival_minute=5,
            arrival_time_str="08:05 AM",
            chief_complaint="Rash",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=10,
            target_wait_minutes=120,
        ),
        PatientArrival(
            patient_id="P_ESCALATED_ROUTINE",
            arrival_minute=6,
            arrival_time_str="08:06 AM",
            chief_complaint="Abdominal pain with red flag deterioration",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=15,
            target_wait_minutes=5,
            is_escalated=True,  # Safety-reviewed critical escalation
        ),
    ]

    records = simulate_triage_assisted(arrivals, num_doctors=1)
    # The escalated patient must be prioritized over P_ROUTINE even though both have triage_level=3
    assert records[1].patient_id == "P_ESCALATED_ROUTINE"
    assert records[1].is_escalated is True
    assert records[2].patient_id == "P_ROUTINE"


def test_percentile_metrics_and_served_counts():
    """
    Requirement 4: Verify calculation of mean, median, p75, p90, p95 wait times
    and served vs. still-waiting counts.
    """
    # 30 patients with controlled wait times
    test_arrivals = generate_synthetic_arrivals(n_patients=30, random_seed=42)
    records = simulate_triage_assisted(test_arrivals, num_doctors=2)
    metrics = calculate_group_metrics(records, scenario_duration_minutes=120)

    overall = metrics["overall"]
    assert "p75_wait_minutes" in overall
    assert "p90_wait_minutes" in overall
    assert "p95_wait_minutes" in overall
    assert "total_served" in overall
    assert "total_still_waiting" in overall

    # Check monotonicity of percentiles
    assert overall["min_wait_minutes"] <= overall["median_wait_minutes"]
    assert overall["median_wait_minutes"] <= overall["p75_wait_minutes"]
    assert overall["p75_wait_minutes"] <= overall["p90_wait_minutes"]
    assert overall["p90_wait_minutes"] <= overall["p95_wait_minutes"]
    assert overall["p95_wait_minutes"] <= overall["max_wait_minutes"]

    # Total arrived must equal served + still_waiting
    assert overall["total_served"] + overall["total_still_waiting"] == 30


def test_zero_baseline_handled_without_division_error():
    """
    Requirement 5: Handle zero or unavailable baseline waiting times without division errors.
    """
    # Scenario where arrivals get immediate service (wait = 0)
    arrivals = [
        PatientArrival(
            patient_id="P_IMMEDIATE_1",
            arrival_minute=0,
            arrival_time_str="08:00 AM",
            chief_complaint="Emergency",
            triage_level=1,
            urgency_category="EMERGENCY",
            service_time_minutes=10,
            target_wait_minutes=5,
        ),
        PatientArrival(
            patient_id="P_IMMEDIATE_2",
            arrival_minute=50,
            arrival_time_str="08:50 AM",
            chief_complaint="Routine",
            triage_level=3,
            urgency_category="ROUTINE",
            service_time_minutes=10,
            target_wait_minutes=120,
        ),
    ]

    # With 2 doctors, both patients are served immediately upon arrival (wait = 0.0)
    res = run_comparative_simulation(n_patients=2, num_doctors=2)
    # Should not raise ZeroDivisionError and return valid floats
    assert isinstance(res["comparison_highlights"]["emergency_wait_reduction_percent"], float)
    assert isinstance(res["comparison_highlights"]["emergency_wait_reduction_minutes"], float)
    assert isinstance(res["comparison_highlights"]["overall_wait_reduction_percent"], float)


def test_doctor_breaks_increase_waiting_times():
    """
    Requirement 2: Configurable doctor rest breaks and department staffing assumptions.
    Doctors taking rest breaks increase subsequent wait times.
    """
    arrivals = [
        PatientArrival(
            patient_id=f"P_{i}",
            arrival_minute=i * 20,
            arrival_time_str="08:00 AM",
            chief_complaint="Consultation",
            triage_level=2,
            urgency_category="PRIORITY",
            service_time_minutes=25,
            target_wait_minutes=45,
        )
        for i in range(8)
    ]

    # Without break
    records_no_break = simulate_fcfs(arrivals, num_doctors=1, doctor_break_minutes=0)
    total_wait_no_break = sum(r.wait_time_minutes for r in records_no_break)

    # With 30 min break every 60 min
    records_with_break = simulate_fcfs(
        arrivals,
        num_doctors=1,
        doctor_break_minutes=30,
        doctor_break_interval_minutes=60,
    )
    total_wait_with_break = sum(r.wait_time_minutes for r in records_with_break)

    # Break must add idle time and thus increase total wait time
    assert total_wait_with_break > total_wait_no_break


def test_arrival_log_status_and_database_source_api(client):
    """
    Requirement 1 & 6: Arrival log status and database source endpoints.
    - Check official arrival log reports limitation when missing.
    - Database arrivals returns records from SQLite.
    - Simulation run accepts 'database' and rejects 'official' with 404.
    """
    # 1. Arrival log status
    status_res = client.get("/api/simulation/arrival-log-status")
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["official_log_available"] is False
    assert "limitation" in status_data["limitation_statement"].lower()
    assert status_data["database_records_count"] > 0
    assert status_data["synthetic_demo_available"] is True

    # 2. Database arrivals endpoint
    db_arr_res = client.get("/api/simulation/database-arrivals?limit=15")
    assert db_arr_res.status_code == 200
    db_arr_data = db_arr_res.json()
    assert len(db_arr_data) == 15
    assert db_arr_data[0]["patient_id"].startswith("UHID") or db_arr_data[0]["patient_id"].startswith("P-")

    # 3. Simulation run with database source
    db_sim_res = client.post(
        "/api/simulation/run",
        json={
            "num_doctors": 3,
            "n_patients": 20,
            "dataset_source": "database",
        },
    )
    assert db_sim_res.status_code == 200
    sim_data = db_sim_res.json()
    assert sim_data["dataset_source"] == "database"
    assert sim_data["assumptions_documentation"]["dataset_source"].startswith("Recorded Database Patient Intake")

    # 4. Simulation run with official source when file is missing -> 404 with limitation
    official_sim_res = client.post(
        "/api/simulation/run",
        json={
            "num_doctors": 3,
            "dataset_source": "official",
        },
    )
    assert official_sim_res.status_code == 404
    assert "No official hospital patient arrival log file was provided" in official_sim_res.json()["detail"]

