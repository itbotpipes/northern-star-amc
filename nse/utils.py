import os
import random
import uuid
from datetime import datetime, timedelta
from functools import wraps
from math import radians, sin, cos, asin, sqrt


def meters_between(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres between two lat/long points (haversine).
    Returns None if any coordinate is missing/invalid — used by the technician's
    100m geofenced check-in (#6)."""
    try:
        lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)
    except (TypeError, ValueError):
        return None
    r = 6371000  # earth radius, metres
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))

import requests
from flask import abort, current_app, flash, redirect, url_for
from flask_login import current_user
from werkzeug.utils import secure_filename

from .extensions import db
from .models import OtpCode, Notification


# Liability waiver a client must accept when rejecting a recommended material
# quotation raised during an AMC visit (Wave 6).
WAIVER_TEXT = (
    "I do not wish to replace the mentioned spare parts/equipments/tools as mentioned "
    "by the company and hereby, I take full responsibility if any fire incident happens "
    "after this AMC visit, and Northern Star Engineering is not responsible."
)


# Terms & Conditions printed on an **AMC quotation** PDF (service_type == 'amc').
# These are maintenance-specific and replace the installation/project clauses for
# AMC quotes. See MAINTENANCE_TERMS_AND_CONDITIONS.md for the full rationale.
AMC_QUOTATION_TERMS = [
    "This Annual Maintenance Contract covers periodic inspection, testing and routine servicing of the fire-safety equipment listed above, at the registered site only, for 12 months from activation.",
    "The contract includes the number of scheduled maintenance visits stated above, spaced evenly across the year. Additional visits requested outside this schedule are chargeable.",
    "Reactive breakdown visits between scheduled visits are provided on a priority basis; travel and labour are covered, but any spare parts or materials are chargeable separately.",
    "Routine maintenance consumables and standard servicing labour for the covered equipment are included in the AMC fee.",
    "Not included: replacement of expired/damaged/non-functional parts; extinguisher refilling; hydro-testing; replacement of cylinders, hoses, glass or heads; civil/electrical/plumbing infrastructure; and equipment added after activation without prior written intimation.",
    "Where replacement is required, a separate material quotation is raised for your approval. You may decline, but Northern Star Engineering bears no liability for any fire incident attributable to equipment you have declined to repair or replace; a waiver is recorded on decline.",
    "You must ensure safe, unobstructed access to all equipment on the scheduled visit date along with power and water. If access is denied or the site is not ready, that visit is treated as completed and is not carried forward.",
    "Rescheduling requests must be made at least 48 hours before the scheduled visit; we will accommodate a mutually convenient date within the contract period.",
    "For equipment already installed (by NSE or a third party), the AMC covers upkeep only. Any pre-existing defect found at the first inspection will be reported; its rectification is chargeable and outside routine maintenance.",
    "Warranties on any parts or equipment supplied are limited to the respective manufacturer's warranty.",
    "Maintenance is carried out in line with applicable Indian standards (NBC, BIS/IS and relevant NFPA guidance). NOC assistance, if required, is a separate service subject to fire-officer inspection.",
    "You shall keep equipment clean and accessible between visits, report faults promptly, not permit any third party to service the covered equipment during the contract period, and use all equipment as per standard procedure.",
    "A service report is issued after each completed visit; please verify and acknowledge it. Digital reports shared via the portal/email are valid records.",
    "The AMC fee is due within 7 days of contract activation (or as stated above). Services may be suspended for non-payment until cleared. All amounts are subject to GST as applicable (GST No. 24ALQPD0899P1ZD).",
    "This quotation is valid for the number of days stated above. Spare-part and consumable rates are subject to prevailing market prices at the time of actual replacement.",
    "Northern Star Engineering's total liability under this contract shall not exceed the annual AMC fee paid, and excludes consequential loss, property damage or injury where a notified fault was not authorised for repair/replacement.",
    "The contract does not auto-renew. Either party may terminate with 30 days' written notice; a pro-rata refund is payable only for scheduled visits not yet performed.",
    "This contract is governed by the laws of India; any dispute is subject to the exclusive jurisdiction of the courts at Surat, Gujarat.",
]

