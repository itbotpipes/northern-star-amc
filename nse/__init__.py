from datetime import date, datetime

from flask import Flask, request
from flask_login import current_user

from .config import Config
from .extensions import db, login_manager, mail
from .utils import rupees, upload_url


def create_app(config_class=Config, root=None):
    import os
    # If a project root is passed (e.g. from api/index.py on Vercel), use it to
    # build explicit absolute paths so Flask can find templates and static files
    # regardless of the working directory the serverless container uses.
    if root is None:
        root = os.path.dirname(os.path.abspath(__file__))  # nse/ package dir
        template_folder = os.path.join(root, "templates")
        static_folder   = os.path.join(root, "static")
    else:
        # root is the project root (parent of nse/)
        template_folder = os.path.join(root, "nse", "templates")
        static_folder   = os.path.join(root, "nse", "static")

    app = Flask(
        __name__,
        template_folder=template_folder,
        static_folder=static_folder,
    )

    app.config.from_object(config_class)
    app.config.setdefault("SERVER_PORT", int(os.getenv("PORT", "5055")))

    db.init_app(app)
    login_manager.init_app(app)
    mail.init_app(app)

    # Blueprints
    from .blueprints.public import public_bp
    from .blueprints.auth import auth_bp
    from .blueprints.portal import portal_bp
    from .blueprints.admin import admin_bp
    from .blueprints.chat import chat_bp
    from .blueprints.sq import sq_bp
    from .blueprints.api import api_bp   # JSON REST API for the mobile app

    app.register_blueprint(public_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(portal_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(sq_bp)
    app.register_blueprint(api_bp)

    # Jinja helpers
    app.jinja_env.filters["rupees"] = rupees
    app.jinja_env.filters["upload_url"] = upload_url
    app.jinja_env.globals.update(
        getattr=getattr,
        hasattr=hasattr,
        isinstance=isinstance,
        type=type,
        len=len,
        str=str,
        int=int,
        float=float,
        bool=bool,
        round=round,
        sum=sum,
        min=min,
        max=max,
        list=list,
        dict=dict,
        set=set,
        enumerate=enumerate,
        zip=zip,
        any=any,
        all=all,
    )

    @app.context_processor
    def inject_globals():
        from .models import Notification, ServiceQuotation, SupportTicket
        unread = 0
        recent_notifications = []
        sq_action_count = 0
        reminder_count = 0
        open_ticket_count = 0
        renewal_count = 0
        open_lead_count = 0
        open_rework_count = 0
        if current_user and current_user.is_authenticated:
            unread = Notification.query.filter_by(
                user_id=current_user.id, read=False).count()
            recent_notifications = (Notification.query
                .filter_by(user_id=current_user.id)
                .order_by(Notification.created_at.desc())
                .limit(8).all())
            # Staff-only: quotations awaiting action + open tickets + payment reminders
            if current_user.is_staff:
                pending_sq = ServiceQuotation.query.filter(
                    ServiceQuotation.status.in_(
                        ["negotiation_requested", "accepted"])).all()
                sq_action_count = sum(
                    1 for q in pending_sq
                    if q.status == "negotiation_requested"
                    or q.contract is None or q.contract.status != "active")
                try:
                    from .reminders import payment_reminder_count
                    reminder_count = payment_reminder_count()
                except Exception:
                    reminder_count = 0
                try:
                    open_ticket_count = SupportTicket.query.filter(
                        SupportTicket.status.in_(["open", "acknowledged"])).count()
                except Exception:
                    open_ticket_count = 0
                try:
                    from .reminders import renewal_reminder_count
                    renewal_count = renewal_reminder_count()
                except Exception:
                    renewal_count = 0
                try:
                    from .models import Contract, ReworkItem, Enquiry
                    if current_user and current_user.is_authenticated and not getattr(current_user, "is_manager", False):
                        open_lead_count = Contract.query.filter(
                            Contract.inspection_technician_id == current_user.id,
                            Contract.lead_stage.in_(["new", "inspection_scheduled"])
                        ).count()
                        open_enquiry_count = Enquiry.query.filter(
                            Enquiry.assigned_to_id == current_user.id,
                            Enquiry.status.notin_(["closed", "responded"])
                        ).count()
                    else:
                        open_lead_count = Contract.query.filter(
                            Contract.lead_stage.isnot(None),
                            Contract.lead_stage != "rework").count()
                        open_enquiry_count = Enquiry.query.filter(Enquiry.status.in_(["new", "assigned"])).count()
                    open_rework_count = ReworkItem.query.filter_by(status="open").count()
                except Exception:
                    open_lead_count = 0
                    open_rework_count = 0
                    open_enquiry_count = 0
                # Process visit reminders + renewal/anniversary milestones
                # idempotently (fires notifications not yet sent).
                try:
                    from .reminders import process_visit_reminders, process_milestones
                    process_visit_reminders()
                    process_milestones()
                except Exception:
                    pass
        return {
            "COMPANY_NAME": app.config["COMPANY_NAME"],
            "COMPANY_CITY": app.config["COMPANY_CITY"],
            "COMPANY_TAGLINE": app.config["COMPANY_TAGLINE"],
            "EMERGENCY_HOTLINE": app.config["EMERGENCY_HOTLINE"],
            "COMPANY_PHONE": app.config["COMPANY_PHONE"],
            "COMPANY_EMAIL": app.config["COMPANY_EMAIL"],
            "COMPANY_ADDRESS": app.config["COMPANY_ADDRESS"],
            "COMPANY_UPI_ID": app.config.get("COMPANY_UPI_ID", ""),
            "GOOGLE_REVIEW_URL": app.config.get("GOOGLE_REVIEW_URL", "https://search.google.com/local/writereview?placeid=ChIJNorthernStarFire"),
            "AI_ENABLED": Config.ai_enabled(),
            "unread_notifications": unread,
            "recent_notifications": recent_notifications,
            "sq_action_count": sq_action_count,
            "payment_reminder_count": reminder_count,
            "open_ticket_count": open_ticket_count,
            "renewal_reminder_count": renewal_count,
            "open_lead_count": open_lead_count,
            "open_rework_count": open_rework_count,
            "open_enquiry_count": open_enquiry_count if current_user and current_user.is_authenticated and current_user.is_staff else 0,
            "RAZORPAY_ENABLED": Config.razorpay_enabled(),
            "can_see_customer_contact": (
                bool(current_user and getattr(current_user, "is_authenticated", False) and (
                    getattr(current_user, "is_manager", False) or
                    getattr(current_user, "is_admin", False) or
                    getattr(current_user, "role", None) in ("owner", "customer")
                ))
            ),
            "now": datetime.utcnow(),
            "today": date.today(),
        }

    @app.template_filter("privacy_phone")
    def privacy_phone(phone):
        if not phone:
            return "—"
        if current_user and current_user.is_authenticated and getattr(current_user, "is_staff", False) and not getattr(current_user, "is_manager", False):
            digits = "".join(filter(str.isdigit, str(phone)))
            if len(digits) >= 10:
                return f"+91 ••••• ••{digits[-2:]} [Office Only]"
            return "•••••••••• [Protected]"
        return phone

    @app.template_filter("privacy_email")
    def privacy_email(email):
        if not email:
            return "—"
        if current_user and current_user.is_authenticated and getattr(current_user, "is_staff", False) and not getattr(current_user, "is_manager", False):
            parts = str(email).split("@")
            if len(parts) == 2:
                return f"{parts[0][:2]}••••@{parts[1]} [Protected]"
            return "••••@••••.com [Protected]"
        return email

    @app.template_filter("datefmt")
    def datefmt(value, fmt="%d %b %Y"):
        if not value:
            return "—"
        return value.strftime(fmt)

    @app.after_request
    def _no_cache_html(response):
        """Every page here is dynamic/session-specific (notifications, role-gated
        content, live statuses) — never let a browser serve a stale cached copy.
        This matters a lot during phone-based testing: Safari's back-forward
        cache in particular will happily show a page from before your last
        template edit unless the response explicitly forbids it. Static files
        (CSS/JS/images/uploads) are left alone so they keep normal caching."""
        if not request.path.startswith("/static/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
        return response

    with app.app_context():
        try:
            db.create_all()
        except Exception as e:
            app.logger.warning(f"db.create_all deferred: {e}")
        # Safe idempotent schema auto-sync for newly added columns (PostgreSQL & SQLite)
        try:
            from sqlalchemy import text
            with db.engine.begin() as conn:
                for table, cols in [
                    ("contracts", [
                        ("cash_collected_amount", "DOUBLE PRECISION"),
                        ("cash_collected_by_id", "INTEGER REFERENCES users(id)"),
                        ("cash_collected_at", "TIMESTAMP"),
                        ("cash_collected_notes", "TEXT"),
                        ("cash_collection_status", "VARCHAR(30) DEFAULT 'none'"),
                        ("voice_note", "VARCHAR(255)"),
                        ("free_amc", "BOOLEAN DEFAULT FALSE"),
                        ("project_type", "VARCHAR(50) DEFAULT 'amc'"),
                        ("spoc_name", "VARCHAR(120)"),
                        ("spoc_phone", "VARCHAR(20)"),
                        ("spoc_role", "VARCHAR(60)"),
                        ("handover_engineer", "VARCHAR(120)"),
                        ("handover_technician", "VARCHAR(120)"),
                        ("handover_signed_at", "TIMESTAMP"),
                        ("handover_doc_path", "VARCHAR(255)"),
                        ("handover_report_id", "INTEGER REFERENCES health_check_reports(id)")
                    ]),
                    ("quotations", [
                        ("cash_collected_amount", "DOUBLE PRECISION"),
                        ("cash_collected_by_id", "INTEGER REFERENCES users(id)"),
                        ("cash_collected_at", "TIMESTAMP"),
                        ("cash_collected_notes", "TEXT"),
                        ("cash_collection_status", "VARCHAR(30) DEFAULT 'none'"),
                        ("waiver_text", "TEXT"),
                        ("rejection_acknowledged", "BOOLEAN DEFAULT FALSE"),
                        ("negotiation_note", "TEXT"),
                        ("staff_response", "TEXT")
                    ]),
                    ("service_quotations", [
                        ("cash_collected_amount", "DOUBLE PRECISION"),
                        ("cash_collected_by_id", "INTEGER REFERENCES users(id)"),
                        ("cash_collected_at", "TIMESTAMP"),
                        ("cash_collected_notes", "TEXT"),
                        ("cash_collection_status", "VARCHAR(30) DEFAULT 'none'"),
                        ("staff_response", "TEXT")
                    ]),
                    ("visits", [
                        ("custom_label", "VARCHAR(120)"),
                        ("visit_type", "VARCHAR(50) DEFAULT 'regular'")
                    ]),
                    ("support_tickets", [
                        ("source", "VARCHAR(50) DEFAULT 'portal'"),
                        ("category", "VARCHAR(50) DEFAULT 'complaint'"),
                        ("site_name", "VARCHAR(150)"),
                        ("caller_name", "VARCHAR(120)"),
                        ("caller_phone", "VARCHAR(30)"),
                        ("assigned_to_id", "INTEGER REFERENCES users(id)"),
                        ("scheduled_date", "DATE")
                    ])
                ]:
                    for col_name, col_type in cols:
                        try:
                            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
                        except Exception:
                            pass
                try:
                    conn.execute(text("ALTER TABLE support_tickets ALTER COLUMN customer_id DROP NOT NULL"))
                except Exception:
                    pass
        except Exception:
            pass

    @app.errorhandler(403)
    def forbidden_error(e):
        from flask import redirect, url_for, flash
        from flask_login import current_user
        if current_user and current_user.is_authenticated:
            if getattr(current_user, "is_technician", False):
                flash("Access restricted to authorized personnel.", "warning")
                return redirect(url_for("admin.day_plan"))
            elif getattr(current_user, "is_staff", False):
                flash("Access restricted to authorized personnel.", "warning")
                return redirect(url_for("admin.dashboard"))
            else:
                flash("Staff console is for authorized staff only. Redirected to your portal.", "info")
                return redirect(url_for("portal.dashboard"))
        flash("Please log in to continue.", "info")
        return redirect(url_for("auth.login"))

    return app