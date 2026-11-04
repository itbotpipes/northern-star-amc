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
    "What the contract covers: Regular inspection, testing and servicing of the listed fire equipment, at your site, for 12 months from activation.",
    "Number of visits: As many visits as written in the quotation, spread across the year. Extra visits on request are charged.",
    "Emergency visits: If something breaks between visits, we come on priority. Travel and labour are covered; spare parts are charged extra.",
    "What's included: Routine servicing labour, cleaning and small fittings for the covered equipment.",
    "What's not included: Replacing dead or damaged parts, refilling extinguishers, cylinder / hose / glass replacement, building electrical or plumbing work, or equipment added later without telling us.",
    "Spare parts: If parts are needed, we send a separate quotation for your approval. You may say no — but then we are not responsible if a fire incident happens because of the declined repair. A waiver is recorded.",
    "Site access: You must give us safe access to all equipment on the visit date (power, water, keys). If the site isn't ready, that visit counts as done.",
    "Changing the date: Tell us at least 48 hours before; we will fix another date within the contract period.",
    "Old equipment: For already-installed equipment, we only maintain it. Defects found at the first inspection are reported to you; fixing them is charged extra.",
    "Warranties: Only the manufacturer's warranty applies; the AMC does not extend it.",
    "Standards: Work follows Indian fire standards. NOC help is a separate service.",
    "Your responsibilities: Keep equipment clean and reachable, report faults quickly, don't let anyone else service it during the contract, and use it properly.",
    "Reports: You get a service report after every visit — please check and acknowledge it. Digital reports count as valid records.",
    "Payment: The AMC fee is due within 7 days of activation. Service can pause for non-payment. GST is extra.",
    "Price validity: The quotation is valid for the days written on it; spare-part prices follow market rates at the time of replacement.",
    "Our liability limit: Maximum liability is the annual AMC fee. No liability for fire incidents if you declined recommended repairs.",
    "Renewal & ending: Does not auto-renew. 30 days notice to cancel; refund only for visits not done yet.",
    "Legal: Indian law applies. Any dispute goes to Surat, Gujarat courts only.",
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
AMC_AGREEMENT_VERSION = "2.0"
AMC_AGREEMENT_CLAUSES = [
    ("What the contract covers",
     "Regular inspection, testing and servicing of the listed fire equipment, at your site, for 12 months from activation. "
     "This Annual Maintenance Contract covers periodic inspection, testing, and routine servicing of the fire-safety equipment "
     "listed in this agreement, at the registered site only, for a period of twelve (12) months from activation."),
    ("Number of visits",
     "As many visits as written in the quotation, spread across the year. Extra visits on request are charged. "
     "Northern Star Engineering will conduct the agreed number of scheduled visits spaced evenly across the contract year."),
    ("Emergency visits",
     "If something breaks between visits, we come on priority. Travel and labour are covered; spare parts are charged extra. "
     "Reactive breakdown calls between scheduled visits are prioritized; replacement materials are quoted separately."),
    ("What's included",
     "Routine servicing labour, cleaning and small fittings for the covered equipment are included in the AMC fee."),
    ("What's not included",
     "Replacing dead or damaged parts, refilling extinguishers, cylinder / hose / glass replacement, "
     "building electrical or plumbing work, or equipment added later without telling us."),
    ("Spare parts",
     "If parts are needed, we send a separate quotation for your approval. You may say no — but then we are not responsible "
     "if a fire incident happens because of the declined repair. A formal liability waiver is recorded upon decline."),
    ("Site access",
     "You must give us safe access to all equipment on the visit date (power, water, keys). If the site isn't ready, "
     "that visit counts as done and will not be carried forward."),
    ("Changing the date",
     "Tell us at least 48 hours before; we will fix another date within the contract period."),
    ("Old equipment",
     "For already-installed equipment, we only maintain it. Defects found at the first inspection are reported to you; "
     "fixing them is charged extra outside the routine AMC scope."),
    ("Warranties",
     "Only the manufacturer's warranty applies; the AMC does not extend or substitute manufacturer warranties."),
    ("Standards",
     "Work follows Indian fire standards (NBC, BIS/IS). Statutory Fire NOC help is a separate service subject to fire officer inspection."),
    ("Your responsibilities",
     "Keep equipment clean and reachable, report faults quickly, don't let anyone else service it during the contract, and use it properly."),
    ("Reports",
     "You get a service report after every visit — please check and acknowledge it. Digital reports accessed via customer portal or email count as valid records."),
    ("Payment",
     "The AMC fee is due within 7 days of activation. Service can pause for non-payment. GST is extra (GST No. 24ALQPD0899P1ZD)."),
    ("Price validity",
     "The quotation is valid for the days written on it; spare-part prices follow market rates at the time of replacement."),
    ("Our liability limit",
     "Maximum liability is the annual AMC fee. No liability for fire incidents if you declined recommended repairs."),
    ("Renewal & ending",
     "Does not auto-renew. 30 days notice to cancel; refund only for visits not done yet."),
    ("Legal",
     "Indian law applies. Any dispute goes to Surat, Gujarat courts only."),
    ("For taken-over sites",
     "Entered 'as-is' after joint inspection. Working equipment maintained; pre-existing defects quoted separately."),
    ("Free first year",
     "If 1st year AMC is free as agreed, all terms apply; renewal in year 2 is chargeable at prevailing rates."),
]


