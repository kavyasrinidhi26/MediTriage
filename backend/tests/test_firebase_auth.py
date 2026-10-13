import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.config import get_settings
from app.auth import is_firebase_configured, StaffUser, get_current_staff_user
import firebase_admin.auth as fb_auth

client = TestClient(app)
settings = get_settings()


def test_firebase_unconfigured_default():
    """When FIREBASE_AUTH_ENABLED is False, backend auth is safely disabled for local dev/testing."""
    with patch.object(settings, "FIREBASE_AUTH_ENABLED", False):
        assert is_firebase_configured() is False


def test_public_endpoints_accessible_without_auth():
    """Public health and telemetry endpoints do not require authentication."""
    res_health = client.get("/api/health")
    assert res_health.status_code == 200

    res_stats = client.get("/api/triage/stats")
    assert res_stats.status_code == 200

    res_queue = client.get("/api/queue")
    assert res_queue.status_code == 200


def test_emergency_intake_bypass_invariant():
    """
    CRITICAL CLINICAL SAFETY INVARIANT:
    Emergency trauma accident intake must NEVER be blocked by authentication barriers.
    """
    with patch.object(settings, "FIREBASE_AUTH_ENABLED", True), \
         patch.object(settings, "FIREBASE_PROJECT_ID", "test-hospital-project"):
        emergency_payload = {
            "patient_identity_status": "UNKNOWN",
            "accident_type": "ROAD_TRAFFIC_ACCIDENT",
            "mechanism_of_injury": "Motorcyclist collision with barrier, blunt trauma",
            "airway_status": "Threatened / Stridor",
            "breathing_status": "Severe Distress",
            "circulation_status": "Weak Thread",
            "neurological_status": "Unresponsive (U)",
            "major_bleeding": "Scalp laceration",
            "pulse_bpm": 135,
            "systolic_bp": 82,
            "diastolic_bp": 50,
            "spo2": 88.0,
            "gcs_score": 6,
            "red_flags": ["Severe polytrauma", "Hemorrhagic shock SBP < 90"],
            "escalation_reason": "High-velocity trauma with hemorrhagic shock",
            "immediate_actions_taken": "High-flow O2, cervical collar applied",
            "activated_by": "Staff Nurse Priya",
            "assigned_resuscitation_bay": "Red Trauma Bay 01",
        }
        # Emergency intake submitted with NO Authorization header
        res = client.post("/api/emergency/intake", json=emergency_payload)
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["triage_category"] == "LEVEL_1_RESUSCITATION"
        assert data["assigned_resuscitation_bay"] == "Red Trauma Bay 01"


def test_protected_staff_endpoint_requires_auth_when_enabled():
    """
    When Firebase Auth is enabled, staff write operations (e.g. status updates)
    strictly require an Authorization Bearer token (HTTP 401 on missing token).
    """
    with patch.object(settings, "FIREBASE_AUTH_ENABLED", True), \
         patch.object(settings, "FIREBASE_PROJECT_ID", "test-hospital-project"):
        # Attempt status update without Authorization header
        res = client.patch(
            "/api/triage/queue/nonexistent-id/status",
            json={"status": "WITH_DOCTOR", "doctor_room": "Room 102"}
        )
        assert res.status_code == 401
        assert "Authentication required" in res.json()["detail"]


def test_protected_staff_endpoint_rejects_invalid_token():
    """
    When Firebase Auth is enabled, invalid or forged tokens return HTTP 401 Unauthorized.
    """
    with patch.object(settings, "FIREBASE_AUTH_ENABLED", True), \
         patch.object(settings, "FIREBASE_PROJECT_ID", "test-hospital-project"):
        with patch("app.auth.get_firebase_app", return_value=MagicMock()), \
             patch("firebase_admin.auth.verify_id_token", side_effect=fb_auth.InvalidIdTokenError("Invalid signature")):
            res = client.patch(
                "/api/triage/queue/nonexistent-id/status",
                headers={"Authorization": "Bearer fake-invalid-token-12345"},
                json={"status": "WITH_DOCTOR", "doctor_room": "Room 102"}
            )
            assert res.status_code == 401
            assert "Invalid Firebase ID token" in res.json()["detail"]


def test_protected_staff_endpoint_rejects_expired_token():
    """
    Expired Firebase ID tokens return HTTP 401 with appropriate token-expired detail.
    """
    with patch.object(settings, "FIREBASE_AUTH_ENABLED", True), \
         patch.object(settings, "FIREBASE_PROJECT_ID", "test-hospital-project"):
        with patch("app.auth.get_firebase_app", return_value=MagicMock()), \
             patch("firebase_admin.auth.verify_id_token", side_effect=fb_auth.ExpiredIdTokenError("Token expired", None)):
            res = client.patch(
                "/api/triage/queue/nonexistent-id/status",
                headers={"Authorization": "Bearer expired-token-67890"},
                json={"status": "WITH_DOCTOR"}
            )
            assert res.status_code == 401
            assert "expired" in res.json()["detail"].lower()


def test_protected_staff_endpoint_accepts_valid_verified_token():
    """
    When verified by Firebase Admin SDK, requests succeed and staff identity is established.
    """
    verified_payload = {
        "uid": "duty-nurse-uid-888",
        "email": "nurse.priya@civilhospital.gov.in",
        "name": "Nurse Priya",
        "role": "STAFF",
    }
    with patch.object(settings, "FIREBASE_AUTH_ENABLED", True), \
         patch.object(settings, "FIREBASE_PROJECT_ID", "test-hospital-project"):
        with patch("app.auth.get_firebase_app", return_value=MagicMock()), \
             patch("firebase_admin.auth.verify_id_token", return_value=verified_payload):
            # Target queue item from existing seed
            res = client.patch(
                "/api/triage/queue/UHID-2026-901/status",
                headers={"Authorization": "Bearer valid-verified-firebase-jwt"},
                json={"status": "WAITING"}
            )
            assert res.status_code == 200
            assert res.json()["status"] == "WAITING"
