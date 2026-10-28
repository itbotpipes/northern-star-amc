"""
JSON REST API for the Northern Star mobile app.
=================================================

The rest of this project is server-rendered HTML (Jinja templates + Flask-Login
session cookies). A native mobile app cannot consume HTML pages — it needs JSON.
This blueprint is that layer: a thin, read-mostly JSON API that reuses the exact
same models the web portal uses, so there is a single source of truth.

Design choices (so the mobile dev can rely on them):
  * Prefix: everything lives under /api/v1 (version the URL, never break clients).
  * Auth: **stateless bearer tokens**, not session cookies. A mobile app stores a
    token in secure storage and sends `Authorization: Bearer <token>` on every
    request. We sign the token with the app SECRET_KEY via itsdangerous (already a
    dependency — no new package, no DB table). Tokens carry {uid, role} and expire
    in 30 days.
  * Scope of THIS module: the Customer Portal — OTP login + contracts. Emergency,
    refills, quotations, tickets etc. follow the exact same pattern; add them as
    more routes here.
  * Every response is JSON. Errors are `{"error": "..."}` with a real HTTP status.

To wire it up it is registered in nse/__init__.py:  app.register_blueprint(api_bp)
"""

from datetime import date, datetime, timedelta
from functools import wraps

from flask import Blueprint, request, jsonify, current_app, g, url_for
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from ..extensions import db
from ..models import (
    User, Contract, Visit, ServiceRequest, Notification,
    ServiceQuotation, Quotation, QuotationItem, SupportTicket, VisitFeedback,
    CustomerJourneyEvent, Referral, RefillOrder, RefillItem, AMCPlan,
    Equipment, VisitDefect, VisitChecklistItem, VisitPhoto, InventoryItem,
    Enquiry, InquiryChecklistItem, InquiryPhoto, InquiryHistory,
)
from ..utils import (
    generate_otp, verify_otp, notify, notify_staff, notify_team_leaders,
    WAIVER_TEXT, AMC_AGREEMENT_VERSION, save_upload, upload_url,
)

api_bp = Blueprint("api", __name__, url_prefix="/api/v1")

TOKEN_MAX_AGE = 60 * 60 * 24 * 30   # 30 days, in seconds


# --------------------------------------------------------------------------- #
# Token auth (stateless — signed with SECRET_KEY, no DB session table)
# --------------------------------------------------------------------------- #
def _serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="mobile-api-token")


def issue_token(user):
    """Mint a signed bearer token for a logged-in user."""
    return _serializer().dumps({"uid": user.id, "role": user.role})


def _user_from_token(token):
    try:
        data = _serializer().loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    return db.session.get(User, data.get("uid"))


