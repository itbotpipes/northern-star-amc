import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from nse import create_app, db
from nse.models import User, Contract, Visit, ServiceQuotation, ServiceRequest, RefillOrder

app = create_app()
app.config["TESTING"] = True
app.config["WTF_CSRF_ENABLED"] = False
client = app.test_client()

def test_unauthenticated_ops_access():
    # Unauthenticated visitor hitting /ops/client/27 should redirect to login (302), NOT 403 Forbidden
    res = client.get("/ops/client/27", follow_redirects=False)
    assert res.status_code == 302, f"Expected 302, got {res.status_code}"
    assert "/auth/login" in res.headers["Location"]
    print("PASS: test_unauthenticated_ops_access")

def test_customer_ops_access_redirect():
    # A customer hitting /ops/client/27 should be redirected to portal dashboard, NOT 403 Forbidden
    with app.app_context():
        customer = User.query.filter_by(role="customer").first()
        if not customer:
            customer = User(name="Test Customer", phone="9988776655", role="customer")
            db.session.add(customer)
            db.session.commit()
        customer_id = customer.id

    with client.session_transaction() as sess:
        sess["_user_id"] = str(customer_id)
        sess["_fresh"] = True

    res = client.get(f"/ops/client/{customer_id}", follow_redirects=False)
    assert res.status_code == 302, f"Expected 302, got {res.status_code}"
    assert res.headers["Location"].endswith("/portal/") or "/portal" in res.headers["Location"], f"Expected redirect to portal dashboard, got {res.headers['Location']}"
    print("PASS: test_customer_ops_access_redirect")

def test_technician_can_view_client_portfolio():
    # Staff / technician CAN access client portfolio
    with app.app_context():
        tech = User.query.filter_by(role="technician").first()
        customer = User.query.filter_by(role="customer").first()

    if tech and customer:
        with client.session_transaction() as sess:
            sess["_user_id"] = str(tech.id)
            sess["_fresh"] = True
        res = client.get(f"/ops/client/{customer.id}")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        assert b"Client Portfolio" in res.data or b"Portfolio" in res.data
        print("PASS: test_technician_can_view_client_portfolio")

def test_customer_quotations_list_and_segregation():
    # Customer can access their segregated quotations list
    with app.app_context():
        customer = User.query.filter_by(role="customer").first()
        customer_id = customer.id

    with client.session_transaction() as sess:
        sess["_user_id"] = str(customer_id)
        sess["_fresh"] = True

    # Main list
    res = client.get("/portal/service-quotations")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    assert b"My Quotations" in res.data
    assert b"New Enquiries &amp; AMC" in res.data or b"New Enquiries & AMC" in res.data
    assert b"Material &amp; Spares" in res.data or b"Material & Spares" in res.data
    assert b"Visits &amp; Service" in res.data or b"Visits & Service" in res.data

    # Segregated tabs
    for tab in ("all", "enquiries", "material", "visits"):
        res_tab = client.get(f"/portal/service-quotations?tab={tab}")
        assert res_tab.status_code == 200, f"Tab {tab} expected 200, got {res_tab.status_code}"
    print("PASS: test_customer_quotations_list_and_segregation")

def test_customer_can_download_quotation_pdf():
    # Customer owning a quote CAN download the PDF
    with app.app_context():
        customer = User.query.filter_by(role="customer").first()
        sq = ServiceQuotation.query.filter_by(customer_id=customer.id).first()
        if not sq:
            sq = ServiceQuotation(
                reference="NSE-TEST-001",
                customer_id=customer.id,
                customer_name=customer.name,
                customer_phone=customer.phone,
                service_type="amc",
                status="sent"
            )
            db.session.add(sq)
            db.session.commit()
        sq_id = sq.id

    with client.session_transaction() as sess:
        sess["_user_id"] = str(customer.id)
        sess["_fresh"] = True

    res = client.get(f"/portal/service-quotation/{sq_id}/pdf")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    assert res.content_type == "application/pdf"
    print("PASS: test_customer_can_download_quotation_pdf")

def test_customer_requests_list_shows_refills():
    # Customer requests list includes Refill Orders
    with app.app_context():
        customer = User.query.filter_by(role="customer").first()
        customer_id = customer.id

    with client.session_transaction() as sess:
        sess["_user_id"] = str(customer_id)
        sess["_fresh"] = True

    res = client.get("/portal/requests")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    assert b"Emergency &amp; NOC Requests" in res.data or b"Emergency & NOC Requests" in res.data
    assert b"Refill Orders" in res.data
    print("PASS: test_customer_requests_list_shows_refills")

if __name__ == "__main__":
    test_unauthenticated_ops_access()
    test_customer_ops_access_redirect()
    test_technician_can_view_client_portfolio()
    test_customer_quotations_list_and_segregation()
    test_customer_can_download_quotation_pdf()
    test_customer_requests_list_shows_refills()
    print("\nALL CUSTOMER PORTAL & ACCESS CONTROL TESTS PASSED SUCCESSFULLY!")
