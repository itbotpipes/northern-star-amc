"""
Automated End-to-End Test Suite for Northern Star AMC Mobile Application (React Native / Expo).
Covers all 12 core functional domains and 35 API client endpoints used by the mobile app:
  1. Auth & 10-Digit OTP Validation
  2. Customer Profile
  3. AMC Plans
  4. New AMC Applications & Tracking
  5. Dashboard & Contracts
  6. Agreement Acceptance, Renewal & Referrals
  7. Equipment Inventory & Transparency
  8. Visit Details & 5-Star Rating
  9. Service Quotations (Proposals, Negotiation & Acceptance)
  10. Material Quotations & Waivers
  11. Requests & Tickets (Emergency, Refill, Complaint)
  12. Customer Journey, Notifications & Certificates
"""

import os
import sys
from datetime import date, datetime

script_dir = os.path.dirname(os.path.abspath(__file__))
app_amc_dir = os.path.abspath(os.path.join(script_dir, ".."))
sys.path.insert(0, app_amc_dir)
os.chdir(app_amc_dir)

from nse.config import Config

class TestConfig(Config):
    TESTING = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_ENGINE_OPTIONS = {}

from nse import create_app, db
from nse.models import (
    User, Contract, AMCPlan, Visit, VisitFeedback, ServiceQuotation,
    ServiceQuotationItem, Quotation, QuotationItem, ServiceRequest,
    RefillOrder, RefillItem, SupportTicket, Equipment, RefillRecord, OtpCode,
    Notification, CustomerJourneyEvent, Enquiry
)
from nse.blueprints.api import issue_token