# Short terms printed on a stand-alone Fire Safety Audit Fee slip (service_type
# == 'audit') — the site was inspected and found satisfactory, no AMC quoted yet.
AUDIT_TERMS = [
    "This charge covers the on-site Fire System Health Check-up (FSHCR) inspection only and does not constitute an Annual Maintenance Contract.",
    "The findings reflect the condition of the fire-safety systems as observed on the inspection date only.",
    "We recommend a full maintenance visit at the interval noted in the report; a separate AMC quotation will be shared closer to that date.",
    "Amount is inclusive of applicable GST (GST No. 24ALQPD0899P1ZD).",
]


# AMC maintenance agreement — the click-through Terms & Conditions a customer
# must read and accept (in-app, app-store style) once their contract is activated.
# Bump AMC_AGREEMENT_VERSION whenever the clauses change so prior acceptances are
# distinguishable. The agreement is view-only — clients cannot download it.
AMC_AGREEMENT_VERSION = "1.0"
AMC_AGREEMENT_CLAUSES = [
    ("Scope of Service",
     "The Annual Maintenance Contract covers inspection, testing, and routine servicing "
     "of fire safety equipment at the registered site as per the agreed visit schedule. "
     "Only equipment listed at the time of contract activation is covered under this agreement."),
    ("Visit Schedule & Rescheduling",
     "Northern Star Engineering will conduct the agreed number of visits across the contract "
     "year, evenly spaced. The client must ensure site access on the scheduled date. If access "
     "is denied, that visit is forfeited. Rescheduling requests must be made at least 48 hours "
     "in advance."),
    ("Spare Parts & Materials",
     "Routine maintenance consumables are included. Replacement of damaged, expired, or "
     "non-functional parts is quoted separately. The client is not obligated to accept a "
     "material quotation, but Northern Star Engineering bears no liability for fire incidents "
     "attributable to equipment for which the client has declined recommended replacement "
     "(a waiver must be signed at the time of decline)."),
    ("Equipment Not Covered",
     "This contract does not cover equipment damaged due to misuse, vandalism, or acts of God; "
     "third-party-installed equipment; civil or electrical infrastructure (piping, wiring, boards); "
     "or equipment added to the site after activation without prior written intimation."),
    ("Client Obligations",
     "The client agrees to maintain the equipment in a clean and accessible state between visits; "
     "report any fault or damage immediately; not engage a third party to service the same "
     "equipment during the contract period; and ensure electrical supply and site access on "
     "visit days."),
    ("Liability Cap",
     "Northern Star Engineering's total liability under this agreement, for any reason, shall not "
     "exceed the annual contract fee paid. NSE is not liable for consequential losses, property "
     "damage, or bodily injury arising from equipment failure where the client has been notified "
     "of a fault and has not authorised repair or replacement."),
    ("Payment Terms",
     "The annual contract fee is due within 7 days of contract activation. Non-payment entitles "
     "Northern Star Engineering to suspend service until full payment is received. All amounts are "
     "inclusive of applicable GST (GST No. 24ALQPD0899P1ZD)."),
    ("Contract Renewal & Termination",
     "The contract is valid for 12 months from the activation date and does not auto-renew. "
     "Either party may terminate with 30 days' written notice; NSE will refund a pro-rated amount "
     "for unserved visits. No refund is payable if the client terminates after all visits are "
     "consumed."),
    ("Governing Law",
     "This agreement is subject to the laws of India. Any dispute arising under this agreement "
     "shall be subject to the exclusive jurisdiction of courts in Surat, Gujarat."),
]


def staff_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_staff:
            abort(403)
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            abort(403)
        return fn(*args, **kwargs)
    return wrapper


def team_leader_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated or not (current_user.is_team_leader or current_user.is_admin):
            abort(403)
        return fn(*args, **kwargs)
    return wrapper


def customer_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != "customer":
            flash("Please log in as a customer to view this.", "warning")
            return redirect(url_for("auth.login"))
        return fn(*args, **kwargs)
    return wrapper


