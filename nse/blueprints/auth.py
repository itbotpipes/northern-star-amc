import re
from flask import (Blueprint, render_template, request, redirect, url_for,
                   flash, session, current_app)
from flask_login import login_user, logout_user, login_required, current_user

from ..extensions import db
from ..models import User
from ..utils import generate_otp, verify_otp

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def _clean_phone(raw):
    if not raw:
        return ""
    digits = re.sub(r"\D", "", str(raw).strip())
    if digits.startswith("91") and len(digits) == 12:
        return digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        return digits[1:]
    return digits


def _find_customer_by_phone(phone_input):
    if not phone_input:
        return None
    raw = str(phone_input).strip()
    clean = _clean_phone(raw)

    # 1. Exact match on raw string
    u = User.query.filter_by(phone=raw, role="customer").first()
    if u:
        return u

    # 2. Match on clean number and common prefix variants
    if clean:
        variants = [clean, f"+91{clean}", f"+91 {clean}", f"0{clean}"]
        u = User.query.filter(User.phone.in_(variants), User.role == "customer").first()
        if u:
            return u
        if len(clean) >= 10:
            last10 = clean[-10:]
            u = User.query.filter(User.phone.endswith(last10), User.role == "customer").first()
            if u:
                return u
    return None


def _home_for(user):
    if user.is_technician:
        return url_for("admin.day_plan")
    return url_for("admin.dashboard") if user.is_staff else url_for("portal.dashboard")


@auth_bp.route("/login")
def login():
    if current_user.is_authenticated:
        return redirect(_home_for(current_user))
    return render_template("auth/login.html")


# --------------------------------------------------------------------------- #
# Customer login via phone OTP
# --------------------------------------------------------------------------- #
@auth_bp.route("/otp/request", methods=["POST"])
def otp_request():
    raw_phone = (request.form.get("phone") or "").strip()
    if len(raw_phone) < 8:
        flash("Please enter a valid phone number.", "danger")
        return redirect(url_for("auth.login"))

    clean = _clean_phone(raw_phone)
    # Staff must log in with email and password
    staff_user = User.query.filter(
        (User.phone == raw_phone) |
        (User.phone.endswith(clean[-10:] if len(clean) >= 10 else clean)),
        User.role != "customer"
    ).first()
    if staff_user and staff_user.is_staff:
        flash("Staff accounts must log in with email and password.", "warning")
        return redirect(url_for("auth.login", tab="staff"))

    # Check whether this customer account already exists with a real name
    existing_user = _find_customer_by_phone(raw_phone)
    has_real_name = bool(
        existing_user and
        existing_user.name and
        not existing_user.name.startswith("Customer ") and
        existing_user.name.strip()
    )
    is_new_user = not has_real_name
    existing_name = existing_user.name if (existing_user and has_real_name) else None

    code = generate_otp(raw_phone)
    session["otp_phone"] = raw_phone
    # Dev flow: surface the code on screen (replace with real SMS in production).
    dev_code = code if not current_app.config.get("AI_ENABLED_SMS") else None
    flash("OTP sent to your phone.", "info")
    return render_template(
        "auth/verify.html",
        phone=raw_phone,
        dev_code=dev_code,
        is_new_user=is_new_user,
        existing_name=existing_name,
    )


@auth_bp.route("/otp/verify", methods=["POST"])
def otp_verify():
    phone = session.get("otp_phone") or request.form.get("phone")
    code = (request.form.get("code") or "").strip()
    name = (request.form.get("name") or "").strip()
    if not phone or not verify_otp(phone, code):
        flash("Invalid or expired OTP. Please try again.", "danger")
        return redirect(url_for("auth.login"))

    clean = _clean_phone(phone)
    # Block staff members from signing into customer portal via OTP
    staff_user = User.query.filter(
        (User.phone == phone) |
        (User.phone.endswith(clean[-10:] if len(clean) >= 10 else clean)),
        User.role != "customer"
    ).first()
    if staff_user and staff_user.is_staff:
        flash("Staff members must sign in with email and password.", "warning")
        return redirect(url_for("auth.login", tab="staff"))

    user = _find_customer_by_phone(phone)
    is_new = False
    if not user:
        user = User(
            role="customer",
            phone=phone,
            name=name or f"Customer {clean[-4:] if len(clean) >= 4 else phone[-4:]}"
        )
        db.session.add(user)
        db.session.commit()
        is_new = True
    else:
        # Existing user: update name only if currently generic "Customer XXXX" or blank, and a name was supplied
        if name and (not user.name or user.name.startswith("Customer ")):
            user.name = name
            db.session.commit()

    login_user(user)
    session.pop("otp_phone", None)

    # Profile page opens directly for NEW users only
    if is_new:
        flash(f"Welcome, {user.name}! Please take a moment to set up your profile details.", "info")
        return redirect(url_for("portal.profile", new_user=1))

    flash(f"Welcome back, {user.name}!", "success")
    return redirect(_home_for(user))


# --------------------------------------------------------------------------- #
# Staff login via email + password
# --------------------------------------------------------------------------- #
@auth_bp.route("/staff", methods=["POST"])
def staff_login():
    email = (request.form.get("email") or "").strip().lower()
    password = request.form.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if user and user.is_staff and user.check_password(password):
        login_user(user)
        flash(f"Welcome back, {user.name}.", "success")
        return redirect(_home_for(user))
    flash("Invalid staff credentials.", "danger")
    return redirect(url_for("auth.login"))


@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    flash("You have been logged out.", "info")
    return redirect(url_for("public.home"))