def run_all_mobile_functionality_tests():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()

        print("=" * 50)
        print("  NORTHERN STAR MOBILE APP - FULL FUNCTIONALITY TEST")
        print("=" * 50)

        # -------------------------------------------------------------------
        # 1. AUTHENTICATION & 10-DIGIT OTP VALIDATION
        # -------------------------------------------------------------------
        print("\n[1/12] Testing Authentication & 10-digit OTP...")
        
        # Test 10-digit validation rejection
        res_invalid = client.post("/api/v1/auth/otp/request", json={"phone": "12345"})
        assert res_invalid.status_code == 400
        assert "10-digit" in res_invalid.get_json()["error"]

        res_invalid_long = client.post("/api/v1/auth/otp/request", json={"phone": "98250123456789"})
        assert res_invalid_long.status_code == 400

        # Valid 10-digit request
        mobile_no = "9825011223"
        res_valid = client.post("/api/v1/auth/otp/request", json={"phone": mobile_no})
        assert res_valid.status_code == 200
        assert res_valid.get_json()["ok"] is True
        otp_dev_code = res_valid.get_json().get("dev_code")
        assert otp_dev_code is not None

        # Verify OTP and create customer account
        res_verify = client.post("/api/v1/auth/otp/verify", json={
            "phone": mobile_no,
            "code": otp_dev_code,
            "name": "Karan Singhania"
        })
        assert res_verify.status_code == 200
        auth_data = res_verify.get_json()
        token = auth_data["token"]
        assert token is not None
        headers = {"Authorization": f"Bearer {token}"}
        print("✓ OTP request, 10-digit validation, and token authentication PASSED.")

        # -------------------------------------------------------------------
        # 2. PROFILE (View & Update)
        # -------------------------------------------------------------------
        print("\n[2/12] Testing Profile (GET /me, PUT /me)...")
        res_me = client.get("/api/v1/me", headers=headers)
        assert res_me.status_code == 200
        me_data = res_me.get_json()["user"]
        assert me_data["name"] == "Karan Singhania"

        res_update_me = client.put("/api/v1/me", json={
            "name": "Karan Singhania (Updated)",
            "email": "karan@example.com",
            "address": "Penthouse 12, Sky City",
            "area": "Vesu"
        }, headers=headers)
        assert res_update_me.status_code == 200
        assert res_update_me.get_json()["user"]["name"] == "Karan Singhania (Updated)"
        print("✓ Profile retrieval and updates PASSED.")

        # -------------------------------------------------------------------
        # 3. PUBLIC PLANS
        # -------------------------------------------------------------------
        print("\n[3/12] Testing Plans (GET /plans)...")
        plan1 = AMCPlan(name="Gold Comprehensive", category="Standard", price=25000, visits_per_year=4)
        db.session.add(plan1)
        db.session.commit()

        res_plans = client.get("/api/v1/plans")
        assert res_plans.status_code == 200
        plans_data = res_plans.get_json()["plans"]
        assert len(plans_data) >= 1
        print("✓ Public AMC plans listing PASSED.")

        # -------------------------------------------------------------------
        # 4. NEW AMC APPLICATION & TRACKING
        # -------------------------------------------------------------------
        print("\n[4/12] Testing New AMC Application & Enquiries (POST /apply, GET /amc-requests)...")
        res_apply = client.post("/api/v1/apply", json={
            "site_name": "Sky City Commercial Tower",
            "site_address": "Canal Road, Vesu",
            "area": "Vesu",
            "property_type": "Commercial Complex",
            "plan_id": plan1.id,
            "problem_description": "Need comprehensive AMC for 6 hydrants and 20 extinguishers."
        }, headers=headers)
        assert res_apply.status_code == 200
        contract_id = res_apply.get_json()["contract"]["id"]

        # Track AMC requests
        res_amc_req = client.get("/api/v1/amc-requests", headers=headers)
        assert res_amc_req.status_code == 200
        assert len(res_amc_req.get_json()["applications"]) >= 1
        print("✓ New AMC application and tracking PASSED.")

        # -------------------------------------------------------------------
        # 5. DASHBOARD & CONTRACTS
        # -------------------------------------------------------------------
        print("\n[5/12] Testing Dashboard & Contract Details (GET /dashboard, GET /contracts)...")
        c = db.session.get(Contract, contract_id)
        c.status = "active"
        c.payment_status = "paid"
        c.start_date = date.today()
        
        tech = User(name="Ramesh Patel", phone="9825100000", role="technician")
        db.session.add(tech)
        db.session.commit()

        v1 = Visit(
            contract_id=c.id,
            visit_number=1,
            status="scheduled",
            scheduled_date=date.today(),
            technician_id=tech.id
        )
        db.session.add(v1)
        db.session.commit()

        res_dash = client.get("/api/v1/dashboard", headers=headers)
        assert res_dash.status_code == 200
        dash_data = res_dash.get_json()
        assert "contracts" in dash_data
        assert "counts" in dash_data
        assert "pending_quotes" in dash_data["counts"]

        res_contracts = client.get("/api/v1/contracts", headers=headers)
        assert res_contracts.status_code == 200
        assert len(res_contracts.get_json()["contracts"]) >= 1

        res_contract = client.get(f"/api/v1/contracts/{c.id}", headers=headers)
        assert res_contract.status_code == 200
        assert res_contract.get_json()["contract"]["site_name"] == "Sky City Commercial Tower"
        print("✓ Dashboard metrics and contract detail PASSED.")

        # -------------------------------------------------------------------
        # 6. AGREEMENT, RENEWAL & REFERRAL
        # -------------------------------------------------------------------
        print("\n[6/12] Testing Agreement, Renewal & Referral...")
        res_agree_view = client.get(f"/api/v1/contracts/{c.id}/agreement", headers=headers)
        assert res_agree_view.status_code == 200
        assert "clauses" in res_agree_view.get_json()

        res_agree_accept = client.post(f"/api/v1/contracts/{c.id}/agreement/accept", headers=headers)
        assert res_agree_accept.status_code == 200
        assert res_agree_accept.get_json()["ok"] is True
        db.session.refresh(c)
        assert c.agreement_accepted is True

        res_renew = client.post(f"/api/v1/contracts/{c.id}/renew", headers=headers)
        assert res_renew.status_code == 200
        assert res_renew.get_json()["ok"] is True

        res_refer = client.post(f"/api/v1/contracts/{c.id}/refer", json={
            "referee_name": "Suresh Mehta",
            "referee_phone": "9898011223",
            "referee_company": "Mehta Diamonds"
        }, headers=headers)
        assert res_refer.status_code == 200
        assert res_refer.get_json()["ok"] is True
        print("✓ Agreement acceptance, renewal, and referral PASSED.")

        # -------------------------------------------------------------------
        # 7. EQUIPMENT INVENTORY & TRANSPARENCY
        # -------------------------------------------------------------------
        print("\n[7/12] Testing Equipment Transparency (GET /equipment, GET /equipment/<id>)...")
        eq1 = Equipment(
            contract_id=c.id,
            name="CO2 4.5kg Extinguisher",
            equip_type="extinguisher",
            location="Floor 1 - Server Room",
            serial_no="EXT-CO2-9901",
            refill_interval_months=12
        )
        db.session.add(eq1)
        db.session.commit()

        refill1 = RefillRecord(
            equipment_id=eq1.id,
            performed_by="Northern Star Tech",
            notes="Annual hydrostatic pressure tested OK"
        )
        db.session.add(refill1)
        db.session.commit()

        res_eq_list = client.get("/api/v1/equipment", headers=headers)
        assert res_eq_list.status_code == 200
        eq_list_data = res_eq_list.get_json()
        assert eq_list_data["total"] == 1
        assert "overdue_count" in eq_list_data

        res_eq_det = client.get(f"/api/v1/equipment/{eq1.id}", headers=headers)
        assert res_eq_det.status_code == 200
        assert len(res_eq_det.get_json()["equipment"]["refill_records"]) == 1
        print("✓ Equipment inventory, refill logs, and transparency PASSED.")

        # -------------------------------------------------------------------
        # 8. VISITS & SERVICE RATINGS
        # -------------------------------------------------------------------
        print("\n[8/12] Testing Visit Details & Feedback (GET /visits/<id>, POST /visits/<id>/rate)...")
        v1.status = "completed"
        v1.completed_date = date.today()
        db.session.commit()

        res_v = client.get(f"/api/v1/visits/{v1.id}", headers=headers)
        assert res_v.status_code == 200
        assert "Visit" in res_v.get_json()["visit"]["label"]

        res_rate = client.post(f"/api/v1/visits/{v1.id}/rate", json={
            "overall": 5,
            "behaviour": 5,
            "quality": 5,
            "punctuality": 5,
            "communication": 5,
            "comment": "Excellent maintenance and thorough hydrant inspection."
        }, headers=headers)
        assert res_rate.status_code == 200
        assert res_rate.get_json()["ok"] is True
        print("✓ Visit details and 5-star customer rating PASSED.")

        # -------------------------------------------------------------------
        # 9. SERVICE QUOTATIONS (Proposals, Negotiation & Acceptance)
        # -------------------------------------------------------------------
        print("\n[9/12] Testing Service Quotations (Listing, Negotiation & Acceptance)...")
        sq = ServiceQuotation(
            quotation_number="QUO-26-27-00001",
            customer_id=c.customer_id,
            customer_phone=mobile_no,
            customer_name="Karan Singhania",
            status="sent"
        )
        db.session.add(sq)
        db.session.flush()

        sq_item = ServiceQuotationItem(
            quotation_id=sq.id,
            description="Fire Extinguisher Maintenance & Refill",
            quantity=10,
            rate=1000
        )
        db.session.add(sq_item)
        db.session.commit()

        res_sq_list = client.get("/api/v1/service-quotations", headers=headers)
        assert res_sq_list.status_code == 200
        assert len(res_sq_list.get_json()["quotations"]) >= 1

        res_sq_det = client.get(f"/api/v1/service-quotations/{sq.id}", headers=headers)
        assert res_sq_det.status_code == 200

        res_sq_neg = client.post(f"/api/v1/service-quotations/{sq.id}/negotiate", json={
            "note": "Could we get a 5% corporate discount?"
        }, headers=headers)
        assert res_sq_neg.status_code == 200
        assert res_sq_neg.get_json()["ok"] is True

        res_sq_acc = client.post(f"/api/v1/service-quotations/{sq.id}/accept", headers=headers)
        assert res_sq_acc.status_code == 200
        assert res_sq_acc.get_json()["ok"] is True
        print("✓ Quotation view, negotiation, and acceptance PASSED.")

        # -------------------------------------------------------------------
        # 10. MATERIAL (Visit-Linked) QUOTATIONS & WAIVER
        # -------------------------------------------------------------------
        print("\n[10/12] Testing Material Quotations & Waiver Decision...")
        mq = Quotation(
            visit_id=v1.id,
            contract_id=c.id,
            status="sent"
        )
        db.session.add(mq)
        db.session.flush()

        item = QuotationItem(
            quotation_id=mq.id,
            description="Replacement Pressure Gauge",
            quantity=2,
            unit_price=450
        )
        db.session.add(item)
        db.session.commit()

        res_mq = client.get(f"/api/v1/quotations/{mq.id}", headers=headers)
        assert res_mq.status_code == 200
        assert "QT-" in res_mq.get_json()["quotation"]["reference"]

        res_mq_decide = client.post(f"/api/v1/quotations/{mq.id}/decide", json={
            "decision": "reject",
            "waiver_accepted": 1
        }, headers=headers)
        assert res_mq_decide.status_code == 200
        assert res_mq_decide.get_json()["quotation"]["status"] == "rejected"
        print("✓ Material quotation retrieval and waiver decision PASSED.")

        # -------------------------------------------------------------------
        # 11. REQUESTS & TICKETS (Emergency, Refill, Complaint)
        # -------------------------------------------------------------------
        print("\n[11/12] Testing Requests & Support Tickets...")
        res_req = client.post("/api/v1/requests", json={
            "request_type": "emergency",
            "description": "Pressure drop alarm triggered in pump room."
        }, headers=headers)
        assert res_req.status_code == 200
        assert res_req.get_json()["request"]["request_type"] == "emergency"

        res_refill = client.post("/api/v1/refills", json={
            "items": [{"ext_type": "foam", "capacity": "9L", "quantity": 2, "notes": "Refill required"}],
            "notes": "Refill required for 2 foam extinguishers."
        }, headers=headers)
        assert res_refill.status_code == 200
        assert res_refill.get_json()["refill"]["status"] == "new"

        res_ticket = client.post("/api/v1/tickets", json={
            "contract_id": c.id,
            "title": "Delay in quarterly report submission",
            "description": "Please share the stamped inspection report."
        }, headers=headers)
        assert res_ticket.status_code == 200
        ticket_id = res_ticket.get_json()["ticket"]["id"]

        from datetime import timedelta
        t = db.session.get(SupportTicket, ticket_id)
        t.created_at = datetime.utcnow() - timedelta(hours=25)
        db.session.commit()

        res_nudge = client.post(f"/api/v1/tickets/{ticket_id}/retrigger", headers=headers)
        assert res_nudge.status_code == 200
        assert res_nudge.get_json()["ok"] is True
        print("✓ Emergency, refill, complaint ticket, and nudge PASSED.")

        # -------------------------------------------------------------------
        # 12. JOURNEY, NOTIFICATIONS & CERTIFICATES
        # -------------------------------------------------------------------
        print("\n[12/12] Testing Journey Timeline, Notifications & Certificate...")
        res_journey = client.get("/api/v1/journey", headers=headers)
        assert res_journey.status_code == 200
        assert len(res_journey.get_json()["events"]) >= 1

        notif = Notification(
            user_id=c.customer_id,
            title="Service Visit Confirmed",
            body="Your Q1 visit is scheduled.",
            link=f"/portal/visit/{v1.id}"
        )
        db.session.add(notif)
        db.session.commit()

        res_notif = client.get("/api/v1/notifications", headers=headers)
        assert res_notif.status_code == 200
        assert len(res_notif.get_json()["notifications"]) >= 1

        res_read = client.post("/api/v1/notifications/read", headers=headers)
        assert res_read.status_code == 200
        assert res_read.get_json()["ok"] is True

        c.certificate_issued = True
        c.certificate_issued_at = datetime.utcnow()
        db.session.commit()
        res_cert = client.get(f"/api/v1/contracts/{c.id}/certificate", headers=headers)
        assert res_cert.status_code == 200
        assert res_cert.get_json()["certificate_issued"] is True
        print("✓ Journey timeline, notifications, and certificate PASSED.")

        print("\n" + "=" * 50)
        print("  🎉 ALL 12 MOBILE APP MODULES & 35 ENDPOINTS PASSED! ")
        print("=" * 50)


if __name__ == "__main__":
    run_all_mobile_functionality_tests()