def token_required(fn):
    """Gate a route on a valid bearer token; exposes the user as g.current_user."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        token = header[7:].strip() if header.lower().startswith("bearer ") else None
        user = _user_from_token(token) if token else None
        if not user:
            return jsonify(error="Not authenticated. Send a valid Bearer token."), 401
        g.current_user = user
        return fn(*args, **kwargs)
    return wrapper


def customer_only(fn):
    """token_required + must be a customer (staff use the web ops console)."""
    @wraps(fn)
    @token_required
    def wrapper(*args, **kwargs):
        if g.current_user.role != "customer":
            return jsonify(error="This endpoint is for customer accounts."), 403
        return fn(*args, **kwargs)
    return wrapper


def technician_only(fn):
    """token_required + must be staff (technician/admin/manager) — the Technician App."""
    @wraps(fn)
    @token_required
    def wrapper(*args, **kwargs):
        if not g.current_user.is_staff:
            return jsonify(error="This endpoint is for staff accounts."), 403
        return fn(*args, **kwargs)
    return wrapper


# --------------------------------------------------------------------------- #
# CORS — native apps don't enforce CORS, but Expo web preview + browsers do.
# Kept dependency-free (no flask-cors) and scoped to this blueprint only.
# --------------------------------------------------------------------------- #
@api_bp.after_request
def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return resp


@api_bp.route("/<path:_any>", methods=["OPTIONS"])
@api_bp.route("/", methods=["OPTIONS"])
def _preflight(_any=None):
    return ("", 204)


# --------------------------------------------------------------------------- #
# Serializers — turn models into plain JSON dicts. These mirror what the web
# portal templates already display, so the mobile app shows the same data.
# --------------------------------------------------------------------------- #
def _d(dt):
    """Date / datetime -> ISO string (or None)."""
    if not dt:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    return dt.isoformat()


def user_json(u):
    return {
        "id": u.id,
        "name": u.name,
        "phone": u.phone,
        "email": u.email,
        "role": u.role,
        "area": u.area,
        "city": u.city,
        "address": u.address,
        "company_name": u.company_name,
        "gst_number": u.gst_number,
    }


def visit_json(v):
    fb = v.feedback
    return {
        "id": v.id,
        "label": v.label,
        "visit_number": v.visit_number,
        "status": v.status,
        "scheduled_date": _d(v.scheduled_date),
        "completed_date": _d(v.completed_date),
        "days_until": v.days_until,
        "work_done": v.work_done,
        "technician": v.technician.name if v.technician else None,
        "has_report": bool(v.service_report_path),
        "customer_approved": v.customer_approved,
        "rated": bool(fb and getattr(fb, "is_submitted", False)),
        "checklist_summary": v.checklist_summary,
        "onsite_duration": v.onsite_duration_label,
    }


def contract_json(c, full=False):
    grade, grade_color = c.safety_grade
    data = {
        "id": c.id,
        "reference": c.reference,
        "status": c.status,
        "site_name": c.site_name,
        "site_address": c.site_address,
        "area": c.area,
        "plan": c.plan.name if c.plan else None,
        "start_date": _d(c.start_date),
        "end_date": _d(c.end_date),
        "days_to_expiry": c.days_to_expiry,
        "price": c.price,
        "payment_status": c.payment_status,
        "total_visits": c.total_visits,
        "completed_visits": c.completed_visits,
        "safety_score": c.safety_score,
        "safety_grade": grade,
        "safety_grade_color": grade_color,
        "agreement_accepted": c.agreement_accepted,
        "certificate_issued": bool(getattr(c, "certificate_issued", False)),
        "certificate_issued_at": _d(getattr(c, "certificate_issued_at", None)),
        "next_visit": visit_json(c.next_visit) if c.next_visit else None,
    }
    if full:
        data["visits"] = [visit_json(v) for v in
                          sorted(c.visits, key=lambda v: v.visit_number)]
        data["workflow_steps"] = c.workflow_steps
    return data


def notification_json(n):
    return {
        "id": n.id,
        "title": n.title,
        "body": n.body,
        "link": getattr(n, "link", None),
        "read": n.read,
        "created_at": _d(n.created_at),
    }


# --------------------------------------------------------------------------- #
# Auth — phone OTP (mirrors auth.py, but returns a token instead of a session)
# --------------------------------------------------------------------------- #
@api_bp.route("/auth/otp/request", methods=["POST"])
def otp_request():
    body = request.get_json(silent=True) or {}
    phone = (body.get("phone") or "").strip()
    if len(phone) < 8:
        return jsonify(error="Please enter a valid phone number."), 400
    code = generate_otp(phone)
    # Dev flow: return the code so the app can auto-fill it (no SMS gateway yet).
    # In production, wire generate_otp() to an SMS provider and stop returning it.
    resp = {"ok": True, "message": "OTP sent."}
    if current_app.debug or not current_app.config.get("SMS_ENABLED"):
        resp["dev_code"] = code
    return jsonify(resp)


@api_bp.route("/auth/otp/verify", methods=["POST"])
def otp_verify():
    body = request.get_json(silent=True) or {}
    phone = (body.get("phone") or "").strip()
    code = (body.get("code") or "").strip()
    name = (body.get("name") or "").strip()
    if not phone or not verify_otp(phone, code):
        return jsonify(error="Invalid or expired OTP."), 401

    user = User.query.filter_by(phone=phone, role="customer").first()
    if not user:
        user = User(role="customer", phone=phone,
                    name=name or f"Customer {phone[-4:]}")
        db.session.add(user)
        db.session.commit()
    elif name and user.name.startswith("Customer "):
        user.name = name
        db.session.commit()

    return jsonify(token=issue_token(user), user=user_json(user))


@api_bp.route("/auth/staff-login", methods=["POST"])
def staff_login_api():
    """Technician App login — mirrors auth.staff_login but returns a token."""
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if not user or not user.is_staff or not user.check_password(password):
        return jsonify(error="Invalid staff credentials."), 401
    return jsonify(token=issue_token(user), user=user_json(user))


# --------------------------------------------------------------------------- #
# Customer resources
# --------------------------------------------------------------------------- #
@api_bp.route("/me")
@customer_only
def me():
    return jsonify(user=user_json(g.current_user))


@api_bp.route("/contracts")
@customer_only
def contracts():
    rows = (Contract.query
            .filter_by(customer_id=g.current_user.id)
            .order_by(Contract.created_at.desc()).all())
    return jsonify(contracts=[contract_json(c) for c in rows])


@api_bp.route("/contracts/<int:contract_id>")
@customer_only
def contract_detail(contract_id):
    c = db.session.get(Contract, contract_id)
    if not c or c.customer_id != g.current_user.id:
        return jsonify(error="Contract not found."), 404
    return jsonify(contract=contract_json(c, full=True))


@api_bp.route("/contracts/<int:contract_id>/certificate")
@customer_only
def contract_certificate(contract_id):
    c = db.session.get(Contract, contract_id)
    if not c or c.customer_id != g.current_user.id:
        return jsonify(error="Contract not found."), 404
    cert_no = f"NSE-CERT-{c.id:04d}"
    return jsonify(
        contract_id=c.id,
        contract_ref=c.reference,
        site_name=c.site_name,
        certificate_no=cert_no,
        certificate_issued=bool(c.certificate_issued),
        certificate_issued_at=_d(c.certificate_issued_at),
        plan_name=c.plan_name,
        client_name=g.current_user.name,
        client_address=c.building_name or g.current_user.address or c.city or "Surat, Gujarat",
        standards=["NBC (National Building Code)", "BIS Compliance", "IS Fire Safety Standards", "NFPA Guidelines"],
        completed_visits=c.completed_visits,
        total_visits=c.total_visits,
        download_url=f"/portal/contract/{c.id}/certificate"
    )


@api_bp.route("/notifications")
@customer_only
def notifications():
    rows = (Notification.query
            .filter_by(user_id=g.current_user.id)
            .order_by(Notification.created_at.desc()).limit(50).all())
    unread = sum(1 for n in rows if not n.read)
    return jsonify(unread=unread,
                   notifications=[notification_json(n) for n in rows])


@api_bp.route("/health")
def health():
    """Unauthenticated ping so the app can check connectivity."""
    return jsonify(ok=True, service="nse-mobile-api", time=_d(datetime.utcnow()))


# =========================================================================== #
#  MODULE 2+  — full customer portal parity (added for the React Native app)
#  Everything below reuses the same models the web portal (portal.py) uses, so
#  the mobile app and the website stay a single source of truth.
# =========================================================================== #

# --------------------------------------------------------------------------- #
# Extra serializers
# --------------------------------------------------------------------------- #
def sq_item_json(i):
    return {
        "id": i.id, "category": i.category, "description": i.description,
        "unit": i.unit, "quantity": i.quantity, "rate": i.rate, "total": i.total,
    }


def service_quote_json(sq, full=False):
    data = {
        "id": sq.id,
        "reference": sq.reference,
        "service_type": sq.service_type,
        "status": sq.status,
        "status_label": sq.status_label,
        "project_name": sq.project_name,
        "customer_name": sq.customer_name,
        "subtotal": sq.subtotal,
        "gst_percent": sq.gst_percent,
        "gst_amount": sq.gst_amount,
        "grand_total": sq.grand_total,
        "payment_status": sq.payment_status,
        "is_paid": sq.is_paid,
        "valid_days": sq.valid_days,
        "created_at": _d(sq.created_at),
        "negotiation_note": sq.negotiation_note,
        "staff_response": sq.staff_response,
    }
    if full:
        data["items"] = [sq_item_json(i) for i in sq.items]
        data["notes"] = sq.notes
        data["customer_address"] = sq.customer_address
    return data


def material_quote_json(q, full=False):
    data = {
        "id": q.id,
        "reference": q.reference,
        "status": q.status,
        "total": q.total,
        "subtotal": q.subtotal,
        "gst_amount": q.gst_amount,
        "grand_total": q.grand_total,
        "payment_status": q.payment_status,
        "is_paid": q.is_paid,
        "notes": q.notes,
        "visit_id": q.visit_id,
        "contract_id": q.contract_id,
        "created_at": _d(q.created_at),
        "rejection_acknowledged": q.rejection_acknowledged,
        "negotiation_note": q.negotiation_note,
    }
    if full:
        data["items"] = [{
            "id": it.id, "description": it.description, "quantity": it.quantity,
            "unit_price": it.unit_price, "amount": it.amount,
        } for it in q.items]
    return data


def request_json(r):
    return {
        "id": r.id,
        "reference": r.reference,
        "request_type": r.request_type,
        "status": r.status,
        "description": r.description,
        "location": r.location,
        "area": r.area,
        "scheduled_date": _d(r.scheduled_date),
        "team_eta": r.team_eta,
        "amount": r.amount,
        "payment_status": r.payment_status,
        "sla_status": r.sla_status,
        "sla_label": r.sla_label,
        "created_at": _d(r.created_at),
    }


def refill_json(o):
    return {
        "id": o.id,
        "reference": o.reference,
        "status": o.status,
        "service_mode": o.service_mode,
        "payment_mode": o.payment_mode,
        "summary": o.summary,
        "total_units": o.total_units,
        "amount": o.amount,
        "payment_status": o.payment_status,
        "scheduled_date": _d(o.scheduled_date),
        "area": o.area,
        "address": o.address,
        "notes": o.notes,
        "created_at": _d(o.created_at),
        "items": [
            {
                "id": i.id,
                "ext_type": i.ext_type,
                "capacity": i.capacity,
                "quantity": i.quantity,
                "notes": i.notes,
            }
            for i in o.items
        ],
    }


def ticket_json(t, full=False):
    data = {
        "id": t.id,
        "reference": t.reference,
        "title": t.title,
        "status": t.status,
        "status_label": t.status_label,
        "priority": t.priority,
        "is_overdue": t.is_overdue,
        "can_retrigger": t.can_retrigger,
        "contract_id": t.contract_id,
        "created_at": _d(t.created_at),
    }
    if full:
        data["description"] = t.description
        data["voice_note"] = t.voice_note
        data["staff_reply"] = t.staff_reply
        data["replied_at"] = _d(t.replied_at)
        data["resolved_at"] = _d(t.resolved_at)
    return data


def journey_json(e):
    icon, color = e.icon_color
    return {
        "id": e.id,
        "event_type": e.event_type,
        "description": e.description,
        "icon": icon,
        "color": color,
        "created_at": _d(e.created_at),
    }


def feedback_json(fb):
    if not fb:
        return None
    return {
        "behaviour": fb.rating_behaviour,
        "quality": fb.rating_quality,
        "punctuality": fb.rating_punctuality,
        "communication": fb.rating_communication,
        "overall": fb.rating_overall,
        "avg": fb.avg_rating,
        "comment": fb.comment,
        "submitted": fb.is_submitted,
    }


# --------------------------------------------------------------------------- #
# Dashboard summary — one call the home screen can use for badges/counts
# --------------------------------------------------------------------------- #
@api_bp.route("/dashboard")
@customer_only
def dashboard():
    u = g.current_user
    contracts = Contract.query.filter_by(customer_id=u.id).all()
    pending_quotes = (ServiceQuotation.query
                      .filter(ServiceQuotation.customer_id == u.id,
                              ServiceQuotation.status.in_(["sent", "viewed"]))
                      .count())
    open_tickets = (SupportTicket.query
                    .filter(SupportTicket.customer_id == u.id,
                            SupportTicket.status.in_(["open", "acknowledged"]))
                    .count())
    unread = Notification.query.filter_by(user_id=u.id, read=False).count()
    return jsonify(
        user=user_json(u),
        contracts=[contract_json(c) for c in contracts],
        counts={
            "contracts": len(contracts),
            "pending_quotes": pending_quotes,
            "open_tickets": open_tickets,
            "unread_notifications": unread,
        },
    )


# --------------------------------------------------------------------------- #
# Profile — read is /me (above); this updates it
# --------------------------------------------------------------------------- #
@api_bp.route("/me", methods=["PUT", "POST"])
@customer_only
def update_me():
    u = g.current_user
    body = request.get_json(silent=True) or {}
    for field in ("name", "area", "city", "address", "email",
                  "company_name", "gst_number"):
        if field in body and body[field] is not None:
            setattr(u, field, str(body[field]).strip())
    db.session.commit()
    return jsonify(user=user_json(u))


# --------------------------------------------------------------------------- #
# Visit detail + rating
# --------------------------------------------------------------------------- #
@api_bp.route("/visits/<int:visit_id>")
@customer_only
def visit_detail(visit_id):
    v = db.session.get(Visit, visit_id)
    if not v or not v.contract or v.contract.customer_id != g.current_user.id:
        return jsonify(error="Visit not found."), 404
    data = visit_json(v)
    data["contract_reference"] = v.contract.reference
    data["contract_id"] = v.contract_id
    data["feedback"] = feedback_json(v.feedback)
    data["material_quotes"] = [material_quote_json(q) for q in v.material_quotes]
    data["checklist"] = [{
        "item": ci.item, "status": ci.status, "note": ci.note,
    } for ci in sorted(v.checklist_items, key=lambda x: x.sort_order or 0)]
    return jsonify(visit=data)


@api_bp.route("/visits/<int:visit_id>/rate", methods=["POST"])
@customer_only
def visit_rate(visit_id):
    v = db.session.get(Visit, visit_id)
    if not v or not v.contract or v.contract.customer_id != g.current_user.id:
        return jsonify(error="Visit not found."), 404
    if v.status != "completed":
        return jsonify(error="You can only rate a completed visit."), 400
    body = request.get_json(silent=True) or {}

    def _clamp(x):
        try:
            return max(1, min(5, int(x)))
        except (TypeError, ValueError):
            return None

    fb = v.feedback or VisitFeedback(visit_id=v.id, customer_id=g.current_user.id)
    fb.rating_behaviour = _clamp(body.get("behaviour"))
    fb.rating_quality = _clamp(body.get("quality"))
    fb.rating_punctuality = _clamp(body.get("punctuality"))
    fb.rating_communication = _clamp(body.get("communication"))
    fb.rating_overall = _clamp(body.get("overall"))
    fb.comment = (body.get("comment") or "").strip()
    fb.technician_id = v.technician_id
    if fb.rating_overall is None:
        return jsonify(error="Overall rating is required."), 400
    if fb.id is None:
        db.session.add(fb)
    v.customer_approved = True
    v.approved_at = datetime.utcnow()
    db.session.commit()
    if v.technician_id:
        notify(v.technician_id, "Visit rated",
               f"{v.contract.reference}: client rated {fb.avg_rating}/5.",
               link=url_for("admin.visit", visit_id=v.id))
    return jsonify(ok=True, feedback=feedback_json(fb))


# --------------------------------------------------------------------------- #
# Service quotations — list / detail / accept / negotiate
# --------------------------------------------------------------------------- #
@api_bp.route("/service-quotations")
@customer_only
def service_quotations():
    from sqlalchemy import or_
    u = g.current_user
    rows = (ServiceQuotation.query
            .filter(or_(ServiceQuotation.customer_id == u.id,
                        ServiceQuotation.customer_phone == u.phone))
            .order_by(ServiceQuotation.created_at.desc()).all())
    return jsonify(quotations=[service_quote_json(q) for q in rows])


def _own_sq(sq_id):
    u = g.current_user
    sq = db.session.get(ServiceQuotation, sq_id)
    if not sq or (sq.customer_id != u.id and sq.customer_phone != u.phone):
        return None
    return sq


@api_bp.route("/service-quotations/<int:sq_id>")
@customer_only
def service_quotation_detail(sq_id):
    sq = _own_sq(sq_id)
    if not sq:
        return jsonify(error="Quotation not found."), 404
    if sq.status == "sent":
        sq.status = "viewed"
        sq.viewed_at = datetime.utcnow()
        db.session.commit()
    return jsonify(quotation=service_quote_json(sq, full=True))


@api_bp.route("/service-quotations/<int:sq_id>/accept", methods=["POST"])
@customer_only
def service_quotation_accept(sq_id):
    sq = _own_sq(sq_id)
    if not sq:
        return jsonify(error="Quotation not found."), 404
    if sq.status in ("accepted", "rejected"):
        return jsonify(error="This quotation has already been responded to."), 400
    sq.status = "accepted"
    sq.responded_at = datetime.utcnow()
    if not sq.customer_id:
        sq.customer_id = g.current_user.id
    db.session.add(CustomerJourneyEvent(
        customer_id=g.current_user.id, event_type="quote_accepted",
        description=f"Accepted quotation {sq.reference}",
        ref_type="service_quotation", ref_id=sq.id))
    db.session.commit()
    notify_staff("Quotation accepted",
                 f"{g.current_user.name} accepted {sq.reference}.",
                 link=url_for("sq.detail_quotation", sq_id=sq.id))
    return jsonify(ok=True, quotation=service_quote_json(sq, full=True))


@api_bp.route("/service-quotations/<int:sq_id>/negotiate", methods=["POST"])
@customer_only
def service_quotation_negotiate(sq_id):
    sq = _own_sq(sq_id)
    if not sq:
        return jsonify(error="Quotation not found."), 404
    body = request.get_json(silent=True) or {}
    note = (body.get("note") or "").strip()
    if not note:
        return jsonify(error="Please add a message for our team."), 400
    sq.status = "negotiation_requested"
    sq.negotiation_note = note
    sq.responded_at = datetime.utcnow()
    if not sq.customer_id:
        sq.customer_id = g.current_user.id
    db.session.add(CustomerJourneyEvent(
        customer_id=g.current_user.id, event_type="negotiation_requested",
        description=f"Requested revision on {sq.reference}",
        ref_type="service_quotation", ref_id=sq.id))
    db.session.commit()
    notify_staff("Quotation — revision requested",
                 f"{g.current_user.name} on {sq.reference}: {note[:120]}",
                 link=url_for("sq.detail_quotation", sq_id=sq.id))
    return jsonify(ok=True, quotation=service_quote_json(sq, full=True))


# --------------------------------------------------------------------------- #
# Material quotations (visit-linked) — detail / approve / reject-with-waiver
# --------------------------------------------------------------------------- #
def _own_material_quote(q_id):
    q = db.session.get(Quotation, q_id)
    if not q or not q.contract or q.contract.customer_id != g.current_user.id:
        return None
    return q


@api_bp.route("/quotations/<int:q_id>")
@customer_only
def material_quotation_detail(q_id):
    q = _own_material_quote(q_id)
    if not q:
        return jsonify(error="Quotation not found."), 404
    return jsonify(quotation=material_quote_json(q, full=True), waiver_text=WAIVER_TEXT)


@api_bp.route("/quotations/<int:q_id>/decide", methods=["POST"])
@customer_only
def material_quotation_decide(q_id):
    q = _own_material_quote(q_id)
    if not q:
        return jsonify(error="Quotation not found."), 404
    body = request.get_json(silent=True) or {}
    decision = (body.get("decision") or "").strip()   # approve / reject
    quote_link = (url_for("admin.visit", visit_id=q.visit_id) if q.visit_id
                 else url_for("admin.contract", contract_id=q.contract_id))
    if decision == "approve":
        q.status = "approved"
        q.decided_at = datetime.utcnow()
        db.session.commit()
        notify_staff("Material quote approved", f"{q.reference} approved by client.",
                     link=quote_link)
    elif decision == "reject":
        if not body.get("waiver_accepted"):
            return jsonify(error="waiver_required", waiver_text=WAIVER_TEXT), 400
        q.status = "rejected"
        q.decided_at = datetime.utcnow()
        q.rejection_acknowledged = True
        q.waiver_text = WAIVER_TEXT
        db.session.commit()
        notify_staff("Material quote declined", f"{q.reference} declined (waiver signed).",
                     link=quote_link)
    else:
        return jsonify(error="decision must be 'approve' or 'reject'."), 400
    return jsonify(ok=True, quotation=material_quote_json(q, full=True))


# --------------------------------------------------------------------------- #
# Service requests (emergency / NOC) + refills — read-only lists
# --------------------------------------------------------------------------- #
@api_bp.route("/requests")
@customer_only
def service_requests():
    u = g.current_user
    from sqlalchemy import or_
    rows = (ServiceRequest.query
            .filter(or_(ServiceRequest.customer_id == u.id,
                        ServiceRequest.phone == u.phone))
            .order_by(ServiceRequest.created_at.desc()).all())
    refills = (RefillOrder.query
               .filter_by(customer_id=u.id)
               .order_by(RefillOrder.created_at.desc()).all())
    return jsonify(requests=[request_json(r) for r in rows],
                   refills=[refill_json(o) for o in refills])


@api_bp.route("/requests", methods=["POST"])
@customer_only
def create_service_request():
    body = request.get_json(silent=True) or {}
    req_type = (body.get("request_type") or "emergency").strip()
    if req_type not in ("emergency", "noc"):
        req_type = "emergency"

    u = g.current_user
    sr = ServiceRequest(
        customer_id=u.id,
        request_type=req_type,
        name=u.name,
        phone=u.phone,
        email=u.email,
        area=(body.get("area") or u.area or "").strip(),
        location=(body.get("location") or u.address or "").strip(),
        description=(body.get("description") or "").strip(),
        payment_mode=(body.get("payment_mode") or "cash").strip(),
        status="new",
        sla_due_at=(datetime.utcnow() + timedelta(hours=4)) if req_type == "emergency" else None,
    )
    db.session.add(sr)
    db.session.commit()

    db.session.add(CustomerJourneyEvent(
        customer_id=u.id,
        event_type="emergency_requested" if req_type == "emergency" else "noc_requested",
        description=f"{'Emergency 4h SLA' if req_type == 'emergency' else 'NOC'} request {sr.reference} submitted",
        ref_type="service_request",
        ref_id=sr.id,
    ))
    db.session.commit()

    notify_staff(
        f"{'EMERGENCY' if req_type == 'emergency' else 'NOC'} Request {sr.reference}",
        f"{u.name} · {sr.area or sr.location or 'Site'} — {'Respond within 4h' if req_type == 'emergency' else 'Review request'}",
        link=f"/admin/service-requests/{sr.id}"
    )
    return jsonify(ok=True, request=request_json(sr))


@api_bp.route("/refills", methods=["POST"])
@customer_only
def create_refill_order():
    body = request.get_json(silent=True) or {}
    items_data = body.get("items") or []
    if not items_data:
        return jsonify(error="Please add at least one extinguisher item to refill."), 400

    u = g.current_user
    order = RefillOrder(
        customer_id=u.id,
        name=u.name,
        phone=u.phone,
        email=u.email,
        area=(body.get("area") or u.area or "").strip(),
        address=(body.get("address") or u.address or "").strip(),
        service_mode=(body.get("service_mode") or "onsite").strip(),
        payment_mode=(body.get("payment_mode") or "cash").strip(),
        notes=(body.get("notes") or "").strip(),
        status="new",
    )
    for item in items_data:
        ext_type = (item.get("ext_type") or "").strip()
        if not ext_type:
            continue
        cap = (item.get("capacity") or "").strip()
        try:
            qty = int(item.get("quantity") or 1)
        except (TypeError, ValueError):
            qty = 1
        notes = (item.get("notes") or "").strip()
        order.items.append(RefillItem(ext_type=ext_type, capacity=cap, quantity=max(1, qty), notes=notes))

    if not order.items:
        return jsonify(error="Please add at least one valid extinguisher item to refill."), 400

    db.session.add(order)
    db.session.commit()

    db.session.add(CustomerJourneyEvent(
        customer_id=u.id,
        event_type="refill_requested",
        description=f"Refill request {order.reference} submitted ({order.summary})",
        ref_type="refill_order",
        ref_id=order.id,
    ))
    db.session.commit()

    notify_staff("New refill request",
                 f"{u.name} requested refill ({order.summary})",
                 link=f"/ops/refill/{order.id}")
    return jsonify(ok=True, refill=refill_json(order))


# --------------------------------------------------------------------------- #
# Support tickets / complaints — list / create / detail / retrigger
# --------------------------------------------------------------------------- #
@api_bp.route("/tickets")
@customer_only
def tickets():
    rows = (SupportTicket.query
            .filter_by(customer_id=g.current_user.id)
            .order_by(SupportTicket.created_at.desc()).all())
    return jsonify(tickets=[ticket_json(t) for t in rows])


@api_bp.route("/tickets", methods=["POST"])
@customer_only
def raise_ticket():
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip()
    description = (body.get("description") or "").strip()
    if not title or not description:
        return jsonify(error="Title and description are required."), 400
    contract_id = body.get("contract_id")
    if contract_id:
        c = db.session.get(Contract, contract_id)
        if not c or c.customer_id != g.current_user.id:
            contract_id = None
    t = SupportTicket(
        customer_id=g.current_user.id,
        contract_id=contract_id,
        visit_id=body.get("visit_id"),
        title=title,
        description=description,
        voice_note=(body.get("voice_note") or "").strip() or None,
        priority=(body.get("priority") or "normal"),
    )
    db.session.add(t)
    db.session.commit()
    notify_staff("New complaint raised",
                 f"{g.current_user.name}: {title}", link=f"/ops/ticket/{t.id}")
    return jsonify(ok=True, ticket=ticket_json(t, full=True))


@api_bp.route("/tickets/<int:ticket_id>")
@customer_only
def ticket_detail(ticket_id):
    t = db.session.get(SupportTicket, ticket_id)
    if not t or t.customer_id != g.current_user.id:
        return jsonify(error="Ticket not found."), 404
    return jsonify(ticket=ticket_json(t, full=True))


@api_bp.route("/tickets/<int:ticket_id>/retrigger", methods=["POST"])
@customer_only
def retrigger_ticket(ticket_id):
    t = db.session.get(SupportTicket, ticket_id)
    if not t or t.customer_id != g.current_user.id:
        return jsonify(error="Ticket not found."), 404
    if not t.can_retrigger:
        return jsonify(error="This complaint cannot be re-sent yet."), 400
    t.retriggered_at = datetime.utcnow()
    t.retrigger_count = (t.retrigger_count or 0) + 1
    db.session.commit()
    notify_staff("Complaint reminder", f"{t.reference} re-sent by client.",
                 link=f"/ops/ticket/{t.id}")
    return jsonify(ok=True, ticket=ticket_json(t, full=True))


# --------------------------------------------------------------------------- #
# Journey timeline
# --------------------------------------------------------------------------- #
@api_bp.route("/journey")
@customer_only
def journey():
    rows = (CustomerJourneyEvent.query
            .filter_by(customer_id=g.current_user.id)
            .order_by(CustomerJourneyEvent.created_at.desc()).limit(100).all())
    return jsonify(events=[journey_json(e) for e in rows])


# --------------------------------------------------------------------------- #
# Contract actions — renewal request, referral, agreement acceptance
# --------------------------------------------------------------------------- #
def _own_contract_api(contract_id):
    c = db.session.get(Contract, contract_id)
    if not c or c.customer_id != g.current_user.id:
        return None
    return c


@api_bp.route("/contracts/<int:contract_id>/renew", methods=["POST"])
@customer_only
def request_renewal(contract_id):
    c = _own_contract_api(contract_id)
    if not c:
        return jsonify(error="Contract not found."), 404
    notify_staff("Renewal requested",
                 f"{g.current_user.name} wants to renew {c.reference}.",
                 link=f"/ops/contract/{c.id}")
    db.session.add(CustomerJourneyEvent(
        customer_id=g.current_user.id, event_type="quote_requested",
        description=f"Requested renewal for {c.reference}",
        ref_type="contract", ref_id=c.id))
    db.session.commit()
    return jsonify(ok=True, message="Renewal request sent. Our team will reach out.")


@api_bp.route("/contracts/<int:contract_id>/refer", methods=["POST"])
@customer_only
def submit_referral(contract_id):
    c = _own_contract_api(contract_id)
    if not c:
        return jsonify(error="Contract not found."), 404
    body = request.get_json(silent=True) or {}
    name = (body.get("referee_name") or "").strip()
    phone = (body.get("referee_phone") or "").strip()
    if not name or not phone:
        return jsonify(error="Referee name and phone are required."), 400
    r = Referral(
        contract_id=c.id, submitted_by_id=g.current_user.id,
        referee_name=name, referee_phone=phone,
        referee_company=(body.get("referee_company") or "").strip(),
        referee_area=(body.get("referee_area") or "").strip(),
        notes=(body.get("notes") or "").strip(),
    )
    db.session.add(r)
    db.session.add(CustomerJourneyEvent(
        customer_id=g.current_user.id, event_type="referral_submitted",
        description=f"Referred {name}", ref_type="contract", ref_id=c.id))
    db.session.commit()
    notify_staff("New referral", f"{g.current_user.name} referred {name} ({phone}).",
                 link=url_for("admin.contract", contract_id=c.id))
    return jsonify(ok=True, message="Thank you! Our team will contact your referral.")


@api_bp.route("/contracts/<int:contract_id>/agreement", methods=["GET"])
@customer_only
def agreement(contract_id):
    from ..utils import AMC_AGREEMENT_CLAUSES
    c = _own_contract_api(contract_id)
    if not c:
        return jsonify(error="Contract not found."), 404
    return jsonify(
        version=AMC_AGREEMENT_VERSION,
        accepted=c.agreement_accepted,
        accepted_at=_d(c.agreement_accepted_at),
        clauses=[{"title": t, "body": b} for t, b in AMC_AGREEMENT_CLAUSES],
    )


@api_bp.route("/contracts/<int:contract_id>/agreement/accept", methods=["POST"])
@customer_only
def agreement_accept(contract_id):
    c = _own_contract_api(contract_id)
    if not c:
        return jsonify(error="Contract not found."), 404
    if c.agreement_accepted:
        return jsonify(ok=True, message="Already accepted.")
    c.agreement_accepted = True
    c.agreement_accepted_at = datetime.utcnow()
    c.agreement_version = AMC_AGREEMENT_VERSION
    db.session.add(CustomerJourneyEvent(
        customer_id=g.current_user.id, event_type="agreement_accepted",
        description=f"Accepted AMC agreement for {c.reference}",
        ref_type="contract", ref_id=c.id))
    db.session.commit()
    notify_staff("Agreement accepted",
                 f"{g.current_user.name} accepted the AMC agreement for {c.reference}.",
                 link=url_for("admin.contract", contract_id=c.id))
    return jsonify(ok=True, message="Agreement accepted. Thank you!")


# --------------------------------------------------------------------------- #
# Notifications — mark all read
# --------------------------------------------------------------------------- #
@api_bp.route("/notifications/read", methods=["POST"])
@customer_only
def notifications_read():
    Notification.query.filter_by(user_id=g.current_user.id, read=False)\
        .update({"read": True})
    db.session.commit()
    return jsonify(ok=True)


# --------------------------------------------------------------------------- #
# Plans — public list (used by the "request a new service" flow)
# --------------------------------------------------------------------------- #
@api_bp.route("/plans")
def plans():
    rows = AMCPlan.query.filter_by(active=True).all()
    return jsonify(plans=[{
        "id": p.id, "name": p.name, "tier": p.tier, "category": p.category,
        "price": p.price, "visits": p.visits_per_year,
        "response_time": p.response_time, "features": p.feature_list,
    } for p in rows])


# =========================================================================== #
#  MODULE 3 — Technician App (native, staff-facing)
#  Everything below reuses the exact same models/queries the Ops Console
#  (blueprints/admin.py: day_plan, visit, my_portfolio, checkin/checkout,
#  visit_quotation, confirm_visit) uses for its technician-facing pages, so the
#  phone app and the web console stay one source of truth — the same pattern
#  MODULE 2 established for the customer app.
# =========================================================================== #

def _own_tech_visit(visit_id):
    """A visit belonging to the current technician (or any staff, for admins
    covering a technician's board)."""
    v = db.session.get(Visit, visit_id)
    if not v:
        return None
    if g.current_user.is_admin or g.current_user.is_manager:
        return v
    return v if v.technician_id == g.current_user.id else None


def equipment_json(e):
    return {
        "id": e.id,
        "name": e.name,
        "equip_type": e.equip_type,
        "location": e.location,
        "serial_no": e.serial_no,
        "last_refill_date": _d(e.last_refill_date),
        "next_refill_date": _d(e.next_refill_date),
        "days_to_refill": e.days_to_refill,
        "refill_status": e.refill_status,
        "contract_id": e.contract_id,
        "site_name": e.contract.site_name if e.contract else None,
    }


def defect_json(d):
    return {
        "id": d.id,
        "reference": d.reference,
        "equipment_name": d.equipment_name,
        "location": d.location,
        "severity": d.severity,
        "severity_label": d.severity_label,
        "description": d.description,
        "status": d.status,
        "created_at": _d(d.created_at),
    }


def refill_pickup_json(o):
    data = refill_json(o)
    data["assigned_technician_id"] = o.assigned_technician_id
    return data


def tech_visit_json(v):
    c = v.contract
    return {
        "id": v.id,
        "label": v.label,
        "visit_number": v.visit_number,
        "status": v.status,
        "scheduled_date": _d(v.scheduled_date),
        "scheduled_time": v.scheduled_time,
        "scheduled_time_label": v.scheduled_time_label,
        "completed_date": _d(v.completed_date),
        "checkin_at": _d(v.checkin_at),
        "checkout_at": _d(v.checkout_at),
        "is_checked_in": v.is_checked_in,
        "technician_confirmed": v.technician_confirmed,
        "contract_id": v.contract_id,
        "contract_reference": c.reference if c else None,
        "site_name": c.site_name if c else None,
        "site_address": c.site_address if c else None,
        "area": c.area if c else None,
        "customer_name": (c.customer.name if c and c.customer
                          else c.applicant_name if c else None),
        "customer_phone": (c.customer.phone if c and c.customer
                           else c.applicant_phone if c else None),
        "checklist_summary": v.checklist_summary,
    }


def tech_visit_detail_json(v):
    data = tech_visit_json(v)
    data.update({
        "work_done": v.work_done,
        "notes": v.notes,
        "checkin_note": v.checkin_note,
        "technician_note": v.technician_note,
        "onsite_duration": v.onsite_duration_label,
        "checklist": [{"item": ci.item, "status": ci.status, "note": ci.note}
                      for ci in sorted(v.checklist_items, key=lambda x: x.sort_order or 0)],
        "checklist_defaults": VisitChecklistItem.STANDARD_ITEMS,
        "photos": [{"id": p.id, "url": upload_url(p.file_path), "caption": p.caption}
                   for p in v.photos],
        "defects": [defect_json(d) for d in getattr(v, "defects", [])],
        "material_quotes": [material_quote_json(q, full=True) for q in v.material_quotes],
    })
    return data


# --------------------------------------------------------------------------- #
# Profile — "Me" tab (mirrors admin.my_portfolio's exact rating/stat math)
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/me")
@technician_only
def tech_me():
    t = g.current_user
    visits = Visit.query.filter_by(technician_id=t.id).all()
    completed = [v for v in visits if v.status == "completed"]

    feedbacks = (VisitFeedback.query.filter_by(technician_id=t.id)
                 .filter(VisitFeedback.rating_overall.isnot(None)).all())
    avg_overall = (round(sum(f.rating_overall for f in feedbacks) / len(feedbacks), 1)
                   if feedbacks else None)

    def _avg(attr):
        vals = [getattr(f, attr) for f in feedbacks if getattr(f, attr) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    on_time = sum(1 for v in completed
                  if v.scheduled_date and v.completed_date and v.completed_date <= v.scheduled_date)
    on_time_pct = round(on_time / len(completed) * 100) if completed else None

    return jsonify(
        user=user_json(t),
        stats={
            "visits": len(visits),
            "on_time_pct": on_time_pct,
            "rating": avg_overall,
        },
        rating_breakdown={
            "behaviour": _avg("rating_behaviour"),
            "quality": _avg("rating_quality"),
            "punctuality": _avg("rating_punctuality"),
            "communication": _avg("rating_communication"),
        },
    )


# --------------------------------------------------------------------------- #
# Today — home screen (mirrors admin.day_plan's today_visits query)
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/today")
@technician_only
def tech_today():
    t = g.current_user
    today = date.today()
    visits = (Visit.query.filter(Visit.technician_id == t.id,
                                 Visit.scheduled_date == today)
              .all())
    visits.sort(key=lambda v: (v.scheduled_time is None, v.scheduled_time or ""))
    completed = sum(1 for v in visits if v.status == "completed")

    pickups = (RefillOrder.query
               .filter(RefillOrder.assigned_technician_id == t.id,
                       RefillOrder.status.notin_(["completed", "cancelled"]))
               .order_by(RefillOrder.scheduled_date).all())

    return jsonify(
        user=user_json(t),
        date=_d(today),
        counts={
            "today": len(visits),
            "completed": completed,
            "remaining": len(visits) - completed,
        },
        visits=[tech_visit_json(v) for v in visits],
        refill_pickups_count=len(pickups),
        refill_pickups_preview=[o.name for o in pickups[:2]],
    )


# --------------------------------------------------------------------------- #
# My visits — filterable list
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/visits")
@technician_only
def tech_visits():
    t = g.current_user
    status = (request.args.get("status") or "all").lower()
    q = Visit.query.filter_by(technician_id=t.id)
    today = date.today()
    if status == "today":
        q = q.filter(Visit.scheduled_date == today)
    elif status == "upcoming":
        q = q.filter(Visit.status.in_(["scheduled", "in_progress"]),
                     Visit.scheduled_date >= today)
    elif status == "done":
        q = q.filter(Visit.status == "completed")
    rows = q.order_by(Visit.scheduled_date.desc()).all()
    return jsonify(visits=[tech_visit_json(v) for v in rows], count=len(rows))


@api_bp.route("/tech/visits/<int:visit_id>")
@technician_only
def tech_visit_detail(visit_id):
    v = _own_tech_visit(visit_id)
    if not v:
        return jsonify(error="Visit not found."), 404
    return jsonify(visit=tech_visit_detail_json(v))


# --------------------------------------------------------------------------- #
# Accept / reject a visit in the day plan (mirrors admin.confirm_visit)
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/visits/<int:visit_id>/confirm", methods=["POST"])
@technician_only
def tech_visit_confirm(visit_id):
    v = _own_tech_visit(visit_id)
    if not v:
        return jsonify(error="Visit not found."), 404
    body = request.get_json(silent=True) or {}
    action = body.get("action")
    note = (body.get("note") or "").strip()
    if action == "accept":
        v.technician_confirmed = True
        v.technician_note = note or None
        db.session.commit()
        notify_staff(f"{v.label} accepted by {g.current_user.name}",
                     f"{v.label} for {v.contract.reference} confirmed.",
                     link=url_for("admin.visit", visit_id=v.id))
    elif action == "reject":
        v.technician_confirmed = False
        v.technician_note = note
        db.session.commit()
        notify_staff(f"{v.label} rejected by {g.current_user.name}",
                     f"{v.label} for {v.contract.reference} was rejected"
                     f"{': ' + note if note else ''}. Please reassign.",
                     link=url_for("admin.visit", visit_id=v.id))
    else:
        return jsonify(error="action must be 'accept' or 'reject'."), 400
    return jsonify(ok=True, visit=tech_visit_detail_json(v))


# --------------------------------------------------------------------------- #
# Check-in / check-out (mirrors admin.visit_checkin / visit_checkout,
# including the 100m geofence)
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/visits/<int:visit_id>/checkin", methods=["POST"])
@technician_only
def tech_visit_checkin(visit_id):
    v = _own_tech_visit(visit_id)
    if not v:
        return jsonify(error="Visit not found."), 404
    body = request.get_json(silent=True) or {}
    lat, lng = body.get("lat"), body.get("lng")
    note = (body.get("note") or "").strip()
    c = v.contract
    if c and c.latitude and c.longitude and lat and lng:
        from ..utils import meters_between
        dist = meters_between(lat, lng, c.latitude, c.longitude)
        if dist is not None and dist > 100:
            return jsonify(error=f"You appear to be about {int(dist)} m from the site. "
                                  f"You must be within 100 m to check in.",
                           distance_m=int(dist)), 400
        if dist is not None:
            note = (note + " " if note else "") + f"[GPS {lat},{lng} · {int(dist)}m from site]"
    elif lat and lng:
        note = (note + " " if note else "") + f"[GPS {lat},{lng}]"
    v.checkin_at = datetime.utcnow()
    v.checkin_note = note or None
    if v.status == "scheduled":
        v.status = "in_progress"
    db.session.commit()
    if c and c.customer_id:
        notify(c.customer_id, "Your technician has arrived",
               f"{v.technician.name if v.technician else 'Your technician'} checked in "
               f"for {v.label} at {c.reference} at {v.checkin_at:%H:%M}.",
               link=url_for("portal.contract", contract_id=v.contract_id))
    return jsonify(ok=True, visit=tech_visit_detail_json(v))


@api_bp.route("/tech/visits/<int:visit_id>/checkout", methods=["POST"])
@technician_only
def tech_visit_checkout(visit_id):
    v = _own_tech_visit(visit_id)
    if not v:
        return jsonify(error="Visit not found."), 404
    if not v.checkin_at:
        v.checkin_at = datetime.utcnow()
    v.checkout_at = datetime.utcnow()
    db.session.commit()
    c = v.contract
    if c and c.customer_id:
        notify(c.customer_id, "Your technician has left the site",
               f"{v.technician.name if v.technician else 'Your technician'} checked out "
               f"after {v.label} at {c.reference} — on site "
               f"{v.onsite_duration_label or '0m'}.",
               link=url_for("portal.contract", contract_id=v.contract_id))
    return jsonify(ok=True, visit=tech_visit_detail_json(v))


# --------------------------------------------------------------------------- #
# Checklist + work notes (mirrors the checklist/work_done half of admin.visit)
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/visits/<int:visit_id>/checklist", methods=["POST"])
@technician_only
def tech_visit_checklist(visit_id):
    v = _own_tech_visit(visit_id)
    if not v:
        return jsonify(error="Visit not found."), 404
    body = request.get_json(silent=True) or {}
    if "work_done" in body:
        v.work_done = body.get("work_done")
    if "notes" in body:
        v.notes = body.get("notes")
    items = body.get("checklist")
    if items is not None:
        VisitChecklistItem.query.filter_by(visit_id=v.id).delete()
        for idx, it in enumerate(items):
            name = (it.get("item") or "").strip()
            if name:
                db.session.add(VisitChecklistItem(
                    visit_id=v.id, item=name,
                    status=it.get("status", "ok"),
                    note=(it.get("note") or "").strip() or None,
                    sort_order=idx))
    db.session.commit()
    return jsonify(ok=True, visit=tech_visit_detail_json(v))


@api_bp.route("/tech/visits/<int:visit_id>/photos", methods=["POST"])
@technician_only
def tech_visit_photo(visit_id):
    """Multipart upload (field name 'photo') — mirrors admin.visit()'s photo handling."""
    v = _own_tech_visit(visit_id)
    if not v:
        return jsonify(error="Visit not found."), 404
    path = save_upload(request.files.get("photo"), f"visits/visit{v.id}",
                       {"png", "jpg", "jpeg", "gif", "webp"})
    if not path:
        return jsonify(error="Please attach a valid image (png/jpg/webp)."), 400
    p = VisitPhoto(visit_id=v.id, file_path=path,
                   caption=(request.form.get("caption") or None))
    db.session.add(p)
    db.session.commit()
    return jsonify(ok=True, photo={"id": p.id, "url": upload_url(path), "caption": p.caption})


# --------------------------------------------------------------------------- #
# Mark visit complete (mirrors the completion branch of admin.visit)
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/visits/<int:visit_id>/complete", methods=["POST"])
@technician_only
def tech_visit_complete(visit_id):
    v = _own_tech_visit(visit_id)
    if not v:
        return jsonify(error="Visit not found."), 404
    if not v.checklist_items:
        return jsonify(error="Complete the maintenance checklist before closing the visit."), 400
    v.status = "completed"
    if not v.completed_date:
        v.completed_date = date.today()
    db.session.commit()
    from .admin import _maybe_issue_certificate, _trigger_feedback
    if v.contract and v.contract.customer_id:
        notify(v.contract.customer_id,
               f"Congratulations — your {v.label} is done!",
               f"Your service report for {v.contract.reference} is ready. "
               f"Please review, download it, and rate the service.",
               link=url_for("portal.visit", visit_id=v.id) + "?chime=1")
        _maybe_issue_certificate(v)
        _trigger_feedback(v)
        db.session.commit()
    return jsonify(ok=True, visit=tech_visit_detail_json(v))


# --------------------------------------------------------------------------- #
# Raise a material quotation on-site (mirrors admin.visit_quotation)
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/visits/<int:visit_id>/quotation", methods=["POST"])
@technician_only
def tech_visit_quotation(visit_id):
    v = _own_tech_visit(visit_id)
    if not v:
        return jsonify(error="Visit not found."), 404
    body = request.get_json(silent=True) or {}
    items = body.get("items") or []
    q = Quotation(contract_id=v.contract_id, visit_id=v.id,
                  notes=(body.get("notes") or None), status="pending")
    db.session.add(q)
    db.session.flush()
    for it in items:
        desc = (it.get("description") or "").strip()
        if not desc:
            continue
        try:
            qty = int(it.get("quantity") or 1)
        except (TypeError, ValueError):
            qty = 1
        try:
            price = int(it.get("unit_price") or 0)
        except (TypeError, ValueError):
            price = 0
        db.session.add(QuotationItem(quotation_id=q.id, description=desc,
                                     quantity=qty, unit_price=price))
    if not q.items:
        db.session.rollback()
        return jsonify(error="Add at least one item to raise a quotation."), 400
    db.session.commit()
    if v.contract.customer_id:
        notify(v.contract.customer_id, "New material quotation for approval",
               f"During {v.label} we recommend replacements totalling "
               f"₹{q.total:,.0f}. Please review and approve or decline.",
               link=url_for("portal.quotation", quote_id=q.id))
    return jsonify(ok=True, quotation=material_quote_json(q, full=True))


# --------------------------------------------------------------------------- #
# Equipment / asset lookup — powers the QR "Scan" tab
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/equipment/lookup")
@technician_only
def tech_equipment_lookup():
    code = (request.args.get("code") or "").strip()
    if not code:
        return jsonify(error="Missing 'code'."), 400
    e = Equipment.query.filter(Equipment.serial_no == code).first()
    if not e:
        e = Equipment.query.filter(Equipment.serial_no.ilike(f"%{code}%")).first()
    if not e:
        return jsonify(error="No equipment found for that code."), 404
    return jsonify(equipment=equipment_json(e))


# --------------------------------------------------------------------------- #
# Refill pickups assigned to this technician
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/refill-pickups")
@technician_only
def tech_refill_pickups():
    t = g.current_user
    rows = (RefillOrder.query
            .filter(RefillOrder.assigned_technician_id == t.id,
                    RefillOrder.status.notin_(["completed", "cancelled"]))
            .order_by(RefillOrder.scheduled_date).all())
    return jsonify(pickups=[refill_pickup_json(o) for o in rows])


# --------------------------------------------------------------------------- #
# Notifications — "Alerts" tab (same Notification model the customer app uses)
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/notifications")
@technician_only
def tech_notifications():
    rows = (Notification.query.filter_by(user_id=g.current_user.id)
            .order_by(Notification.created_at.desc()).limit(50).all())
    unread = sum(1 for n in rows if not n.read)
    return jsonify(unread=unread, notifications=[notification_json(n) for n in rows])


@api_bp.route("/tech/notifications/read", methods=["POST"])
@technician_only
def tech_notifications_read():
    Notification.query.filter_by(user_id=g.current_user.id, read=False)\
        .update({"read": True})
    db.session.commit()
    return jsonify(ok=True)


# --------------------------------------------------------------------------- #
# Inventory search — powers "Raise material quotation"
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/inventory/search")
@technician_only
def tech_inventory_search():
    from sqlalchemy import or_
    q = (request.args.get("q") or "").strip()
    query = InventoryItem.query.filter_by(active=True)
    if q:
        query = query.filter(or_(InventoryItem.name.ilike(f"%{q}%"),
                                 InventoryItem.category.ilike(f"%{q}%")))
    rows = query.order_by(InventoryItem.category, InventoryItem.name).limit(30).all()
    return jsonify(items=[{
        "id": i.id, "name": i.name, "category": i.category,
        "unit": i.unit, "rate": i.rate,
    } for i in rows], total=InventoryItem.query.filter_by(active=True).count())


# --------------------------------------------------------------------------- #
# Technician Inquiries — Site visit & checklist execution on mobile
# --------------------------------------------------------------------------- #
@api_bp.route("/tech/inquiries")
@technician_only
def tech_inquiries():
    """List inquiries assigned to the logged-in technician."""
    t = g.current_user
    rows = Enquiry.query.filter_by(assigned_to_id=t.id)\
        .order_by(Enquiry.visit_scheduled_date.asc(), Enquiry.created_at.desc()).all()

    return jsonify(inquiries=[{
        "id": e.id,
        "reference": e.ref_code,
        "customer_name": e.name,
        "phone": e.phone,
        "email": e.email,
        "address": e.address,
        "area": e.area,
        "city": e.city,
        "service_requirement": e.service_requirement,
        "status": e.status,
        "status_label": e.status_label,
        "visit_scheduled_date": e.visit_scheduled_date.isoformat() if e.visit_scheduled_date else None,
        "visit_time_slot": e.visit_time_slot,
        "team_leader_notes": e.team_leader_notes,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    } for e in rows])


@api_bp.route("/tech/inquiries/<int:inq_id>")
@technician_only
def tech_inquiry_detail(inq_id):
    """Get full details of an inquiry including checklist and history."""
    e = db.session.get(Enquiry, inq_id)
    if not e or (e.assigned_to_id != g.current_user.id and not g.current_user.is_admin):
        return jsonify(error="Inquiry not found or access denied"), 404

    return jsonify(inquiry={
        "id": e.id,
        "reference": e.ref_code,
        "customer_name": e.name,
        "phone": e.phone,
        "email": e.email,
        "address": e.address,
        "area": e.area,
        "city": e.city,
        "service_requirement": e.service_requirement,
        "message": e.message,
        "status": e.status,
        "status_label": e.status_label,
        "assigned_by": e.assigned_by.name if e.assigned_by else None,
        "assigned_at": e.assigned_at.isoformat() if e.assigned_at else None,
        "visit_scheduled_date": e.visit_scheduled_date.isoformat() if e.visit_scheduled_date else None,
        "visit_time_slot": e.visit_time_slot,
        "team_leader_notes": e.team_leader_notes,
        "technician_notes": e.technician_notes,
        "checklist_submitted_at": e.checklist_submitted_at.isoformat() if e.checklist_submitted_at else None,
        "quotation_id": e.quotation_id,
        "quotation_ref": e.quotation.reference if e.quotation else None,
        "checklist_items": [{
            "id": i.id,
            "category": i.category,
            "item_name": i.item_name,
            "status": i.status,
            "remarks": i.remarks,
            "recommendation": i.recommendation
        } for i in e.checklist_items],
        "photos": [{
            "id": p.id,
            "url": upload_url(p.file_path),
            "caption": p.caption
        } for p in e.photos],
        "workflow_steps": e.workflow_steps,
    })


@api_bp.route("/tech/inquiries/<int:inq_id>/checklist", methods=["POST"])
@technician_only
def tech_submit_inquiry_checklist(inq_id):
    """Submit checklist from mobile app. Only assigned technician or Team Leader can submit."""
    e = db.session.get(Enquiry, inq_id)
    if not e:
        return jsonify(error="Inquiry not found"), 404

    is_assigned_tech = bool(e.assigned_to_id and g.current_user.id == e.assigned_to_id)
    is_tl_or_admin = bool(g.current_user.is_team_leader or g.current_user.is_admin or g.current_user.is_manager)
    if not (is_assigned_tech or is_tl_or_admin):
        assigned_name = e.assigned_to.name if e.assigned_to else "another technician"
        return jsonify(error=f"Access denied: This inspection is assigned to {assigned_name}. Only the assigned technician or Team Leader can conduct this checklist."), 403

    payload = request.get_json(silent=True) or {}
    items = payload.get("items", [])
    tech_notes = payload.get("technician_notes", "").strip()

    if not items:
        return jsonify(error="No checklist items provided"), 400

    InquiryChecklistItem.query.filter_by(inquiry_id=e.id).delete()

    pass_cnt = 0
    att_cnt = 0
    fail_cnt = 0

    for item in items:
        st = item.get("status", "pass")
        if st == "pass":
            pass_cnt += 1
        elif st == "attention":
            att_cnt += 1
        elif st == "fail":
            fail_cnt += 1

        db.session.add(InquiryChecklistItem(
            inquiry_id=e.id,
            category=item.get("category", "General"),
            item_name=item.get("item_name", "Item"),
            status=st,
            remarks=item.get("remarks", ""),
            recommendation=item.get("recommendation", "")
        ))

    if tech_notes:
        e.technician_notes = tech_notes

    e.checklist_submitted_at = datetime.utcnow()
    e.visit_completed_at = datetime.utcnow()
    e.status = "checklist_submitted"

    db.session.add(InquiryHistory(
        inquiry_id=e.id,
        action="Checklist Submitted",
        actor_id=g.current_user.id,
        actor_name=g.current_user.name,
        details=f"Mobile checklist submitted by {g.current_user.name}: {pass_cnt} passed, {att_cnt} attention, {fail_cnt} failed."
    ))

    db.session.commit()

    # Notify Team Leader
    try:
        notify_team_leaders(
            title=f"Checklist Submitted — {e.ref_code}",
            body=f"{g.current_user.name} submitted site visit checklist for {e.name}. Ready for quotation generation.",
            link=url_for("admin.enquiry_detail", enq_id=e.id)
        )
    except Exception:
        pass

    return jsonify(ok=True, reference=e.ref_code, status=e.status)


@api_bp.route("/tech/inquiries/<int:inq_id>/visit-status", methods=["POST"])
@technician_only
def tech_update_inquiry_status(inq_id):
    """Update inquiry visit status from mobile app."""
    e = db.session.get(Enquiry, inq_id)
    if not e:
        return jsonify(error="Inquiry not found"), 404

    is_assigned_tech = bool(e.assigned_to_id and g.current_user.id == e.assigned_to_id)
    is_tl_or_admin = bool(g.current_user.is_team_leader or g.current_user.is_admin or g.current_user.is_manager)
    if not (is_assigned_tech or is_tl_or_admin):
        assigned_name = e.assigned_to.name if e.assigned_to else "another technician"
        return jsonify(error=f"Access denied: Only the assigned technician ({assigned_name}) or Team Leader can update visit status."), 403

    payload = request.get_json(silent=True) or {}
    new_status = payload.get("status")
    note = payload.get("note", "").strip()

    valid_transitions = ["site_visit_scheduled", "site_visit_in_progress", "checklist_submitted"]
    if new_status not in valid_transitions:
        return jsonify(error="Invalid status transition"), 400

    e.status = new_status
    if new_status == "site_visit_in_progress" and not e.visit_scheduled_date:
        e.visit_scheduled_date = date.today()

    status_name = {
        "site_visit_scheduled": "Visit Scheduled",
        "site_visit_in_progress": "Visit in Progress",
        "checklist_submitted": "Checklist Submitted",
    }.get(new_status, new_status.replace("_", " ").title())

    history_desc = f"Visit status updated to {status_name} by {g.current_user.name}."
    if note:
        history_desc += f" Note: {note}"

    db.session.add(InquiryHistory(
        inquiry_id=e.id,
        action=f"Status: {status_name}",
        actor_id=g.current_user.id,
        actor_name=g.current_user.name,
        details=history_desc
    ))
    db.session.commit()

    return jsonify(ok=True, status=e.status, status_label=e.status_label)