def staff_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated:
            return redirect(url_for("auth.login"))
        if not current_user.is_staff:
            if current_user.role == "customer":
                flash("Staff console is for staff only. You have been redirected to your customer portal.", "info")
                return redirect(url_for("portal.dashboard"))
            abort(403)
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated:
            return redirect(url_for("auth.login"))
        if not current_user.is_admin:
            if current_user.is_technician:
                flash("This section requires administrator privileges.", "warning")
                return redirect(url_for("admin.day_plan"))
            if current_user.role == "customer":
                return redirect(url_for("portal.dashboard"))
            abort(403)
        return fn(*args, **kwargs)
    return wrapper


def manager_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated:
            return redirect(url_for("auth.login"))
        if not current_user.is_manager:
            if current_user.is_technician:
                flash("This section requires manager privileges.", "warning")
                return redirect(url_for("admin.day_plan"))
            if current_user.role == "customer":
                return redirect(url_for("portal.dashboard"))
            abort(403)
        return fn(*args, **kwargs)
    return wrapper


def team_leader_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated:
            return redirect(url_for("auth.login"))
        if not (current_user.is_team_leader or current_user.is_admin):
            if current_user.is_technician:
                flash("This section is restricted to team leaders and managers.", "warning")
                return redirect(url_for("admin.day_plan"))
            if current_user.role == "customer":
                return redirect(url_for("portal.dashboard"))
            abort(403)
        return fn(*args, **kwargs)
    return wrapper


def customer_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated:
            return redirect(url_for("auth.login"))
        if current_user.role != "customer":
            flash("Customer portal is for customers only.", "warning")
            if current_user.is_technician:
                return redirect(url_for("admin.day_plan"))
            return redirect(url_for("admin.dashboard"))
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
DEFAULT_ALLOWED_EXT = {
    "png", "jpg", "jpeg", "gif", "webp",
    "pdf", "doc", "docx",
    "mp4", "mov", "webm", "m4v", "avi",
    "wav", "mp3", "ogg", "m4a", "aac",
}


def _allowed(filename, allowed_ext):
    if not allowed_ext:
        allowed_ext = current_app.config.get("ALLOWED_ALL_UPLOADS") or DEFAULT_ALLOWED_EXT
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_ext


