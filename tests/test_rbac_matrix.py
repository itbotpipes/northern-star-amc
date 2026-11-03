import os
import sys

# Ensure App_AMC root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from datetime import datetime, date
from flask import url_for

from nse import create_app
from nse.extensions import db
from nse.models import User, Contract, Visit, Enquiry, Broadcast, ServiceQuotation


class TestRBACMatrix(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config["TESTING"] = True
        cls.app.config["WTF_CSRF_ENABLED"] = False

    def setUp(self):
        self.ctx = self.app.app_context()
        self.ctx.push()
        self.client = self.app.test_client()

        # 1. Customer
        self.customer = User.query.filter_by(phone="9999900001").first()
        if not self.customer:
            self.customer = User(
                role="customer",
                phone="9999900001",
                name="Test Customer",
                email="matrix_cust@example.com"
            )
            db.session.add(self.customer)
            db.session.commit()

        # 2. Technician
        self.technician = User.query.filter_by(phone="9999900002").first()
        if not self.technician:
            self.technician = User(
                role="technician",
                email="tech_matrix@example.com",
                phone="9999900002",
                name="Test Technician"
            )
            db.session.add(self.technician)
        self.technician.set_password("TechPass123!")

        # 3. Manager
        self.manager = User.query.filter_by(email="manager@northernstar.example").first()
        if not self.manager:
            self.manager = User(
                role="manager",
                email="manager@northernstar.example",
                name="Test Manager"
            )
            db.session.add(self.manager)
        self.manager.set_password("ManagerPass123!")

        # 4. Admin
        self.admin = User.query.filter_by(email="admin@northernstar.example").first()
        if not self.admin:
            self.admin = User(
                role="admin",
                email="admin@northernstar.example",
                name="Test Admin"
            )
            db.session.add(self.admin)
        self.admin.set_password("AdminPass123!")

        # 5. Owner
        self.owner = User.query.filter_by(email="owner@northernstar.example").first()
        if not self.owner:
            self.owner = User(
                role="owner",
                email="owner@northernstar.example",
                name="Test Owner"
            )
            db.session.add(self.owner)
        self.owner.set_password("OwnerPass123!")

        db.session.commit()

    def tearDown(self):
        self.ctx.pop()

    def login_user(self, user):
        """Helper to simulate logging in a specific user in test client session."""
        with self.client.session_transaction() as sess:
            sess["_user_id"] = str(user.id)
            sess["_fresh"] = True

    def logout_user(self):
        with self.client.session_transaction() as sess:
            sess.clear()

    # -------------------------------------------------------------------------
    # 1. Login Matrix Tests
    # -------------------------------------------------------------------------
    def test_login_matrix(self):
        # Customer cannot log in via staff email/password
        res = self.client.post("/auth/staff", data={"email": "matrix_cust@example.com", "password": "wrong"})
        self.assertIn(res.status_code, (200, 302))
        
        # Staff cannot request OTP on customer login
        res = self.client.post("/auth/otp/request", data={"phone": self.technician.phone}, follow_redirects=False)
        self.assertEqual(res.status_code, 302)
        self.assertIn("tab=staff", res.headers.get("Location", ""))

        # Staff can log in with email/password
        res = self.client.post("/auth/staff", data={"email": self.technician.email, "password": "TechPass123!"}, follow_redirects=False)
        self.assertEqual(res.status_code, 302)
        self.assertIn("/ops/my-plan", res.headers.get("Location", ""))

    # -------------------------------------------------------------------------
    # 2. Customer Account & Portal
    # -------------------------------------------------------------------------
    def test_customer_account_access(self):
        # Customer can access portal dashboard
        self.login_user(self.customer)
        res = self.client.get("/portal/")
        self.assertEqual(res.status_code, 200)

        # Customer cannot access /ops/*
        res = self.client.get("/ops/my-plan")
        self.assertEqual(res.status_code, 403)
        res = self.client.get("/ops/contracts")
        self.assertEqual(res.status_code, 403)
        res = self.client.get("/ops/broadcasts")
        self.assertEqual(res.status_code, 403)

    def test_staff_visiting_portal_redirected(self):
        # Staff visiting /portal/ is redirected to their ops home
        self.login_user(self.technician)
        res = self.client.get("/portal/", follow_redirects=False)
        self.assertEqual(res.status_code, 302)
        self.assertIn("/ops/my-plan", res.headers.get("Location", ""))

    # -------------------------------------------------------------------------
    # 3. Technician Capabilities (Allowed vs Denied)
    # -------------------------------------------------------------------------
    def test_technician_capabilities(self):
        self.login_user(self.technician)

        # 3a. See visits / day plan -> YES
        res = self.client.get("/ops/my-plan")
        self.assertEqual(res.status_code, 200)
        res = self.client.get("/ops/calendar")
        self.assertEqual(res.status_code, 200)

        # 3b. Site Surveys & Health Reports -> YES
        res = self.client.get("/ops/surveys")
        self.assertEqual(res.status_code, 200)
        res = self.client.get("/ops/health-reports")
        self.assertEqual(res.status_code, 200)

        # 3c. Schedule inspections / assign tech -> DENIED (403)
        res = self.client.get("/ops/leads")
        self.assertEqual(res.status_code, 403)

        # 3d. Business decisions -> DENIED (403)
        res = self.client.get("/ops/lead/1/decide")
        self.assertEqual(res.status_code, 403)

        # 3e. Create / send / edit quotations -> DENIED (403)
        res = self.client.get("/ops/sq/")
        self.assertEqual(res.status_code, 403)
        res = self.client.get("/ops/sq/new")
        self.assertEqual(res.status_code, 403)

        # 3f. Activate contracts -> DENIED (403)
        res = self.client.get("/ops/contracts")
        self.assertEqual(res.status_code, 403)

        # 3g. Money / Confirm payments -> DENIED (403)
        res = self.client.get("/ops/financials")
        self.assertEqual(res.status_code, 403)
        res = self.client.get("/ops/reminders")
        self.assertEqual(res.status_code, 403)

        # 3h. WhatsApp broadcasts -> DENIED (403)
        res = self.client.get("/ops/broadcasts")
        self.assertEqual(res.status_code, 403)

        # 3i. Renewals, complaints, reports -> DENIED (403)
        res = self.client.get("/ops/renewals")
        self.assertEqual(res.status_code, 403)
        res = self.client.get("/ops/tickets")
        self.assertEqual(res.status_code, 403)
        res = self.client.get("/ops/analytics")
        self.assertEqual(res.status_code, 403)
        res = self.client.get("/ops/insights")
        self.assertEqual(res.status_code, 403)

    # -------------------------------------------------------------------------
    # 4. Manager Capabilities (Allowed vs Denied)
    # -------------------------------------------------------------------------
    def test_manager_capabilities(self):
        self.login_user(self.manager)

        # 4a. See visits / day plan -> YES
        res = self.client.get("/ops/my-plan")
        self.assertEqual(res.status_code, 200)
        res = self.client.get("/ops/calendar")
        self.assertEqual(res.status_code, 200)

        # 4b. Surveys & Health reports -> YES
        res = self.client.get("/ops/surveys")
        self.assertEqual(res.status_code, 200)
        res = self.client.get("/ops/health-reports")
        self.assertEqual(res.status_code, 200)

        # 4c. Schedule inspections / leads -> YES
        res = self.client.get("/ops/leads")
        self.assertEqual(res.status_code, 200)
        res = self.client.get("/ops/enquiries")
        self.assertEqual(res.status_code, 200)

        # 4d. Create / send / edit quotations -> YES
        res = self.client.get("/ops/sq/")
        self.assertEqual(res.status_code, 200)
        res = self.client.get("/ops/sq/new")
        self.assertEqual(res.status_code, 200)

        # 4e. Activate contracts / view contracts -> YES
        res = self.client.get("/ops/contracts")
        self.assertEqual(res.status_code, 200)

        # 4f. Money: confirm payments, reminders -> YES
        res = self.client.get("/ops/financials")
        self.assertEqual(res.status_code, 200)
        res = self.client.get("/ops/reminders")
        self.assertEqual(res.status_code, 200)

        # 4g. Renewals, complaints, reports -> YES
        res = self.client.get("/ops/renewals")
        self.assertEqual(res.status_code, 200)
        res = self.client.get("/ops/tickets")
        self.assertEqual(res.status_code, 200)
        res = self.client.get("/ops/analytics")
        self.assertEqual(res.status_code, 200)
        res = self.client.get("/ops/insights")
        self.assertEqual(res.status_code, 200)

        # 4h. WhatsApp Broadcasts -> DENIED (Owner / Admin ONLY!)
        res = self.client.get("/ops/broadcasts")
        self.assertEqual(res.status_code, 403)
        res = self.client.post("/ops/broadcast/new", data={"title": "Promo", "body": "Hello"})
        self.assertEqual(res.status_code, 403)

    # -------------------------------------------------------------------------
    # 5. Owner / Admin Capabilities (ALL ALLOWED)
    # -------------------------------------------------------------------------
    def test_admin_and_owner_capabilities(self):
        for user in (self.admin, self.owner):
            self.login_user(user)

            # All Manager functions -> YES
            res = self.client.get("/ops/leads")
            self.assertEqual(res.status_code, 200)
            res = self.client.get("/ops/sq/")
            self.assertEqual(res.status_code, 200)
            res = self.client.get("/ops/contracts")
            self.assertEqual(res.status_code, 200)
            res = self.client.get("/ops/financials")
            self.assertEqual(res.status_code, 200)
            res = self.client.get("/ops/renewals")
            self.assertEqual(res.status_code, 200)
            res = self.client.get("/ops/tickets")
            self.assertEqual(res.status_code, 200)

            # WhatsApp Broadcasts -> YES
            res = self.client.get("/ops/broadcasts")
            self.assertEqual(res.status_code, 200)


if __name__ == "__main__":
    unittest.main()