# --------------------------------------------------------------------------- #
# OTP helpers (dev flow — pluggable into a real SMS gateway later)
# --------------------------------------------------------------------------- #
def generate_otp(phone):
    code = f"{random.randint(0, 999999):06d}"
    otp = OtpCode(phone=phone, code=code,
                  expires_at=datetime.utcnow() + timedelta(minutes=10))
    db.session.add(otp)
    db.session.commit()
    # In production: send `code` via SMS here. For now we log it and return it so
    # the dev UI can display it.
    current_app.logger.info("OTP for %s is %s", phone, code)
    return code


def verify_otp(phone, code):
    otp = (OtpCode.query
           .filter_by(phone=phone, code=code, used=False)
           .order_by(OtpCode.id.desc())
           .first())
    if otp and otp.is_valid:
        otp.used = True
        db.session.commit()
        return True
    return False


# --------------------------------------------------------------------------- #
# File uploads
# --------------------------------------------------------------------------- #
def _allowed(filename, allowed_ext):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_ext


def save_upload(file_storage, subdir, allowed_ext):
    """Persist an uploaded file and return a reference for later rendering.

    Two backends, chosen at runtime:
      * Vercel Blob (when BLOB_READ_WRITE_TOKEN is set) — returns an absolute
        https:// URL. Used in production, where the local filesystem is
        read-only/ephemeral.
      * Local disk (dev) — writes under static/uploads/<subdir>/ and returns a
        path relative to the static folder (for url_for('static', filename=...)).

    Either form is resolved for templates/links by `upload_url()` below.
    """
    if not file_storage or not file_storage.filename:
        return None
    if not _allowed(file_storage.filename, allowed_ext):
        return None
    safe = secure_filename(file_storage.filename)
    unique = f"{uuid.uuid4().hex[:8]}_{safe}"

    token = current_app.config.get("BLOB_READ_WRITE_TOKEN")
    if token:
        return _save_to_blob(file_storage, f"{subdir}/{unique}", token)

    dest_dir = os.path.join(current_app.config["UPLOAD_FOLDER"], subdir)
    os.makedirs(dest_dir, exist_ok=True)
    file_storage.save(os.path.join(dest_dir, unique))
    return f"uploads/{subdir}/{unique}"