def save_upload(file_storage, subdir="general", allowed_ext=None):
    """Persist an uploaded file and return a reference for later rendering.

    Backends supported:
      * Vercel Blob (when BLOB_READ_WRITE_TOKEN is set) — returns an absolute
        https:// URL. Used in production on Vercel.
      * Supabase Storage (when SUPABASE_STORAGE_BUCKET and SUPABASE_URL + SUPABASE_KEY are set)
        — returns an absolute https:// URL pointing to the public bucket object.
      * Local disk (dev fallback) — writes under static/uploads/<subdir>/ and returns a
        path relative to the static folder (for url_for('static', filename=...)).

    All forms are resolved for templates/links by `upload_url()` below.
    """
    if not file_storage or not file_storage.filename:
        return None
    if not _allowed(file_storage.filename, allowed_ext):
        return None
    safe = secure_filename(file_storage.filename) or "upload"
    unique = f"{uuid.uuid4().hex[:8]}_{safe}"

    # 1. Vercel Blob (production)
    token = current_app.config.get("BLOB_READ_WRITE_TOKEN")
    if token:
        try:
            return _save_to_blob(file_storage, f"{subdir}/{unique}", token)
        except Exception as e:
            current_app.logger.warning("Vercel Blob upload failed, falling back: %s", e)

    # 2. Supabase Storage (cloud deployment alternative)
    sb_bucket = current_app.config.get("SUPABASE_STORAGE_BUCKET") or os.getenv("SUPABASE_STORAGE_BUCKET")
    sb_url = current_app.config.get("SUPABASE_URL") or os.getenv("SUPABASE_URL")
    sb_key = (
        current_app.config.get("SUPABASE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
    )
    if sb_bucket and sb_url and sb_key:
        try:
            return _save_to_supabase(file_storage, f"{subdir}/{unique}", sb_url, sb_key, sb_bucket)
        except Exception as e:
            current_app.logger.warning("Supabase Storage upload failed, falling back: %s", e)

    # 3. Local disk (dev / fallback)
    dest_dir = os.path.join(current_app.config["UPLOAD_FOLDER"], subdir)
    os.makedirs(dest_dir, exist_ok=True)
    file_storage.seek(0)
    file_storage.save(os.path.join(dest_dir, unique))
    return f"uploads/{subdir}/{unique}"


def _save_to_blob(file_storage, pathname, token):
    """Upload bytes to Vercel Blob via its REST API; return the public URL.

    We add our own uuid prefix for uniqueness, so we disable Blob's random
    suffix to keep the pathname predictable. Raises on a failed upload so the
    caller doesn't silently store a broken reference.
    """
    file_storage.seek(0)
    data = file_storage.read()
    file_storage.seek(0)
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


def _save_to_supabase(file_storage, pathname, supabase_url, supabase_key, bucket="uploads"):
    """Upload bytes to Supabase Storage REST API; return the public URL."""
    file_storage.seek(0)
    data = file_storage.read()
    file_storage.seek(0)
    base_url = supabase_url.rstrip("/")
    url = f"{base_url}/storage/v1/object/{bucket}/{pathname}"
    resp = requests.post(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {supabase_key}",
            "apikey": supabase_key,
            "Content-Type": file_storage.mimetype or "application/octet-stream",
            "x-upsert": "true",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return f"{base_url}/storage/v1/object/public/{bucket}/{pathname}"


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



# Terms & Conditions for Installation, System Work & Projects (non-AMC)
INSTALLATION_TERMS = [
    "Material taken in consideration is ISI-marked and original. Certificates of materials will be provided on request.",
    "Payment terms: 50% advance along with purchase order, 50% against delivery / installation completion.",
    "All prices are quoted as per BOQ and design by Northern Star Engineering. If dimensions change at site, quantities & price vary accordingly.",
    "Water and uninterrupted electricity required for installation, fabrication, testing, and commissioning shall be provided by the client at site free of cost.",
    "Civil work, structural cutting, core-drilling, masonry, and patching are in the client's scope unless explicitly specified in this quotation.",
    "Work shall commence within 7 days from the receipt of confirmed purchase order and advance payment.",
    "Equipment supplied carries manufacturer warranty against manufacturing defects for 12 months from delivery.",
    "Quotation is valid for 15 days from the date of issue. Piping and metal rates are subject to prevailing market variations.",
    "Statutory fire NOC approvals, government fees, and liaison expenses (if required) are chargeable extra at actuals.",
    "All disputes are subject to the exclusive jurisdiction of courts in Surat, Gujarat.",
]

def get_quotation_terms(q):
    """Return the correct list of terms and conditions for a quotation based on
    service_type, handover status, and complimentary AMC."""
    if not q:
        return list(AMC_QUOTATION_TERMS)
    st = (getattr(q, "service_type", None) or "amc").lower()
    if st == "audit":
        return list(AUDIT_TERMS)
    elif st == "amc":
        terms = list(AMC_QUOTATION_TERMS)
    else:
        # Other services carry installation/project terms
        terms = list(INSTALLATION_TERMS)
    is_handover = False
    is_free = False
    contract = getattr(q, "contract", None)
    if contract:
        if getattr(contract, "is_handover", False) or getattr(contract, "project_type", "") in ("existing", "handover"):
            is_handover = True
        if getattr(contract, "free_amc", False):
            is_free = True
    notes_lower = (getattr(q, "notes", "") or "").lower()
    proj_lower = (getattr(q, "project_name", "") or "").lower()
    if "handover" in notes_lower or "handover" in proj_lower:
        is_handover = True
    if "free" in notes_lower or "complimentary" in notes_lower or (bool(getattr(q, "items", [])) and getattr(q, "grand_total", 1) == 0):
        is_free = True

    # For handovers, one extra condition is added to the terms (the site is taken “as-is” after the joint inspection)
    if is_handover:
        handover_clause = "For taken-over sites: Entered 'as-is' after joint inspection. Working equipment maintained; pre-existing defects quoted separately."
        if handover_clause not in terms:
            terms.append(handover_clause)

    # Free AMC adds a “first year free” line
    if is_free:
        free_line = "Free first year: If 1st year AMC is free as agreed, all terms apply; renewal in year 2 is chargeable at prevailing rates."
        if free_line not in terms:
            terms.insert(0, free_line)

    return terms
