import os
import sys

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
from nse.models import User, OtpCode

def test_unified_login_and_staff_auth():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        client = app.test_client()

        # 1. Create seed staff users
        admin = User(name="Ops Admin", email="admin@northernstar.example", phone="9825000001", role="admin")
        admin.set_password("password123")

        manager = User(name="Ops Manager", email="manager@northernstar.example", phone="9825000002", role="manager")
        manager.set_password("password123")

        tech = User(name="Ravi Technician", email="tech@northernstar.example", phone="9825000004", role="technician")
        tech.set_password("password123")

        cust = User(name="Test Customer", email="cust@example.com", phone="9876543210", role="customer")
        
        db.session.add_all([admin, manager, tech, cust])
        db.session.commit()

        print("[Test 1] Testing Web /auth/check-phone endpoint...")
        # Check customer number
        res = client.post("/auth/check-phone", json={"phone": "9876543210"})
        assert res.status_code == 200
        assert res.get_json()["is_staff"] is False
        print("  ✓ Customer phone correctly identified as non-staff.")

        # Check staff number
        res = client.post("/auth/check-phone", json={"phone": "9825000001"})
        assert res.status_code == 200
        data = res.get_json()
        assert data["is_staff"] is True
        assert data["role"] == "admin"
        assert data["name"] == "Ops Admin"
        print("  ✓ Staff phone correctly identified as staff (Ops Admin, admin).")

        print("\n[Test 2] Testing Web staff login via phone + password...")
        # Bad password
        res = client.post("/auth/staff-login", data={"phone": "9825000001", "password": "wrong"})
        assert res.status_code == 302
        assert "/auth/login" in res.headers["Location"]
        print("  ✓ Incorrect password correctly rejected.")

        # Good password
        res = client.post("/auth/staff-login", data={"phone": "9825000001", "password": "password123"}, follow_redirects=True)
        assert res.status_code == 200
        print("  ✓ Staff logged in successfully with phone + password123.")

        print("\n[Test 3] Testing API /api/v1/auth/check-phone & /api/v1/auth/otp/request...")
        # Staff requestOtp intercept
        res = client.post("/api/v1/auth/otp/request", json={"phone": "9825000004"})
        assert res.status_code == 200
        data = res.get_json()
        assert data["is_staff"] is True
        assert data["name"] == "Ravi Technician"
        print("  ✓ API otp/request recognizes staff and returns is_staff=True.")

        # Customer requestOtp
        res = client.post("/api/v1/auth/otp/request", json={"phone": "9876543210"})
        assert res.status_code == 200
        data = res.get_json()
        assert data["is_staff"] is False
        assert "dev_code" in data
        print("  ✓ API otp/request sends OTP for customer.")

        print("\n[Test 4] Testing API /api/v1/auth/staff-login...")
        res = client.post("/api/v1/auth/staff-login", json={"phone": "9825000004", "password": "password123"})
        assert res.status_code == 200
        data = res.get_json()
        assert "token" in data
        assert data["is_staff"] is True
        assert data["user"]["role"] == "technician"
        staff_token = data["token"]
        print("  ✓ Technician logged in via mobile API with password123.")

        # Test /me with staff token
        res = client.get("/api/v1/me", headers={"Authorization": f"Bearer {staff_token}"})
        assert res.status_code == 200
        assert res.get_json()["user"]["name"] == "Ravi Technician"
        print("  ✓ /me endpoint successfully returned technician profile.")

        print("\n[Test 5] Testing Staff Forgot Password Flow (API & Web)...")
        # 1. Request reset OTP
        res = client.post("/api/v1/auth/forgot-password/request", json={"phone": "9825000002"})
        assert res.status_code == 200
        data = res.get_json()
        dev_code = data["dev_code"]
        assert dev_code is not None
        print("  ✓ Password reset OTP requested for Ops Manager.")

        # 2. Reset password to newpass456
        res = client.post("/api/v1/auth/forgot-password/reset", json={
            "phone": "9825000002",
            "code": dev_code,
            "new_password": "newpass456"
        })
        assert res.status_code == 200
        print("  ✓ Password successfully reset to newpass456.")

        # 3. Old password should fail
        res = client.post("/api/v1/auth/staff-login", json={"phone": "9825000002", "password": "password123"})
        assert res.status_code == 401
        print("  ✓ Old password correctly rejected after reset.")

        # 4. New password should succeed
        res = client.post("/api/v1/auth/staff-login", json={"phone": "9825000002", "password": "newpass456"})
        assert res.status_code == 200
        print("  ✓ New password successfully verified.")

        # Reset back to password123
        manager.set_password("password123")
        db.session.commit()

        print("\n" + "=" * 50)
        print("🎉 ALL UNIFIED LOGIN & STAFF AUTH TESTS PASSED!")
        print("=" * 50)

if __name__ == "__main__":
    test_unified_login_and_staff_auth()