def _save_to_blob(file_storage, pathname, token):
    """Upload bytes to Vercel Blob via its REST API; return the public URL.

    We add our own uuid prefix for uniqueness, so we disable Blob's random
    suffix to keep the pathname predictable. Raises on a failed upload so the
    caller doesn't silently store a broken reference.
    """
    data = file_storage.read()
    resp = requests.put(
        f"https://blob.vercel-storage.com/{pathname}",
        data=data,
        headers={
            "authorization": f"Bearer {token}",
            "x-api-version": "7",
            "x-content-type": file_storage.mimetype or "application/octet-stream",
            "x-add-random-suffix": "0",
            "access": "public",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["url"]


def upload_url(path):
    """Resolve a stored upload reference to a browser URL.

    Absolute (Blob) URLs are returned as-is; relative paths are served from the
    Flask static folder. Registered as the `upload_url` Jinja filter.
    """
    if not path:
        return None
    if path.startswith(("http://", "https://")):
        return path
    return url_for("static", filename=path)


# --------------------------------------------------------------------------- #
# Notifications
# --------------------------------------------------------------------------- #
def notify(user_id, title, body=None, link=None):
    if not user_id:
        return
    db.session.add(Notification(user_id=user_id, title=title, body=body, link=link))
    db.session.commit()


def notify_staff(title, body=None, link=None):
    """Fan a notification out to every staff member (admin + technician + manager + team_leader).

    Used for events the Ops Console must surface — e.g. a customer accepting or
    requesting negotiation on a quotation. Each staff user gets their own
    Notification row so the unread badge / bell works per-account.
    """
    from .models import User
    staff = User.query.filter(User.role.in_(["admin", "technician", "manager", "team_leader"])).all()
    for u in staff:
        db.session.add(Notification(user_id=u.id, title=title, body=body, link=link))
    db.session.commit()


def notify_team_leaders(title, body=None, link=None):
    """Notify Team Leaders, Managers, and Admins — used for new inquiry assignment
    and inquiry workflow progression."""
    from .models import User
    leaders = User.query.filter(User.role.in_(["team_leader", "manager", "admin"])).all()
    for u in leaders:
        db.session.add(Notification(user_id=u.id, title=title, body=body, link=link))
    db.session.commit()


def notify_managers(title, body=None, link=None):
    """Notify managers (+ admin, who often doubles as manager on a small team)
    specifically — used for events that are the maintenance manager's job to act
    on, e.g. a new customer enquiry that needs an inspection scheduled."""
    from .models import User
    mgrs = User.query.filter(User.role.in_(["manager", "admin"])).all()
    for u in mgrs:
        db.session.add(Notification(user_id=u.id, title=title, body=body, link=link))
    db.session.commit()


def public_url(endpoint, **values):
    """Build a fully-qualified URL that is clickable on a client's phone.

    Priority:
      1. BASE_URL env var (set to ngrok / Vercel / production domain)
      2. Mac's LAN IP auto-detected via socket (same-WiFi use-case, dev only)
      3. Flask's url_for _external=True fallback (always works for localhost test)
    """
    import socket
    from flask import current_app
    base = current_app.config.get("BASE_URL", "").rstrip("/")
    if not base:
        # Try to auto-detect the LAN IP (works when client is on the same WiFi)
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            lan_ip = s.getsockname()[0]
            s.close()
            port = current_app.config.get("SERVER_PORT", 5055)
            base = f"http://{lan_ip}:{port}"
        except Exception:
            pass
    if base:
        path = url_for(endpoint, **values)
        return base + path
    return url_for(endpoint, _external=True, **values)


def rupees(amount):
    try:
        return "₹{:,.0f}".format(amount or 0)
    except (ValueError, TypeError):
        return f"₹{amount}"


# --------------------------------------------------------------------------- #
# WhatsApp click-to-send (free, no API). Builds a wa.me link that opens the
# sender's WhatsApp with the message pre-filled; they tap send. When a real
# WhatsApp Business API provider is wired later, swap the call sites for an
# automated send — the message-builders below can be reused verbatim.
# --------------------------------------------------------------------------- #
def normalise_phone(phone, country="91"):
    """Strip to digits and prepend the country code for a 10-digit Indian number."""
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) == 10:
        digits = country + digits
    return digits


def whatsapp_url(phone, text):
    """Return a wa.me click-to-chat URL with a pre-filled message.

    If `phone` is empty, returns a generic wa.me link (opens contact picker).
    """
    import urllib.parse
    digits = normalise_phone(phone)
    base = f"https://wa.me/{digits}" if digits else "https://wa.me/"
    return f"{base}?text={urllib.parse.quote(text)}"


# --------------------------------------------------------------------------- #
# UPI QR — builds a standard `upi://pay` deep link and renders it as a base64
# PNG so any UPI app (GPay/PhonePe/Paytm) can scan and pay the exact amount.
# Manual confirmation for now; a gateway webhook can confirm automatically later.
# --------------------------------------------------------------------------- #
def upi_link(vpa, payee_name, amount, note=""):
    import urllib.parse
    params = {
        "pa": vpa,
        "pn": payee_name,
        "am": f"{float(amount or 0):.2f}",
        "cu": "INR",
    }
    if note:
        params["tn"] = note
    return "upi://pay?" + urllib.parse.urlencode(params)


def qr_data_uri(data, fill="#16235b", box_size=8):
    """Generic base64 PNG QR code for any string (URL, deep link, plain text).
    Returns a data: URI ready to drop straight into an <img src="">, or None on
    failure (qrcode not installed, encoding error, etc. — callers should treat
    a None return as 'skip the image, keep the text link'). Used for the
    UPI payment QR, the /qr device-pairing page, and quotation share links."""
    try:
        import io, base64, qrcode
        qr = qrcode.QRCode(version=None, box_size=box_size, border=2,
                           error_correction=qrcode.constants.ERROR_CORRECT_M)
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color=fill, back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        return f"data:image/png;base64,{b64}"
    except Exception:
        return None


def upi_qr_data_uri(vpa, payee_name, amount, note=""):
    """Return (upi_link, data_uri_png) for a UPI QR, or (link, None) on failure."""
    link = upi_link(vpa, payee_name, amount, note)
    return link, qr_data_uri(link)
