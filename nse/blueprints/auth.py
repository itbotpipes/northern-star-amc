import re
from flask import (Blueprint, render_template, request, redirect, url_for,
                   flash, session, current_app, jsonify)
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


def _find_staff_by_phone(phone_input):
    if not phone_input:
        return None
    raw = str(phone_input).strip()
    clean = _clean_phone(raw)
    if not clean:
        return None
    # 1. Exact raw match
    u = User.query.filter(User.phone == raw, User.role != "customer").first()
    if u and u.is_staff:
        return u
    # 2. Variants
    variants = [clean, f"+91{clean}", f"+91 {clean}", f"0{clean}"]
    u = User.query.filter(User.phone.in_(variants), User.role != "customer").first()
    if u and u.is_staff:
        return u
    # 3. Last 10 digits
    if len(clean) >= 10:
        last10 = clean[-10:]
        u = User.query.filter(User.phone.endswith(last10), User.role != "customer").first()
        if u and u.is_staff:
            return u
    return None


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
    phone = request.args.get("phone", "")
    staff = request.args.get("staff", "")
    return render_template("auth/login.html", phone=phone, staff=staff)


@auth_bp.route("/check-phone", methods=["POST"])
def check_phone():
    data = request.get_json(silent=True) or request.form or {}
    phone = data.get("phone", "")
    staff = _find_staff_by_phone(phone)
    if staff:
        return jsonify({
            "is_staff": True,
            "role": staff.role,
            "role_title": staff.role.replace("_", " ").title(),
            "name": staff.name,
        })
    return jsonify({"is_staff": False})


# --------------------------------------------------------------------------- #
# Customer login via phone OTP / Staff intercept
# --------------------------------------------------------------------------- #
@auth_bp.route("/otp/request", methods=["POST"])
def otp_request():
    raw_phone = (request.form.get("phone") or "").strip()
    clean = _clean_phone(raw_phone)
    if len(clean) != 10:
        flash("Please enter a valid 10-digit mobile number.", "danger")
        return redirect(url_for("auth.login"))

    # Check if this is a staff user
    staff_user = _find_staff_by_phone(raw_phone)
    if staff_user:
        # Redirect directly to login with staff password prompt enabled
        flash(f"Welcome, {staff_user.name} ({staff_user.role.replace('_', ' ').title()}). Please enter your password.", "info")
        return redirect(url_for("auth.login", phone=clean, staff=1))

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
    clean = _clean_phone(phone)
    if not phone or len(clean) != 10 or not verify_otp(phone, code):
        flash("Invalid or expired OTP. Please try again.", "danger")
        return redirect(url_for("auth.login"))

    # Block staff members from signing into customer portal via OTP
    staff_user = _find_staff_by_phone(phone)
    if staff_user:
        flash("Staff members must sign in with their password.", "warning")
        return redirect(url_for("auth.login", phone=clean, staff=1))

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
# Staff login via phone / email + password
# --------------------------------------------------------------------------- #
@auth_bp.route("/staff-login", methods=["POST"])
@auth_bp.route("/staff", methods=["POST"])
def staff_login():
    identifier = (request.form.get("identifier") or request.form.get("phone") or request.form.get("email") or "").strip()
    password = request.form.get("password") or ""
    clean = _clean_phone(identifier)

    # 1. Try finding by phone
    user = _find_staff_by_phone(identifier)
    # 2. Try email if not found
    if not user and "@" in identifier:
        user = User.query.filter(User.email.ilike(identifier), User.role != "customer").first()
    elif not user:
        user = User.query.filter(
            ((User.phone == identifier) | (User.email.ilike(identifier))),
            User.role != "customer"
        ).first()

    if user and user.is_staff and user.check_password(password):
        login_user(user)
        flash(f"Welcome back, {user.name} ({user.role.replace('_', ' ').title()}).", "success")
        return redirect(_home_for(user))

    flash("Invalid password or credentials for staff account.", "danger")
    return redirect(url_for("auth.login", phone=clean or identifier, staff=1))


# --------------------------------------------------------------------------- #
# Staff Forgot Password Flow
# --------------------------------------------------------------------------- #
@auth_bp.route("/forgot-password", methods=["GET"])
def forgot_password():
    phone = request.args.get("phone", "")
    return render_template("auth/forgot_password.html", phone=phone)


@auth_bp.route("/forgot-password/request", methods=["POST"])
def forgot_password_request():
    raw_phone = (request.form.get("phone") or "").strip()
    clean = _clean_phone(raw_phone)
    if len(clean) != 10:
        flash("Please enter a valid 10-digit registered mobile number.", "danger")
        return redirect(url_for("auth.forgot_password", phone=raw_phone))

    staff_user = _find_staff_by_phone(raw_phone)
    if not staff_user:
        flash("No staff account found with this phone number. For customer accounts, simply use OTP login.", "warning")
        return redirect(url_for("auth.forgot_password", phone=raw_phone))

    code = generate_otp(raw_phone)
    session["staff_reset_phone"] = raw_phone
    dev_code = code if not current_app.config.get("SMS_ENABLED") else None
    flash(f"Password reset OTP sent for {staff_user.name}.", "info")
    return render_template(
        "auth/forgot_password_reset.html",
        phone=raw_phone,
        dev_code=dev_code,
        staff_name=staff_user.name,
        staff_role=staff_user.role.replace("_", " ").title()
    )


@auth_bp.route("/forgot-password/reset", methods=["POST"])
def forgot_password_reset():
    phone = session.get("staff_reset_phone") or request.form.get("phone")
    code = (request.form.get("code") or "").strip()
    new_password = (request.form.get("password") or "").strip()
    confirm_password = (request.form.get("confirm_password") or "").strip()
    clean = _clean_phone(phone)

    if not phone or not verify_otp(phone, code):
        flash("Invalid or expired OTP code. Please try again.", "danger")
        return redirect(url_for("auth.forgot_password", phone=phone))

    if len(new_password) < 6:
        flash("Password must be at least 6 characters long.", "danger")
        return render_template(
            "auth/forgot_password_reset.html",
            phone=phone,
            dev_code=None,
            staff_name="Staff Member",
            staff_role="Staff"
        )

    if new_password != confirm_password:
        flash("Passwords do not match.", "danger")
        return render_template(
            "auth/forgot_password_reset.html",
            phone=phone,
            dev_code=None,
            staff_name="Staff Member",
            staff_role="Staff"
        )

    staff_user = _find_staff_by_phone(phone)
    if not staff_user:
        flash("Staff account not found.", "danger")
        return redirect(url_for("auth.login"))

    staff_user.set_password(new_password)
    db.session.commit()
    session.pop("staff_reset_phone", None)
    flash("Password reset successfully! You can now log in with your new password.", "success")
    return redirect(url_for("auth.login", phone=clean, staff=1))


@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    flash("You have been logged out.", "info")
    return redirect(url_for("public.home"))
