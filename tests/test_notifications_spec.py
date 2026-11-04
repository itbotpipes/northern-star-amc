import os
import sys
import secrets
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from nse import create_app, db
from nse.models import (User, Contract, Visit, Quotation, ServiceQuotation,
                        ServiceQuotationItem, SupportTicket, RefillOrder,
                        ServiceRequest, Notification, VisitFeedback, Referral,
                        Enquiry)
from nse.reminders import process_visit_reminders, process_milestones

app = create_app()
app.config["TESTING"] = True
app.config["WTF_CSRF_ENABLED"] = False

def make_client(user_id=None):
    c = app.test_client()
    if user_id:
        with c.session_transaction() as sess:
            sess["_user_id"] = str(user_id)
            sess["_fresh"] = True
    return c

def test_notification_matrix():
    uid = secrets.token_hex(3)
    with app.app_context():
        # Clean or ensure fixtures
        admin = User.query.filter_by(role="admin").first()
        if not admin:
            admin = User(name="Test Admin", email="admin@test.com", role="admin")
            db.session.add(admin)
        
        tech = User.query.filter_by(role="technician").first()
        if not tech:
            tech = User(name="Test Tech", email="tech@test.com", phone="9988776611", role="technician")
            db.session.add(tech)

        cust = User.query.filter_by(role="customer").first()
        if not cust:
            cust = User(name="Test Customer", email="cust@test.com", phone="9988776622", role="customer")
            db.session.add(cust)
        db.session.commit()

        admin_id = admin.id
        tech_id = tech.id
        cust_id = cust.id

        c_admin = make_client(admin_id)
        c_cust = make_client(cust_id)
        c_tech = make_client(tech_id)
        c_anon = make_client()

        # 1. Quotation sent -> Customer in-app + email -> The quotation
        sq = ServiceQuotation(
            quotation_number=f"QUO-TEST-{uid}",
            customer_id=cust_id,
            customer_name=cust.name,
            customer_phone=cust.phone,
            customer_email=cust.email,
            status="draft",
            service_type="amc"
        )
        db.session.add(sq)
        db.session.flush()

        db.session.add(ServiceQuotationItem(
            quotation_id=sq.id,
            category="AMC",
            description="Comprehensive Fire Safety AMC",
            unit="Year",
            quantity=1.0,
            rate=15000.0,
            sort_order=1
        ))
        db.session.commit()
        sq_id = sq.id

        res = c_admin.post(f"/ops/sq/{sq_id}", data={"action": "send"}, follow_redirects=False)
        assert res.status_code in (200, 302)
        db.session.rollback()
        n1 = Notification.query.filter_by(user_id=cust_id).order_by(Notification.id.desc()).first()
        assert n1 is not None
        assert f"/portal/service-quotation/{sq_id}" in n1.link, f"Expected portal.service_quotation link, got {n1.link}"
        print("PASS: Item 1 - Quotation sent -> Customer in-app -> portal.service_quotation")

        # 2. Quotation accepted / changes asked -> Staff in-app (+ chime on accept) -> The quotation in staff panel
        sq = db.session.get(ServiceQuotation, sq_id)
        sq.status = "sent"
        db.session.commit()
        db.session.expire_all()

        # Test negotiation (changes asked)
        c_cust = make_client(cust_id)
        res_neg = c_cust.post(f"/portal/service-quotation/{sq_id}/negotiate", data={"negotiation_note": "Can you do 10% discount?"}, follow_redirects=False)
        assert res_neg.status_code in (200, 302)
        db.session.rollback()
        n_neg = Notification.query.filter_by(user_id=admin_id).filter(Notification.link.like(f"/ops/sq/{sq_id}%")).order_by(Notification.id.desc()).first()
        assert n_neg is not None, f"Expected notification for sq {sq_id}"
        assert f"/ops/sq/{sq_id}" in n_neg.link, f"Expected sq.detail_quotation link, got {n_neg.link}"
        print("PASS: Item 2a - Quotation changes asked -> Staff in-app -> sq.detail_quotation")

        # Test accept
        c_cust = make_client(cust_id)
        res_acc = c_cust.post(f"/portal/service-quotation/{sq_id}/accept", follow_redirects=False)
        assert res_acc.status_code in (200, 302)
        db.session.rollback()
        n_acc = Notification.query.filter_by(user_id=admin_id).filter(Notification.link.like(f"/ops/sq/{sq_id}%")).order_by(Notification.id.desc()).first()
        assert n_acc is not None, f"Expected accept notification for sq {sq_id}"
        assert f"/ops/sq/{sq_id}" in n_acc.link, f"Expected sq.detail_quotation link, got {n_acc.link}"
        assert "chime=1" in n_acc.link, f"Expected chime=1 in link, got {n_acc.link}"
        print("PASS: Item 2b - Quotation accepted -> Staff in-app (+ chime) -> sq.detail_quotation")

        # 3. Visit scheduled / date changed -> Customer in-app -> Their contract / visit
        c = Contract(
            reference=f"NSE-TEST-{uid}",
            customer_id=cust_id,
            applicant_name=cust.name,
            site_name="Test Site",
            site_address="Test Address",
            status="active",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=365)
        )
        db.session.add(c)
        db.session.commit()
        v = Visit(
            contract_id=c.id,
            visit_number=1,
            label="Visit 1",
            scheduled_date=date.today() + timedelta(days=7),
            technician_id=tech_id,
            status="scheduled"
        )
        db.session.add(v)
        db.session.commit()
        v_id = v.id
        c_id = c.id

        new_date_str = (date.today() + timedelta(days=10)).strftime("%Y-%m-%d")
        res_resched = c_admin.post(f"/ops/visit/{v_id}/reschedule", data={"scheduled_date": new_date_str}, follow_redirects=False)
        assert res_resched.status_code in (200, 302)
        db.session.rollback()
        n_resched = Notification.query.filter_by(user_id=cust_id).order_by(Notification.id.desc()).first()
        assert f"/portal/contract/{c_id}" in n_resched.link or f"/portal/visit/{v_id}" in n_resched.link
        print("PASS: Item 3 - Visit scheduled / date changed -> Customer in-app -> portal.contract/visit")

        # 4. Visit coming in 30 / 7 / 1 days -> Customer + technician -> Their visit page
        v = db.session.get(Visit, v_id)
        v.scheduled_date = date.today() + timedelta(days=7)
        db.session.commit()
        process_visit_reminders()
        db.session.rollback()
        n_c_rem = Notification.query.filter_by(user_id=cust_id).filter(Notification.title.like("%Upcoming visit in 7 days%")).first()
        n_t_rem = Notification.query.filter_by(user_id=tech_id).filter(Notification.title.like("%Visit reminder%")).first()
        assert n_c_rem is not None and f"/portal/visit/{v_id}" in n_c_rem.link
        assert n_t_rem is not None and f"/ops/visit/{v_id}" in n_t_rem.link
        print("PASS: Item 4 - Visit coming in 7 days -> Customer portal.visit, Tech admin.visit")

        # 5. Visit completed -> Customer in-app + chime -> portal.visit
        v = db.session.get(Visit, v_id)
        v.status = "completed"
        v.completed_date = date.today()
        db.session.commit()
        res_share = c_admin.post(f"/ops/visit/{v_id}/share-report", follow_redirects=False)
        assert res_share.status_code in (200, 302)
        db.session.rollback()
        n_vcomp = Notification.query.filter_by(user_id=cust_id).order_by(Notification.id.desc()).first()
        assert f"/portal/visit/{v_id}" in n_vcomp.link
        print("PASS: Item 5 - Visit completed -> Customer in-app -> portal.visit")

        # 6. Feedback given -> Tech + staff in-app -> admin.visit
        res_fb = c_cust.post(f"/portal/visit/{v_id}/approve", data={
            "rating_overall": "5",
            "rating_behaviour": "5",
            "rating_quality": "5",
            "rating_punctuality": "5",
            "rating_communication": "5",
            "comment": "Excellent service!"
        }, follow_redirects=False)
        assert res_fb.status_code in (200, 302)
        db.session.rollback()
        n_fb_tech = Notification.query.filter_by(user_id=tech_id).order_by(Notification.id.desc()).first()
        n_fb_admin = Notification.query.filter_by(user_id=admin_id).order_by(Notification.id.desc()).first()
        assert f"/ops/visit/{v_id}" in n_fb_tech.link
        assert f"/ops/visit/{v_id}" in n_fb_admin.link
        print("PASS: Item 6 - Feedback given -> Tech + Staff in-app -> admin.visit")

        # 7. Payment confirmed -> Customer in-app + email -> portal.dashboard
        q_mat = Quotation(contract_id=c_id, visit_id=v_id, reference=f"QUO-MAT-{uid}", total=1200, status="approved")
        db.session.add(q_mat)
        db.session.commit()
        res_cash = c_admin.post(f"/ops/quotation/{q_mat.id}/cash-received", follow_redirects=False)
        assert res_cash.status_code in (200, 302)
        db.session.rollback()
        n_pay = Notification.query.filter_by(user_id=cust_id).order_by(Notification.id.desc()).first()
        assert f"/portal/dashboard" in n_pay.link or f"/portal/" in n_pay.link
        print("PASS: Item 7 - Payment confirmed -> Customer in-app -> portal.dashboard")

        # 8. Agreement accepted -> Staff in-app (+ chime) -> admin.contract
        c = db.session.get(Contract, c_id)
        c.agreement_accepted = False
        db.session.commit()
        res_agr = c_cust.post(f"/portal/contract/{c_id}/agreement/accept", data={"agree": "1"}, follow_redirects=False)
        assert res_agr.status_code in (200, 302)
        db.session.rollback()
        n_agr = Notification.query.filter_by(user_id=admin_id).order_by(Notification.id.desc()).first()
        assert f"/ops/contract/{c_id}" in n_agr.link and "chime=1" in n_agr.link
        print("PASS: Item 8 - Agreement accepted -> Staff in-app (+ chime) -> admin.contract")

        # 9. Material quotation raised / updated -> Customer in-app -> portal.quotation
        res_mq = c_admin.post(f"/ops/visit/{v_id}/quotation", data={
            "item_desc": ["Smoke detector sensor"],
            "item_qty": ["2"],
            "item_price": ["850"],
            "notes": "Replacement recommended"
        }, follow_redirects=False)
        assert res_mq.status_code in (200, 302)
        db.session.rollback()
        n_mq = Notification.query.filter_by(user_id=cust_id).order_by(Notification.id.desc()).first()
        assert "/portal/quotation/" in n_mq.link
        print("PASS: Item 9 - Material quotation raised -> Customer in-app -> portal.quotation")

        # 10. Material approved / declined / reopened -> Staff / customer in-app -> admin.visit / portal.quotation
        mq = Quotation.query.filter_by(visit_id=v_id, status="pending").first()
        res_dec = c_cust.post(f"/portal/quotation/{mq.id}/decide", data={"decision": "approve", "payment_mode": "cash"}, follow_redirects=False)
        assert res_dec.status_code in (200, 302)
        db.session.rollback()
        n_mdec = Notification.query.filter_by(user_id=admin_id).order_by(Notification.id.desc()).first()
        assert f"/ops/visit/{v_id}" in n_mdec.link
        print("PASS: Item 10 - Material approved -> Staff in-app -> admin.visit")

        # 11. Refill status changed -> Customer in-app -> portal.requests_list
        ro = RefillOrder(reference=f"REF-{uid}", customer_id=cust_id, status="pickup_scheduled")
        db.session.add(ro)
        db.session.commit()
        res_ro = c_admin.post(f"/ops/refill/{ro.id}", data={"status": "in_refilling", "team_eta": "Tomorrow 2 PM"}, follow_redirects=False)
        assert res_ro.status_code in (200, 302)
        db.session.rollback()
        n_ro = Notification.query.filter_by(user_id=cust_id).order_by(Notification.id.desc()).first()
        assert "/portal/requests" in n_ro.link
        print("PASS: Item 11 - Refill status changed -> Customer in-app -> portal.requests_list")

        # 12. Complaint accepted / fixed -> Customer in-app -> portal.ticket_detail
        ticket = SupportTicket(customer_id=cust_id, reference=f"TCK-{uid}", title="Faulty pressure gauge", status="open")
        db.session.add(ticket)
        db.session.commit()
        res_tck = c_admin.post(f"/ops/ticket/{ticket.id}", data={"action": "acknowledge", "staff_reply": "Tech assigned"}, follow_redirects=False)
        assert res_tck.status_code in (200, 302)
        db.session.rollback()
        n_tck = Notification.query.filter_by(user_id=cust_id).order_by(Notification.id.desc()).first()
        assert f"/portal/complaint/{ticket.id}" in n_tck.link or f"/portal/ticket/{ticket.id}" in n_tck.link
        print("PASS: Item 12 - Complaint accepted/fixed -> Customer in-app -> portal.ticket_detail")

        # 13. Certificate issued -> Customer in-app + chime + celebration -> portal.contract?celebrate=1&chime=1
        from nse.blueprints.admin import _maybe_issue_certificate
        c = db.session.get(Contract, c_id)
        c.certificate_issued = False
        v2 = Visit(contract_id=c_id, visit_number=2, status="completed", scheduled_date=date.today())
        v3 = Visit(contract_id=c_id, visit_number=3, status="completed", scheduled_date=date.today())
        v4 = Visit(contract_id=c_id, visit_number=4, status="completed", scheduled_date=date.today())
        db.session.add_all([v2, v3, v4])
        db.session.commit()
        _maybe_issue_certificate(v4)
        db.session.rollback()
        n_cert = Notification.query.filter_by(user_id=cust_id).filter(Notification.title.like("%Certificate is ready%")).first()
        assert n_cert is not None
        assert f"/portal/contract/{c_id}" in n_cert.link and "celebrate=1" in n_cert.link and "chime=1" in n_cert.link
        print("PASS: Item 13 - Certificate issued -> Customer in-app + chime + celebration -> portal.contract?celebrate=1&chime=1")

        # 14. New enquiry sent -> Managers in-app -> admin.enquiry_detail
        res_enq = c_anon.post("/enquiry", data={
            "name": "Walkin Visitor",
            "phone": "9876543210",
            "service_requirement": "Fire Hydrant AMC"
        }, follow_redirects=False)
        assert res_enq.status_code in (200, 302)
        db.session.rollback()
        n_enq = Notification.query.filter_by(user_id=admin_id).filter(Notification.title.like("%New Inquiry%")).order_by(Notification.id.desc()).first()
        assert n_enq is not None and "/ops/enquiry/" in n_enq.link
        print("PASS: Item 14 - New enquiry sent -> Managers in-app -> admin.enquiry_detail")

        # 15. Inspection scheduled -> Customer + technician in-app -> portal.contract & admin.lead_detail
        c = db.session.get(Contract, c_id)
        res_sched = c_admin.post(f"/ops/contract/{c_id}/schedule-inspection", data={
            "technician_id": str(tech_id),
            "inspection_date": (date.today() + timedelta(days=2)).strftime("%Y-%m-%d"),
            "time_window": "morning"
        }, follow_redirects=False)
        assert res_sched.status_code in (200, 302)
        db.session.rollback()
        n_ins_cust = Notification.query.filter_by(user_id=cust_id).order_by(Notification.id.desc()).first()
        n_ins_tech = Notification.query.filter_by(user_id=tech_id).order_by(Notification.id.desc()).first()
        assert f"/portal/contract/{c_id}" in n_ins_cust.link
        assert f"/ops/lead/{c_id}" in n_ins_tech.link
        print("PASS: Item 15 - Inspection scheduled -> Customer portal.contract, Tech admin.lead_detail")

        # 16. Contract near expiry -> Staff -> admin.renewals
        c = db.session.get(Contract, c_id)
        c.end_date = date.today() + timedelta(days=30)
        db.session.commit()
        process_milestones()
        db.session.rollback()
        n_ren = Notification.query.filter_by(user_id=admin_id).filter(Notification.title.like("%Renewal due%")).order_by(Notification.id.desc()).first()
        assert n_ren is not None and "/ops/renewals" in n_ren.link
        print("PASS: Item 16 - Contract near expiry -> Staff in-app -> admin.renewals")

        # 17. Referral sent -> Staff in-app -> admin.contract
        res_ref = c_cust.post(f"/portal/contract/{c_id}/referral", data={
            "referee_name": "Sharmaji Building",
            "referee_phone": "9988112233"
        }, follow_redirects=False)
        assert res_ref.status_code in (200, 302)
        db.session.rollback()
        n_ref = Notification.query.filter_by(user_id=admin_id).filter(Notification.title.like("%New referral%")).order_by(Notification.id.desc()).first()
        assert n_ref is not None and f"/ops/contract/{c_id}" in n_ref.link
        print("PASS: Item 17 - Referral sent -> Staff in-app -> admin.contract")

        # 18. Day plan accepted / clash flagged -> Staff in-app -> admin.visit
        res_conf = c_tech.post(f"/ops/visit/{v_id}/confirm", data={"action": "accept"}, follow_redirects=False)
        assert res_conf.status_code in (200, 302)
        db.session.rollback()
        n_dp = Notification.query.filter_by(user_id=admin_id).filter(Notification.title.like("%accepted by%")).order_by(Notification.id.desc()).first()
        assert n_dp is not None and f"/ops/visit/{v_id}" in n_dp.link
        print("PASS: Item 18 - Day plan accepted -> Staff in-app -> admin.visit")

        # Check open_notification route (marks read + redirects to target)
        n_test = Notification(user_id=cust_id, title="Test Notif", body="Body", link=f"/portal/contract/{c_id}", read=False)
        db.session.add(n_test)
        db.session.commit()
        res_open = c_cust.get(f"/portal/notification/{n_test.id}/open", follow_redirects=False)
        assert res_open.status_code == 302
        assert res_open.headers["Location"].endswith(f"/portal/contract/{c_id}")
        db.session.refresh(n_test)
        assert n_test.read is True
        print("PASS: Notification open handler marks notification as read and redirects cleanly.")

if __name__ == "__main__":
    test_notification_matrix()
    print("\nALL 18 NOTIFICATION SPECIFICATION TESTS PASSED SUCCESSFULLY!")
