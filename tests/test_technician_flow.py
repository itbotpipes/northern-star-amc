import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from datetime import date, timedelta
from nse import create_app
from nse.extensions import db
from nse.models import User, Contract, Enquiry, Visit, AMCPlan, ServiceQuotation

class TechnicianWorkflowTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.app.config["WTF_CSRF_ENABLED"] = False
        self.client = self.app.test_client()

    def test_technician_full_workflow(self):
        with self.app.app_context():
            # Find or create a technician
            tech = User.query.filter_by(role="technician").first()
            if not tech:
                tech = User(name="Ravi Tech", phone="9988776655", email="ravi@test.com", role="technician")
                tech.set_password("password123")
                db.session.add(tech)
                db.session.commit()

            # Find or create a customer
            cust = User.query.filter_by(role="customer").first()
            if not cust:
                cust = User(name="Test Customer", phone="9876543210", email="cust@test.com", role="customer")
                db.session.add(cust)
                db.session.commit()

            # Create an inquiry assigned to tech
            enq = Enquiry.query.filter_by(assigned_to_id=tech.id).first()
            if not enq:
                enq = Enquiry(
                    name=cust.name,
                    phone=cust.phone,
                    email=cust.email,
                    service_requirement="Fire Safety Inspection & AMC",
                    assigned_to_id=tech.id,
                    status="site_visit_scheduled",
                    visit_scheduled_date=date.today(),
                    visit_time_slot="Morning 10am-1pm"
                )
                db.session.add(enq)
                db.session.commit()

            # Create a contract lead assigned to tech
            lead = Contract.query.filter_by(inspection_technician_id=tech.id).first()
            if not lead:
                lead = Contract(
                    status="pending",
                    lead_stage="inspection_scheduled",
                    site_name="Test Complex",
                    applicant_name=cust.name,
                    applicant_phone=cust.phone,
                    customer_id=cust.id,
                    inspection_technician_id=tech.id,
                    inspection_scheduled_date=date.today()
                )
                db.session.add(lead)
                db.session.commit()

            tech_id = tech.id
            cust_id = cust.id
            enq_id = enq.id
            lead_id = lead.id

        # Log in as technician
        with self.client:
            with self.client.session_transaction() as sess:
                sess["_user_id"] = str(tech_id)
                sess["_fresh"] = True

            # 1. Test client portfolio (previously 403 Forbidden!)
            res = self.client.get(f"/ops/client/{cust_id}")
            self.assertEqual(res.status_code, 200, f"Expected 200 on /ops/client/{cust_id}, got {res.status_code}")
            print("PASS: /ops/client/<id> returned 200 for Technician")

            # 2. Test Day Plan
            res = self.client.get("/ops/day-plan")
            self.assertEqual(res.status_code, 200)
            self.assertIn(b"My Day Plan", res.data)
            print("PASS: /ops/day-plan returned 200 for Technician")

            # 3. Test Inquiries list
            res = self.client.get("/ops/enquiries")
            self.assertEqual(res.status_code, 200)
            print("PASS: /ops/enquiries returned 200 for Technician")

            # 4. Test Enquiry Detail
            res = self.client.get(f"/ops/enquiry/{enq_id}")
            self.assertEqual(res.status_code, 200)
            print("PASS: /ops/enquiry/<id> returned 200 for Technician")

            # 5. Test Enquiry Checklist
            res = self.client.get(f"/ops/enquiry/{enq_id}/checklist")
            self.assertEqual(res.status_code, 200)
            print("PASS: /ops/enquiry/<id>/checklist returned 200 for Technician")

            # 6. Test New Quotation (on-site material quotation)
            res = self.client.get(f"/ops/sq/new?inquiry_id={enq_id}")
            self.assertEqual(res.status_code, 200)
            print("PASS: /ops/sq/new returned 200 for Technician")

            # 7. Test Lead Detail
            res = self.client.get(f"/ops/lead/{lead_id}")
            self.assertEqual(res.status_code, 200)
            print("PASS: /ops/lead/<id> returned 200 for Technician")

            # 8. Test Health Report Form
            res = self.client.get(f"/ops/health-report/new?contract_id={lead_id}")
            self.assertEqual(res.status_code, 200)
            print("PASS: /ops/health-report/new returned 200 for Technician")

            # 9. Test Contracts list
            res = self.client.get("/ops/contracts")
            self.assertEqual(res.status_code, 200)
            print("PASS: /ops/contracts returned 200 for Technician")

if __name__ == "__main__":
    unittest.main()
