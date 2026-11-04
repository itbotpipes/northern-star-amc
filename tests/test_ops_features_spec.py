import os
import sys
from datetime import date

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from nse import create_app, db
from nse.models import User, Contract, Visit, SupportTicket

app = create_app()
app.config["TESTING"] = True
app.config["WTF_CSRF_ENABLED"] = False
client = app.test_client()

def test_add_extra_visit():
    # Manager can add extra / complimentary visit window (e.g. Diwali visit)
    with app.app_context():
        manager = User.query.filter(User.role.in_(["manager", "admin"])).first()
        contract = Contract.query.filter_by(status="active").first()
        if not contract:
            contract = Contract(reference="NSE-TEST-AMC", status="active", site_name="Test Tower A")
            db.session.add(contract)
            db.session.commit()
        contract_id = contract.id
        initial_visits = len(contract.visits)

    with client.session_transaction() as sess:
        sess["_user_id"] = str(manager.id)
        sess["_fresh"] = True

    res = client.post(f"/ops/contract/{contract_id}/add-visit", data={
        "custom_label": "Diwali Complimentary Visit",
        "visit_type": "complimentary",
        "scheduled_date": date.today().isoformat(),
        "notes": "Complimentary festival inspection by NSE"
    }, follow_redirects=True)

    assert res.status_code == 200
    with app.app_context():
        c = db.session.get(Contract, contract_id)
        assert len(c.visits) == initial_visits + 1
        new_v = c.visits[-1]
        assert new_v.custom_label == "Diwali Complimentary Visit"
        assert new_v.label == "Diwali Complimentary Visit"
        assert new_v.visit_type == "complimentary"
    print("PASS: test_add_extra_visit")

def test_manual_complaint_and_backlog():
    # Manager can log manual site complaints / backlog tasks
    with app.app_context():
        manager = User.query.filter(User.role.in_(["manager", "admin"])).first()
        tech = User.query.filter_by(role="technician").first()

    with client.session_transaction() as sess:
        sess["_user_id"] = str(manager.id)
        sess["_fresh"] = True

    # 1. Log unscheduled into Backlog
    res = client.post("/ops/ticket/new", data={
        "title": "Pressure gauge leakage in basement B2",
        "category": "small_rework",
        "source": "diary",
        "site_name": "Sunrise Business Hub",
        "caller_name": "Sir / Facility Manager",
        "caller_phone": "9876543210",
        "description": "Diary note: replace damaged needle valve on riser 2",
        "priority": "high",
    }, follow_redirects=True)
    assert res.status_code == 200

    with app.app_context():
        ticket = SupportTicket.query.filter_by(title="Pressure gauge leakage in basement B2").first()
        assert ticket is not None
        assert ticket.source == "diary"
        assert ticket.category == "small_rework"
        assert ticket.scheduled_date is None
        ticket_id = ticket.id

    # 2. View Backlog tab on /ops/tickets
    res_backlog = client.get("/ops/tickets?status=backlog")
    assert res_backlog.status_code == 200
    assert b"Pressure gauge leakage" in res_backlog.data

    # 3. Schedule into Calendar when team is free
    if tech:
        res_sched = client.post(f"/ops/ticket/{ticket_id}", data={
            "action": "assign_schedule",
            "assigned_to_id": str(tech.id),
            "scheduled_date": date.today().isoformat()
        }, follow_redirects=True)
        assert res_sched.status_code == 200

        with app.app_context():
            t = db.session.get(SupportTicket, ticket_id)
            assert t.scheduled_date == date.today()
            assert t.assigned_to_id == tech.id

    print("PASS: test_manual_complaint_and_backlog")

def test_navigation_cleanup():
    # Verify Rework and Refill Orders are removed from staff navigation
    with app.app_context():
        manager = User.query.filter(User.role.in_(["manager", "admin"])).first()

    with client.session_transaction() as sess:
        sess["_user_id"] = str(manager.id)
        sess["_fresh"] = True

    res = client.get("/ops/day-plan")
    assert res.status_code == 200
    # Must not contain the rework or refill navigation links in base_ops
    assert b"/ops/rework" not in res.data
    assert b"/ops/refills" not in res.data
    print("PASS: test_navigation_cleanup")

def test_technician_privacy_masking():
    # Technician must not see personal customer details (phone/email)
    with app.app_context():
        tech = User.query.filter_by(role="technician").first()
        manager = User.query.filter(User.role.in_(["manager", "admin"])).first()
        contract = Contract.query.filter(Contract.applicant_phone != None).first()

    if tech and contract:
        # As technician
        with client.session_transaction() as sess:
            sess["_user_id"] = str(tech.id)
            sess["_fresh"] = True

        res_tech = client.get(f"/ops/contract/{contract.id}")
        assert res_tech.status_code == 200
        # Personal phone should be masked
        assert contract.applicant_phone.encode() not in res_tech.data or b"[Protected]" in res_tech.data or b"Office Only" in res_tech.data

        # As manager
        with client.session_transaction() as sess:
            sess["_user_id"] = str(manager.id)
            sess["_fresh"] = True

        res_mgr = client.get(f"/ops/contract/{contract.id}")
        assert res_mgr.status_code == 200
        # Manager sees the actual phone
        assert contract.applicant_phone.encode() in res_mgr.data

    print("PASS: test_technician_privacy_masking")

if __name__ == "__main__":
    test_add_extra_visit()
    test_manual_complaint_and_backlog()
    test_navigation_cleanup()
    test_technician_privacy_masking()
    print("\nALL OPS FEATURES & RBAC PRIVACY TESTS PASSED!")
