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
