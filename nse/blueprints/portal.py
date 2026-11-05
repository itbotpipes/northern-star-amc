from datetime import datetime, timedelta, date

import io

from flask import (Blueprint, render_template, request, redirect, url_for,
                   flash, abort, send_from_directory, send_file, current_app)
from flask_login import login_required, current_user
from sqlalchemy import or_
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models import (Contract, Visit, Quotation, ServiceRequest, Payment,
                      Notification, RefillOrder, ServiceQuotation,
                      ServiceQuotationItem, CustomerJourneyEvent, VisitFeedback,
                      Equipment, HealthCheckReport, Referral, SupportTicket,
                      TicketAttachment, AMCPlan, VisitDefect, Enquiry, User)
from ..utils import (customer_required, notify, notify_staff, WAIVER_TEXT,
                     AMC_AGREEMENT_CLAUSES, AMC_AGREEMENT_VERSION, save_upload)
from ..email_service import (send_quote_accepted_alert, send_negotiation_alert)
from ..pdf_generator import (generate_quotation_pdf, generate_health_report_pdf,
                            generate_service_report_pdf, generate_amc_certificate_pdf,
                            generate_material_quotation_pdf)

portal_bp = Blueprint("portal", __name__, url_prefix="/portal")


# Note: Profile completion is guided via banner and new-user onboarding,
# without forcefully bouncing existing customers away from the dashboard.



def _own_contract(contract_id):
    c = db.session.get(Contract, contract_id)
    if not c or c.customer_id != current_user.id:
        abort(404)
    return c


@portal_bp.route("/")
@login_required
@customer_required
def dashboard():
    phone_digits = "".join(filter(str.isdigit, current_user.phone or ""))
    phone_last10 = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits

    contract_filters = [Contract.customer_id == current_user.id]
    if current_user.phone:
        contract_filters.append(Contract.applicant_phone == current_user.phone)
        if phone_last10:
            contract_filters.append(Contract.applicant_phone.ilike(f"%{phone_last10}%"))
    contracts = Contract.query.options(
        joinedload(Contract.customer), selectinload(Contract.visits)
    ).filter(or_(*contract_filters)).order_by(Contract.created_at.desc()).all()

    requests_ = ServiceRequest.query.filter_by(customer_id=current_user.id)\
        .order_by(ServiceRequest.created_at.desc()).all()

    # Service quotations (sales proposals) needing the customer's attention.
    # Match by customer_id OR phone so pre-login applications are always found.
    quote_filters = [ServiceQuotation.customer_id == current_user.id]
    if current_user.phone:
        quote_filters.append(ServiceQuotation.customer_phone == current_user.phone)
        if phone_last10:
            quote_filters.append(ServiceQuotation.customer_phone.ilike(f"%{phone_last10}%"))
    all_quotes = ServiceQuotation.query.options(
        joinedload(ServiceQuotation.items)
    ).filter(
        or_(*quote_filters),
        ServiceQuotation.status.in_(["sent", "viewed", "negotiation_requested"]),
    ).order_by(ServiceQuotation.created_at.desc()).all()

    # Separate into negotiation replied, negotiation in progress, and regular pending
    negotiation_replied_quotes = [
        q for q in all_quotes
        if q.staff_response and q.status in ("sent", "viewed", "negotiation_requested")
    ]
    negotiation_in_progress_quotes = [
        q for q in all_quotes
        if q.status == "negotiation_requested" and not q.staff_response
    ]
    pending_quotes = [
        q for q in all_quotes
        if q.status in ("sent", "viewed") and not q.staff_response
    ]

    refills = RefillOrder.query.filter_by(customer_id=current_user.id)\
        .order_by(RefillOrder.created_at.desc()).all()

    inquiry_filters = [Enquiry.customer_id == current_user.id]
    if current_user.phone:
        inquiry_filters.append(Enquiry.phone == current_user.phone)
        if phone_last10:
            inquiry_filters.append(Enquiry.phone.ilike(f"%{phone_last10}%"))
    inquiries = Enquiry.query.filter(or_(*inquiry_filters)).order_by(Enquiry.created_at.desc()).all()

    # Scheduled inspections (visible on customer dashboard like quotations)
    scheduled_inspections = []
    for c in contracts:
        if c.inspection_scheduled_date and c.status not in ("active", "completed", "cancelled", "expired"):
            hr_completed = any(hr.status == "completed" for hr in getattr(c, "health_reports", []))
            if not hr_completed:
                scheduled_inspections.append({
                    "id": c.id,
                    "type": "amc_request",
                    "reference": c.reference,
                    "service_name": "Fire Safety Site Inspection & Survey",
                    "site_name": c.site_name or c.applicant_name or f"AMC Application #{c.reference}",
                    "scheduled_date": c.inspection_scheduled_date,
                    "time_slot": "Standard Hours (10:00 AM – 06:00 PM)",
                    "technician": c.inspection_technician,
                    "technician_name": c.inspection_technician.name if c.inspection_technician else "Technician Assigned",
                    "technician_phone": c.inspection_technician.phone if c.inspection_technician else None,
                    "address": c.site_address or c.area or "On-Site",
                    "link": url_for("portal.amc_requests"),
                    "badge": "Inspection Scheduled",
                })

    for inq in inquiries:
        if inq.visit_scheduled_date and inq.status in ("site_visit_scheduled", "assigned") and not inq.visit_completed_at:
            scheduled_inspections.append({
                "id": inq.id,
                "type": "inquiry",
                "reference": inq.ref_code,
                "service_name": inq.service_requirement or "On-Site Fire Safety Inspection",
                "site_name": inq.name or f"Inquiry #{inq.ref_code}",
                "scheduled_date": inq.visit_scheduled_date,
                "time_slot": inq.visit_time_slot or "Standard Hours (10:00 AM – 06:00 PM)",
                "technician": inq.assigned_to,
                "technician_name": inq.assigned_to.name if inq.assigned_to else "Technician Assigned",
                "technician_phone": inq.assigned_to.phone if inq.assigned_to else None,
                "address": inq.address or inq.city or "On-Site",
                "link": url_for("portal.amc_requests"),
                "badge": "Site Visit Scheduled",
            })

    scheduled_inspections.sort(key=lambda x: x["scheduled_date"])

    # Contracts where AMC agreement is generated but not yet signed by customer
    unsigned_agreements = []
    for c in contracts:
        if not c.agreement_accepted and c.status not in ("cancelled", "rejected", "expired"):
            has_accepted_sq = any(sq.status == "accepted" for sq in getattr(c, "service_quotations", []))
            if (
                c.status == "active"
                or c.payment_status == "paid"
                or c.free_amc
                or c.lead_stage in ("pending_agreement", "agreement_pending", "agreement_ready", "quote_accepted")
                or (c.price and c.price > 0)
                or has_accepted_sq
            ):
                unsigned_agreements.append(c)

    # Only surface action buttons for services the customer actually uses.
    has_emergencies = any(r.request_type == "emergency" for r in requests_)
    has_refills = bool(refills)
    has_finalised_contract = any(
        c.status in ("active", "completed") or (c.agreement_accepted and c.payment_status == "paid")
        for c in contracts
    )
    return render_template("portal/dashboard.html", contracts=contracts,
                           requests=requests_, pending_quotes=pending_quotes,
                           negotiation_replied_quotes=negotiation_replied_quotes,
                           negotiation_in_progress_quotes=negotiation_in_progress_quotes,
                           scheduled_inspections=scheduled_inspections,
                           unsigned_agreements=unsigned_agreements,
                           refills=refills, inquiries=inquiries,
                           has_emergencies=has_emergencies, has_refills=has_refills,
                           has_finalised_contract=has_finalised_contract)


@portal_bp.route("/contract/<int:contract_id>")
@login_required
@customer_required
def contract(contract_id):
    c = _own_contract(contract_id)
    health_reports = HealthCheckReport.query.filter_by(
        contract_id=c.id, status="completed").order_by(
        HealthCheckReport.report_date.desc()).all()
    return render_template("portal/contract.html", c=c,
                           health_reports=health_reports)


# ─────────────────────────────────────────────────────────────────
# AMC maintenance agreement (click-through T&C, view-only)
# ─────────────────────────────────────────────────────────────────

@portal_bp.route("/contract/<int:contract_id>/agreement")
@login_required
@customer_required
def agreement(contract_id):
    c = _own_contract(contract_id)
    return render_template("portal/agreement.html", c=c,
                           clauses=AMC_AGREEMENT_CLAUSES,
                           version=AMC_AGREEMENT_VERSION)


@portal_bp.route("/contract/<int:contract_id>/agreement/accept", methods=["POST"])
@login_required
@customer_required
def agreement_accept(contract_id):
    c = _own_contract(contract_id)
    if c.agreement_accepted:
        flash("You have already accepted this agreement.", "info")
        return redirect(url_for("portal.contract", contract_id=c.id))
    if request.form.get("agree") not in ("1", "on", "true") and request.form.get("accepted") not in ("1", "on", "true"):
        flash("Please tick the box to confirm you have read and agree.", "warning")
        return redirect(url_for("portal.agreement", contract_id=c.id))
    c.agreement_accepted = True
    c.agreement_accepted_at = datetime.utcnow()
    c.agreement_version = AMC_AGREEMENT_VERSION

    # If the contract is paid or complimentary, activate it and schedule quarterly maintenance visits!
    if c.payment_status == "paid" or c.free_amc or c.price == 0:
        c.status = "active"
        c.lead_stage = "agreement_signed"
        if not c.start_date:
            from datetime import date
            c.start_date = date.today()
            c.end_date = c.start_date + timedelta(days=365)
        if not c.visits:
            n_visits = c.total_visits or 4
            interval = max(1, 365 // n_visits)
            for i in range(n_visits):
                db.session.add(Visit(
                    contract_id=c.id, visit_number=i + 1,
                    scheduled_date=c.start_date + timedelta(days=interval * i),
                    status="scheduled"
                ))
        db.session.add(CustomerJourneyEvent(
            customer_id=current_user.id, event_type="contract_activated",
            description=f"AMC contract {c.reference} is now live and active after agreement signed.",
            ref_type="contract", ref_id=c.id
        ))

    db.session.add(CustomerJourneyEvent(
        customer_id=current_user.id, event_type="agreement_accepted",
        description=f"Customer accepted and signed the AMC agreement (v{AMC_AGREEMENT_VERSION}) for {c.reference}",
        ref_type="contract", ref_id=c.id))
    db.session.commit()
    notify_staff(f"AMC agreement signed — {c.reference}",
                 f"{current_user.name} signed the maintenance agreement for {c.reference}.",
                 link=url_for("admin.contract", contract_id=c.id) + "?chime=1")
    flash("Thank you — your AMC agreement is confirmed.", "success_chime")
    return redirect(url_for("portal.contract", contract_id=c.id))


@portal_bp.route("/visit/<int:visit_id>")
@login_required
@customer_required
def visit(visit_id):
    v = db.session.get(Visit, visit_id)
    if not v or v.contract.customer_id != current_user.id:
        abort(404)
    return render_template("portal/visit.html", v=v)


@portal_bp.route("/report/<int:visit_id>")
@login_required
@customer_required
def report(visit_id):
    v = db.session.get(Visit, visit_id)
    if not v or v.contract.customer_id != current_user.id or not v.service_report_path:
        abort(404)
    path = v.service_report_path
    # On Vercel the report lives in Blob storage (absolute URL) — redirect there.
    if path.startswith(("http://", "https://")):
        return redirect(path)
    # Otherwise it's relative to the local static folder (dev).
    return send_from_directory(current_app.static_folder, path, as_attachment=True)


@portal_bp.route("/visit/<int:visit_id>/service-report.pdf")
@login_required
@customer_required
def service_report_pdf(visit_id):
    """NSE service report generated from the visit record. Pass ?view=1 to open
    inline in the browser (preview) instead of forcing a download."""
    v = db.session.get(Visit, visit_id)
    if not v or v.contract.customer_id != current_user.id:
        abort(404)
    pdf = generate_service_report_pdf(v)
    if not pdf:
        abort(500)
    inline = request.args.get("view") == "1"
    return send_file(io.BytesIO(pdf), mimetype="application/pdf",
                     as_attachment=not inline,
                     download_name=f"{v.contract.reference}-{v.label.replace(' ','')}.pdf")


@portal_bp.route("/visit/<int:visit_id>/approve", methods=["POST"])
@login_required
@customer_required
def visit_approve(visit_id):
    """Customer signs off a completed visit and submits the mandatory rating."""
    v = db.session.get(Visit, visit_id)
    if not v or v.contract.customer_id != current_user.id:
        abort(404)
    if v.status != "completed":
        flash("You can rate a visit once it is completed.", "warning")
        return redirect(url_for("portal.visit", visit_id=v.id))

    def _r(field):
        try:
            n = int(request.form.get(field, 0))
            return n if 1 <= n <= 5 else None
        except (ValueError, TypeError):
            return None

    overall = _r("rating_overall")
    if overall is None:
        flash("Please rate the visit before approving.", "warning")
        return redirect(url_for("portal.visit", visit_id=v.id))

    fb = VisitFeedback.query.filter_by(visit_id=v.id).first()
    if not fb:
        fb = VisitFeedback(visit_id=v.id, customer_id=current_user.id,
                           technician_id=v.technician_id)
        db.session.add(fb)
    fb.technician_id = v.technician_id
    fb.rating_behaviour = _r("rating_behaviour")
    fb.rating_quality = _r("rating_quality")
    fb.rating_punctuality = _r("rating_punctuality")
    fb.rating_communication = _r("rating_communication")
    fb.rating_overall = overall
    fb.comment = request.form.get("comment", "").strip() or None

    v.customer_approved = True
    v.approved_at = datetime.utcnow()
    db.session.add(CustomerJourneyEvent(
        customer_id=current_user.id, event_type="feedback_given",
        description=f"Customer rated {v.label} of {v.contract.reference} {overall}/5",
        ref_type="visit", ref_id=v.id))
    db.session.commit()

    # Notify the technician + ops console of the rating
    if v.technician_id:
        notify(v.technician_id, f"{overall}/5 — {v.label} rated",
               f"{current_user.name} rated {v.label} of {v.contract.reference} {overall}/5.",
               link=url_for("admin.visit", visit_id=v.id))
    notify_staff(f"Feedback received — {v.contract.reference} {v.label}",
                 f"{current_user.name} rated {overall}/5"
                 + (f": {fb.comment[:80]}" if fb.comment else "."),
                 link=url_for("admin.visit", visit_id=v.id))
    flash("Thank you! Your feedback has been shared with our team.", "success")

    # Check if review/referral prompt should appear
    if overall >= 4:
        good_ratings = VisitFeedback.query.filter(
            VisitFeedback.customer_id == current_user.id,
            VisitFeedback.rating_overall >= 4,
            VisitFeedback.rating_overall.isnot(None),
        ).count()
        existing_referral = Referral.query.filter_by(
            contract_id=v.contract_id,
            submitted_by_id=current_user.id,
        ).first()
        is_referral_target = (good_ratings >= 2 and not existing_referral)
        return redirect(url_for("portal.visit", visit_id=v.id,
                                prompt_review=1,
                                prompt_referral=1 if is_referral_target else 0))
    return redirect(url_for("portal.visit", visit_id=v.id))


@portal_bp.route("/quotation/<int:quote_id>")
@login_required
@customer_required
def quotation(quote_id):
    q = db.session.get(Quotation, quote_id)
    if not q or q.contract.customer_id != current_user.id:
        abort(404)
    return render_template("portal/quotation.html", q=q, waiver_text=WAIVER_TEXT)


@portal_bp.route("/quotation/<int:quote_id>/decide", methods=["POST"])
@login_required
@customer_required
def quotation_decide(quote_id):
    q = db.session.get(Quotation, quote_id)
    if not q or q.contract.customer_id != current_user.id:
        abort(404)
    if q.status != "pending":
        flash("This quotation has already been decided.", "warning")
        return redirect(url_for("portal.quotation", quote_id=q.id))

    decision = request.form.get("decision")
    if decision == "approve":
        q.status = "approved"
        q.payment_mode = request.form.get("payment_mode", "cash")
        q.decided_at = datetime.utcnow()
        db.session.add(Payment(customer_id=current_user.id, contract_id=q.contract_id,
                               quotation_id=q.id, amount=q.total,
                               mode=q.payment_mode, status="pending",
                               reference=q.reference))
        db.session.add(CustomerJourneyEvent(
            customer_id=current_user.id, event_type="quote_accepted",
            description=f"Customer approved material quotation {q.reference} (₹{q.total:,.0f})",
            ref_type="contract", ref_id=q.contract_id))
        db.session.commit()
        notify_staff(f"Quotation {q.reference} APPROVED",
                     f"{current_user.name} approved ₹{q.total:,.0f} of materials.",
                     link=url_for("admin.visit", visit_id=q.visit_id) if q.visit_id
                          else url_for("admin.contract", contract_id=q.contract_id))
        # chime flash → base.html plays the success chime on the next page
        flash("Quotation approved. Our team will schedule the replacement.", "success_chime")
        return redirect(url_for("portal.contract", contract_id=q.contract_id))
    elif decision == "reject":
        # Rejecting a recommended replacement requires accepting the liability
        # waiver. The portal shows it as a modal and posts waiver_accepted=1.
        if request.form.get("waiver_accepted") != "1":
            flash("Please confirm the liability waiver to decline the replacement.", "warning")
            return redirect(url_for("portal.quotation", quote_id=q.id))
        q.status = "rejected"
        q.decided_at = datetime.utcnow()
        q.rejection_acknowledged = True
        q.waiver_text = WAIVER_TEXT
        db.session.add(CustomerJourneyEvent(
            customer_id=current_user.id, event_type="quote_rejected",
            description=f"Customer declined {q.reference} and accepted the liability waiver",
            ref_type="contract", ref_id=q.contract_id))
        db.session.commit()
        notify_staff(f"Quotation {q.reference} DECLINED (waiver accepted)",
                     f"{current_user.name} declined the replacement. Next visit proceeds as scheduled.",
                     link=url_for("admin.visit", visit_id=q.visit_id) if q.visit_id
                          else url_for("admin.contract", contract_id=q.contract_id))
        flash("Recorded. The next visit will proceed as scheduled.", "info")
        return redirect(url_for("portal.contract", contract_id=q.contract_id))
    return redirect(url_for("portal.contract", contract_id=q.contract_id))


@portal_bp.route("/quotation/<int:quote_id>/reopen", methods=["POST"])
@login_required
@customer_required
def quotation_reopen(quote_id):
    """Client re-opens a rejected material quotation to negotiate / re-quote."""
    q = db.session.get(Quotation, quote_id)
    if not q or q.contract.customer_id != current_user.id:
        abort(404)
    if q.status != "rejected":
        flash("Only a rejected quotation can be re-opened.", "warning")
        return redirect(url_for("portal.quotation", quote_id=q.id))
    note = request.form.get("negotiation_note", "").strip()
    q.status = "pending"
    q.negotiation_note = note or None
    q.decided_at = None
    q.rejection_acknowledged = False
    q.waiver_text = None
    db.session.commit()
    notify_staff(
        f"Re-quote requested — {q.reference}",
        f"{current_user.name} wants to revisit quotation {q.reference}"
        + (f": {note[:100]}" if note else "."),
        link=url_for("admin.visit", visit_id=q.visit_id) if q.visit_id
             else url_for("admin.contract", contract_id=q.contract_id))
    flash("Your request has been sent. Our team will review and update the quotation shortly.", "success")
    return redirect(url_for("portal.quotation", quote_id=q.id))


@portal_bp.route("/quotation/<int:quote_id>/pdf")
@login_required
@customer_required
def quotation_pdf(quote_id):
    """Client-side PDF download for a visit-linked material quotation."""
    q = db.session.get(Quotation, quote_id)
    if not q or q.contract.customer_id != current_user.id:
        abort(404)
    pdf, filename = generate_material_quotation_pdf(q)
    if not pdf:
        abort(500)
    return send_file(io.BytesIO(pdf), mimetype="application/pdf",
                     as_attachment=True, download_name=filename)


@portal_bp.route("/health-report/<int:report_id>/pdf")
@login_required
@customer_required
def health_report_pdf(report_id):
    """Client download of a fire health checkup report (ownership-checked)."""
    r = db.session.get(HealthCheckReport, report_id)
    if not r or not r.contract_id:
        abort(404)
    contract = db.session.get(Contract, r.contract_id)
    if not contract or contract.customer_id != current_user.id:
        abort(404)
    pdf = generate_health_report_pdf(r)
    if not pdf:
        abort(500)
    inline = request.args.get("view") == "1"
    return send_file(io.BytesIO(pdf), mimetype="application/pdf",
                     as_attachment=not inline, download_name=f"{r.reference}.pdf")


@portal_bp.route("/requests")
@login_required
@customer_required
def requests_list():
    rs = ServiceRequest.query.filter_by(customer_id=current_user.id)\
        .order_by(ServiceRequest.created_at.desc()).all()
    refills = RefillOrder.query.filter_by(customer_id=current_user.id)\
        .order_by(RefillOrder.created_at.desc()).all()
    return render_template("portal/requests.html", requests=rs, refills=refills)


@portal_bp.route("/notifications/read")
@login_required
def mark_read():
    Notification.query.filter_by(user_id=current_user.id, read=False)\
        .update({"read": True})
    db.session.commit()
    return redirect(request.referrer or url_for("portal.dashboard"))


@portal_bp.route("/notifications")
@login_required
@customer_required
def notifications():
    notes = Notification.query.filter_by(user_id=current_user.id)\
        .order_by(Notification.created_at.desc()).limit(100).all()
    return render_template("portal/notifications.html", notes=notes)


@portal_bp.route("/notification/<int:notif_id>/open")
@login_required
def open_notification(notif_id):
    """Mark a notification read and immediately follow its link to the destination."""
    n = db.session.get(Notification, notif_id)
    if n and n.user_id == current_user.id:
        n.read = True
        db.session.commit()
        if n.link:
            return redirect(n.link)
    if getattr(current_user, "is_customer", False):
        return redirect(url_for("portal.notifications"))
    return redirect(url_for("admin.notifications"))


# ─────────────────────────────────────────────────────────────────
# Service Quotations (sales proposals)
# ─────────────────────────────────────────────────────────────────

@portal_bp.route("/service-quotations")
@login_required
@customer_required
def service_quotations():
    phone_digits = "".join(filter(str.isdigit, current_user.phone or ""))
    phone_last10 = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits
    
    # Match ServiceQuotation by customer_id or phone
    filter_cond = (ServiceQuotation.customer_id == current_user.id)
    if phone_last10:
        filter_cond = or_(filter_cond, ServiceQuotation.customer_phone.ilike(f"%{phone_last10}%"))
    
    sq_query = ServiceQuotation.query.filter(filter_cond)\
        .order_by(ServiceQuotation.created_at.desc()).all()
    
    # Also fetch visit-linked material quotations across customer contracts
    my_contracts = Contract.query.filter_by(customer_id=current_user.id).all()
    contract_ids = [c.id for c in my_contracts]
    mat_quotes = []
    if contract_ids:
        mat_quotes = Quotation.query.filter(Quotation.contract_id.in_(contract_ids))\
            .order_by(Quotation.created_at.desc()).all()
            
    # Segregation:
    # 1. New Enquiries & AMC:
    enquiry_quotes = [q for q in sq_query if q.service_type in ("amc", "audit") or q.inquiry_id]
    
    # 2. Material & Spares:
    material_quotes = [q for q in sq_query if q.service_type == "material"] + mat_quotes
    material_quotes.sort(key=lambda x: x.created_at, reverse=True)
    
    # 3. Visits & Service quotes:
    visit_quotes = [q for q in sq_query if q.service_type in ("repair", "emergency", "refilling") or (q.contract_id and q.service_type != "amc")]
    
    tab = request.args.get("tab", "all").strip().lower()
    if tab == "enquiries":
        display_items = [("sq", q) for q in enquiry_quotes]
    elif tab == "material":
        display_items = [("mat" if isinstance(q, Quotation) else "sq", q) for q in material_quotes]
    elif tab == "visits":
        display_items = [("sq", q) for q in visit_quotes]
    else:
        all_items = [("sq", q) for q in sq_query] + [("mat", q) for q in mat_quotes]
        all_items.sort(key=lambda x: x[1].created_at, reverse=True)
        display_items = all_items

    return render_template(
        "portal/sq_list.html",
        display_items=display_items,
        active_tab=tab,
        total_count=len(sq_query) + len(mat_quotes),
        enquiry_count=len(enquiry_quotes),
        material_count=len(material_quotes),
        visit_count=len(visit_quotes),
        quotations=sq_query,
    )


@portal_bp.route("/service-quotation/<int:sq_id>")
@login_required
@customer_required
def service_quotation(sq_id):
    sq = db.session.get(ServiceQuotation, sq_id)
    if not sq:
        abort(404)
    phone_digits = "".join(filter(str.isdigit, current_user.phone or ""))
    phone_last10 = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits
    sq_phone_digits = "".join(filter(str.isdigit, sq.customer_phone or ""))
    sq_phone_last10 = sq_phone_digits[-10:] if len(sq_phone_digits) >= 10 else sq_phone_digits
    is_owner = (sq.customer_id == current_user.id) or (phone_last10 and sq_phone_last10 and phone_last10 == sq_phone_last10)
    if not is_owner:
        abort(404)
    # Automatically associate customer_id if missing
    if not sq.customer_id:
        sq.customer_id = current_user.id
        db.session.commit()
    # Mark as viewed
    if sq.status == "sent":
        sq.status = "viewed"
        sq.viewed_at = datetime.utcnow()
        db.session.add(CustomerJourneyEvent(
            customer_id=current_user.id,
            event_type="quote_viewed",
            description=f"Quotation {sq.reference} viewed by customer",
            ref_type="service_quotation", ref_id=sq.id,
        ))
        db.session.commit()
    sales_phone = current_app.config.get("SALES_MANAGER_PHONE", "+919687266625")
    return render_template("portal/sq_detail.html", sq=sq, sales_phone=sales_phone)


@portal_bp.route("/service-quotation/<int:sq_id>/pdf")
@login_required
def service_quotation_pdf(sq_id):
    sq = db.session.get(ServiceQuotation, sq_id) or abort(404)
    phone_digits = "".join(filter(str.isdigit, current_user.phone or ""))
    phone_last10 = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits
    sq_phone_digits = "".join(filter(str.isdigit, sq.customer_phone or ""))
    sq_phone_last10 = sq_phone_digits[-10:] if len(sq_phone_digits) >= 10 else sq_phone_digits
    is_owner = (sq.customer_id == current_user.id) or (phone_last10 and sq_phone_last10 and phone_last10 == sq_phone_last10)
    if not (current_user.is_staff or is_owner):
        abort(403)
    pdf = generate_quotation_pdf(sq)
    if not pdf:
        abort(500)
    return send_file(io.BytesIO(pdf), mimetype="application/pdf",
                     as_attachment=True, download_name=f"{sq.reference}.pdf")


@portal_bp.route("/service-quotation/<int:sq_id>/accept", methods=["POST"])
@login_required
@customer_required
def service_quotation_accept(sq_id):
    phone_digits = "".join(filter(str.isdigit, current_user.phone or ""))
    phone_last10 = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits
    sq = db.session.get(ServiceQuotation, sq_id)
    if not sq:
        abort(404)
    user_match = (
        sq.customer_id == current_user.id
        or (current_user.phone and sq.customer_phone == current_user.phone)
        or (phone_last10 and sq.customer_phone and phone_last10 in sq.customer_phone)
    )
    if not user_match:
        abort(404)
    if not sq.customer_id:
        sq.customer_id = current_user.id

    if sq.status not in ("sent", "viewed", "negotiation_requested"):
        flash("This quotation cannot be accepted at its current stage.", "warning")
        return redirect(url_for("portal.service_quotation", sq_id=sq_id))

    sq.status = "accepted"
    sq.responded_at = datetime.utcnow()
    db.session.add(CustomerJourneyEvent(
        customer_id=current_user.id,
        event_type="quote_accepted",
        description=f"Customer accepted {sq.reference} (₹{sq.grand_total:,.0f})",
        ref_type="service_quotation", ref_id=sq.id,
    ))
    db.session.commit()
    send_quote_accepted_alert(sq)
    notify_staff(
        f"Quotation {sq.reference} ACCEPTED",
        f"{sq.customer_name} accepted ₹{sq.grand_total:,.0f}. "
        f"{'Contract ' + sq.contract.reference + ' can now be activated.' if sq.contract else ''}".strip(),
        link=url_for("sq.detail_quotation", sq_id=sq.id) + "?chime=1")
    flash("Quotation accepted! Our team will contact you shortly to proceed.", "success_chime")
    return redirect(url_for("portal.service_quotation", sq_id=sq_id))


@portal_bp.route("/service-quotation/<int:sq_id>/reject", methods=["POST"])
@login_required
@customer_required
def service_quotation_reject(sq_id):
    phone_digits = "".join(filter(str.isdigit, current_user.phone or ""))
    phone_last10 = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits
    sq = db.session.get(ServiceQuotation, sq_id)
    if not sq:
        abort(404)
    user_match = (
        sq.customer_id == current_user.id
        or (current_user.phone and sq.customer_phone == current_user.phone)
        or (phone_last10 and sq.customer_phone and phone_last10 in sq.customer_phone)
    )
    if not user_match:
        abort(404)
    if not sq.customer_id:
        sq.customer_id = current_user.id

    if sq.status not in ("sent", "viewed", "negotiation_requested"):
        flash("This quotation cannot be declined at its current stage.", "warning")
        return redirect(url_for("portal.service_quotation", sq_id=sq_id))

    reason = request.form.get("rejection_reason", "").strip()
    sq.status = "rejected"
    sq.responded_at = datetime.utcnow()
    desc = f"Customer declined quotation {sq.reference}" + (f": {reason[:100]}" if reason else "")
    db.session.add(CustomerJourneyEvent(
        customer_id=current_user.id,
        event_type="quote_rejected",
        description=desc,
        ref_type="service_quotation", ref_id=sq.id,
    ))
    db.session.commit()
    notify_staff(
        f"Quotation {sq.reference} DECLINED",
        f"{sq.customer_name} declined quotation of ₹{sq.grand_total:,.0f}." + (f" Reason: {reason}" if reason else ""),
        link=url_for("sq.detail_quotation", sq_id=sq.id))
    flash("Quotation declined. You can contact our team anytime if your requirements change.", "info")
    return redirect(url_for("portal.service_quotation", sq_id=sq_id))


@portal_bp.route("/service-quotation/<int:sq_id>/negotiate", methods=["POST"])
@login_required
@customer_required
def service_quotation_negotiate(sq_id):
    phone_digits = "".join(filter(str.isdigit, current_user.phone or ""))
    phone_last10 = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits
    sq = db.session.get(ServiceQuotation, sq_id)
    if not sq:
        abort(404)
    user_match = (
        sq.customer_id == current_user.id
        or (current_user.phone and sq.customer_phone == current_user.phone)
        or (phone_last10 and sq.customer_phone and phone_last10 in sq.customer_phone)
    )
    if not user_match:
        abort(404)
    if not sq.customer_id:
        sq.customer_id = current_user.id

    if sq.status not in ("sent", "viewed") and not (sq.status == "negotiation_requested" and sq.staff_response):
        flash("Negotiation can only be requested on a pending quotation.", "warning")
        return redirect(url_for("portal.service_quotation", sq_id=sq_id))

    note = request.form.get("negotiation_note", "").strip()
    sq.status = "negotiation_requested"
    sq.negotiation_note = note
    sq.responded_at = datetime.utcnow()
    db.session.add(CustomerJourneyEvent(
        customer_id=current_user.id,
        event_type="negotiation_requested",
        description=f"Customer requested negotiation on {sq.reference}" + (f": {note[:80]}" if note else ""),
        ref_type="service_quotation", ref_id=sq.id,
    ))
    db.session.commit()
    send_negotiation_alert(sq)
    notify_staff(
        f"Negotiation requested on {sq.reference}",
        (f"{sq.customer_name}: {note[:120]}" if note else
         f"{sq.customer_name} wants to discuss the price / has a question."),
        link=url_for("sq.detail_quotation", sq_id=sq.id))
    flash("Your request has been sent. Our sales manager will call you shortly.", "info")
    return redirect(url_for("portal.service_quotation", sq_id=sq_id))


# ─────────────────────────────────────────────────────────────────
# Customer profile (extended fields: company, GST, photo)
# ─────────────────────────────────────────────────────────────────

@portal_bp.route("/profile", methods=["GET", "POST"])
@login_required
@customer_required
def profile():
    if request.method == "POST":
        f = request.form
        name = (f.get("name") or "").strip()
        new_email = (f.get("email") or "").strip() or None
        address = (f.get("address") or "").strip() or None
        area = (f.get("area") or "").strip() or None
        city = (f.get("city") or "").strip() or "Surat, Gujarat"

        # All details are MANDATORY except Company / Business Details
        if not name or not new_email or not address or not area or not city:
            flash("Full Name, Email, Area, City, and Address are mandatory.", "danger")
            return redirect(url_for("portal.profile"))

        if new_email and new_email != current_user.email:
            existing_email_user = User.query.filter(User.email == new_email, User.id != current_user.id).first()
            if existing_email_user:
                flash("That email address is already in use by another account.", "warning")
                return redirect(url_for("portal.profile"))
            current_user.email = new_email
        elif not new_email:
            flash("Email address is mandatory.", "danger")
            return redirect(url_for("portal.profile"))

        current_user.name         = name
        current_user.address      = address
        current_user.area         = area
        current_user.city         = city
        # Company / Business details are explicitly OPTIONAL
        current_user.company_name = (f.get("company_name") or "").strip() or None
        current_user.gst_number   = (f.get("gst_number") or "").strip() or None
        # Optional photo / ID card upload. A failed upload (e.g. read-only FS on
        # Vercel with no Blob token) must NOT block the rest of the profile from
        # saving — wrap it so the text details always persist.
        photo_warning = False
        photo_file = request.files.get("photo")
        if photo_file and photo_file.filename:
            try:
                path = save_upload(photo_file, f"profiles/user{current_user.id}",
                                   {"png", "jpg", "jpeg", "gif", "webp", "pdf"})
                if path:
                    current_user.photo_path = path
                else:
                    photo_warning = True
            except Exception:
                photo_warning = True
        try:
            db.session.commit()
        except SQLAlchemyError:
            # Almost always means the DB schema is missing a column this route
            # writes (company_name/gst_number/photo_path etc.) — e.g. a fresh
            # migration wasn't run against production Postgres yet. Without this
            # guard the whole request 500s and *nothing* on the page saves,
            # which looks like "the profile page just doesn't work."
            db.session.rollback()
            current_app.logger.exception("portal.profile: failed to save profile for user %s", current_user.id)
            flash("Sorry, we couldn't save your profile — please try again in a moment "
                  "or contact support if this keeps happening.", "danger")
            return redirect(url_for("portal.profile"))
        if photo_warning:
            flash("Your details were saved, but the photo could not be uploaded. "
                  "Please try a smaller image.", "warning")
        else:
            flash("Profile updated successfully. Welcome to your Northern Star portal!", "success")
        return redirect(url_for("portal.dashboard"))
    from ..reminders import payment_reminders
    my_reminders = payment_reminders(customer_id=current_user.id)
    return render_template("portal/profile.html", my_reminders=my_reminders)


# ─────────────────────────────────────────────────────────────────
# Referrals
# ─────────────────────────────────────────────────────────────────

@portal_bp.route("/contract/<int:contract_id>/refer", methods=["POST"])
@login_required
@customer_required
def submit_referral(contract_id):
    c = _own_contract(contract_id)
    f = request.form
    name = f.get("referee_name", "").strip()
    if not name:
        flash("Please enter the contact's name.", "warning")
        return redirect(url_for("portal.contract", contract_id=c.id))
    ref = Referral(
        contract_id=c.id,
        submitted_by_id=current_user.id,
        referee_name=name,
        referee_phone=f.get("referee_phone", "").strip() or None,
        referee_company=f.get("referee_company", "").strip() or None,
        referee_area=f.get("referee_area", "").strip() or None,
        notes=f.get("notes", "").strip() or None,
    )
    db.session.add(ref)
    db.session.add(CustomerJourneyEvent(
        customer_id=current_user.id, event_type="referral_submitted",
        description=f"Customer referred {name} for {c.reference}",
        ref_type="contract", ref_id=c.id))
    db.session.commit()
    notify_staff(
        f"New referral from {current_user.name}",
        f"{current_user.name} referred {name}"
        + (f" ({f.get('referee_phone','').strip()})" if f.get("referee_phone") else "")
        + f" against {c.reference}.",
        link=url_for("admin.contract", contract_id=c.id))
    flash("Thank you for the referral! Our team will reach out to them shortly.", "success_chime")
    return redirect(url_for("portal.contract", contract_id=c.id))


# ─────────────────────────────────────────────────────────────────
# Customer journey timeline
# ─────────────────────────────────────────────────────────────────

@portal_bp.route("/journey", endpoint="journey")
@login_required
@customer_required
def journey():
    """Customer journey timeline — all milestones, quotes, visits, payments."""
    events = (CustomerJourneyEvent.query
              .filter_by(customer_id=current_user.id)
              .order_by(CustomerJourneyEvent.created_at.desc())
              .all())
    return render_template("portal/journey.html", events=events)


@portal_bp.route("/amc-requests", endpoint="amc_requests")
@login_required
@customer_required
def amc_requests():
    """My AMC Requests page - tracks in-progress applications, site surveys, and quotes."""
    phone_digits = "".join(filter(str.isdigit, current_user.phone or ""))
    phone_last10 = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits
    contract_filters = [Contract.customer_id == current_user.id]
    if current_user.phone:
        contract_filters.append(Contract.applicant_phone == current_user.phone)
        if phone_last10:
            contract_filters.append(Contract.applicant_phone.ilike(f"%{phone_last10}%"))
    contracts = (Contract.query
                 .filter(or_(*contract_filters))
                 .order_by(Contract.created_at.desc())
                 .all())
    pending_requests = [
        c for c in contracts 
        if c.status == "pending" or (c.lead_stage and c.lead_stage in ("inquiry", "inspection_scheduled", "inspection_done", "quote_sent"))
    ]
    active_contracts = [
        c for c in contracts 
        if c.status in ("active", "completed")
    ]
    events = (CustomerJourneyEvent.query
              .filter_by(customer_id=current_user.id)
              .order_by(CustomerJourneyEvent.created_at.desc())
              .all())
    return render_template("portal/amc_requests.html",
                           pending_requests=pending_requests,
                           active_contracts=active_contracts,
                           all_contracts=contracts,
                           events=events)


# ─────────────────────────────────────────────────────────────────
# Wave 2 — Equipment list & detail pages
# ─────────────────────────────────────────────────────────────────

@portal_bp.route("/equipment")
@login_required
@customer_required
def equipment_list():
    """All fire safety equipment and devices across customer's contracts."""
    contracts = Contract.query.filter_by(customer_id=current_user.id).all()
    contract_ids = [c.id for c in contracts]
    equipments = (Equipment.query.filter(Equipment.contract_id.in_(contract_ids))
                  .order_by(Equipment.next_refill_date.asc().nullslast(), Equipment.name.asc())
                  .all()) if contract_ids else []
    
    overdue_count = sum(1 for eq in equipments if eq.refill_status == "overdue")
    due_soon_count = sum(1 for eq in equipments if eq.refill_status == "due_soon")
    ok_count = sum(1 for eq in equipments if eq.refill_status == "ok")

    return render_template("portal/equipment_list.html",
                           contracts=contracts, equipments=equipments,
                           overdue_count=overdue_count,
                           due_soon_count=due_soon_count,
                           ok_count=ok_count)


@portal_bp.route("/equipment/<int:equipment_id>")
@login_required
@customer_required
def equipment_detail(equipment_id):
    """Full history for one piece of equipment: refills, visits, status."""
    eq = db.session.get(Equipment, equipment_id)
    if not eq:
        abort(404)
    # Ownership check via contract
    contract = db.session.get(Contract, eq.contract_id)
    if not contract or contract.customer_id != current_user.id:
        abort(404)
    # Visits where this contract was serviced (proxy for equipment serviced)
    visits = (Visit.query
              .filter_by(contract_id=eq.contract_id)
              .filter(Visit.status == "completed")
              .order_by(Visit.completed_date.desc())
              .all())
    return render_template("portal/equipment_detail.html",
                           eq=eq, contract=contract, visits=visits)


# ─────────────────────────────────────────────────────────────────
# AMC Fire Safety Certificate (issued after 4th completed visit)
# ─────────────────────────────────────────────────────────────────

@portal_bp.route("/contract/<int:contract_id>/certificate")
@login_required
@customer_required
def amc_certificate(contract_id):
    """View (inline) or download the AMC Fire Safety Certificate PDF."""
    c = db.session.get(Contract, contract_id)
    if not c or c.customer_id != current_user.id:
        abort(404)
    if request.args.get("celebrate") == "1":
        return redirect(url_for("portal.contract", contract_id=c.id, celebrate="1", chime="1"))
    if not c.certificate_issued:
        flash("Your certificate will be available after your 4th completed visit.", "info")
        return redirect(url_for("portal.contract", contract_id=c.id))
    pdf = generate_amc_certificate_pdf(c)
    if not pdf:
        abort(500)
    as_attachment = request.args.get("view") != "1"
    return send_file(
        io.BytesIO(pdf),
        mimetype="application/pdf",
        as_attachment=as_attachment,
        download_name=f"NSE-Certificate-{c.reference}.pdf",
    )


# --------------------------------------------------------------------------- #
# Support Tickets / Complaints
# --------------------------------------------------------------------------- #

@portal_bp.route("/tickets")
@login_required
@customer_required
def tickets():
    """List all support tickets raised by this customer."""
    my_tickets = SupportTicket.query.filter_by(customer_id=current_user.id)\
        .order_by(SupportTicket.created_at.desc()).all()
    # Contracts for the "raise complaint" dropdown
    my_contracts = Contract.query.filter_by(customer_id=current_user.id)\
        .filter(Contract.status.in_(["active", "pending"])).all()
    return render_template("portal/tickets.html",
                           tickets=my_tickets, contracts=my_contracts)


@portal_bp.route("/tickets/raise", methods=["POST"])
@login_required
@customer_required
def raise_ticket():
    """Create a new support ticket (called from a modal form on any portal page)."""
    title       = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    voice_note  = request.form.get("voice_note", "").strip()
    contract_id = request.form.get("contract_id") or None
    visit_id    = request.form.get("visit_id") or None
    priority    = request.form.get("priority", "normal")

    if not title or not description:
        flash("Please fill in the title and description.", "warning")
        return redirect(request.referrer or url_for("portal.tickets"))

    # Ownership check
    if contract_id:
        c = db.session.get(Contract, int(contract_id))
        if not c or c.customer_id != current_user.id:
            contract_id = None
    if visit_id:
        v = db.session.get(Visit, int(visit_id))
        if not v or (v.contract and v.contract.customer_id != current_user.id):
            visit_id = None

    ticket = SupportTicket(
        customer_id=current_user.id,
        contract_id=int(contract_id) if contract_id else None,
        visit_id=int(visit_id) if visit_id else None,
        title=title,
        description=description,
        voice_note=voice_note or None,
        priority=priority,
    )
    db.session.add(ticket)
    db.session.flush()   # get ticket.id for attachments

    # Actual voice note audio upload (if recorded)
    voice_file = request.files.get("voice_audio")
    if voice_file and voice_file.filename:
        vpath = save_upload(voice_file, subdir="tickets")
        if vpath:
            ticket.voice_note = vpath

    # Photo / video attachments
    files = request.files.getlist("attachments")
    for f in files:
        if f and f.filename:
            ext = f.filename.rsplit(".", 1)[-1].lower()
            atype = "video" if ext in ("mp4", "mov", "avi", "webm") else "photo"
            path = save_upload(f, subdir="tickets")
            db.session.add(TicketAttachment(
                ticket_id=ticket.id, file_path=path, attachment_type=atype))

    db.session.commit()

    # Notify all staff
    notify_staff(
        f"New complaint: {ticket.reference}",
        f"{current_user.name} raised '{title}'.",
        link=url_for("admin.ticket_detail", ticket_id=ticket.id),
    )

    flash(f"Complaint {ticket.reference} submitted. Our team will respond within 24 hours.", "success")
    return redirect(url_for("portal.ticket_detail", ticket_id=ticket.id))


@portal_bp.route("/tickets/<int:ticket_id>")
@login_required
@customer_required
def ticket_detail(ticket_id):
    t = SupportTicket.query.filter_by(id=ticket_id,
                                      customer_id=current_user.id).first_or_404()
    return render_template("portal/ticket_detail.html", ticket=t)


@portal_bp.route("/tickets/<int:ticket_id>/retrigger", methods=["POST"])
@login_required
@customer_required
def retrigger_ticket(ticket_id):
    """Re-trigger an unresolved ticket as a reminder to staff (>24h no reply)."""
    t = SupportTicket.query.filter_by(id=ticket_id,
                                      customer_id=current_user.id).first_or_404()
    if not t.can_retrigger:
        flash("Ticket cannot be re-triggered yet — please wait 24 hours or until staff reply.", "info")
        return redirect(url_for("portal.ticket_detail", ticket_id=t.id))

    from datetime import datetime, timedelta, date
    t.retrigger_count = (t.retrigger_count or 0) + 1
    t.retriggered_at = datetime.utcnow()
    db.session.commit()

    notify_staff(
        f"Complaint reminder: {t.reference}",
        f"{current_user.name} re-triggered '{t.title}' — still awaiting acknowledgement.",
        link=url_for("admin.ticket_detail", ticket_id=t.id),
    )
    flash("Reminder sent to the team. We will respond shortly.", "success_chime")
    return redirect(url_for("portal.ticket_detail", ticket_id=t.id))


# =========================================================================== #
# Wave 11 — customer-initiated renewal, plan upgrade, defect acknowledgement
# =========================================================================== #
@portal_bp.route("/contract/<int:contract_id>/renew", methods=["POST"])
@login_required
@customer_required
def request_renewal(contract_id):
    """Customer asks to renew — notifies staff to raise a renewal quote."""
    c = _own_contract(contract_id)
    db.session.add(CustomerJourneyEvent(
        customer_id=current_user.id, event_type="quote_requested",
        description=f"Requested renewal of {c.reference}",
        ref_type="contract", ref_id=c.id))
    db.session.commit()
    notify_staff(f"Renewal requested — {c.reference}",
                 f"{current_user.name} wants to renew {c.reference}. Raise a renewal quote.",
                 link=url_for("admin.contract", contract_id=c.id))
    flash("Thanks! We'll prepare your renewal quotation and share it here shortly.",
          "success_chime")
    return redirect(url_for("portal.contract", contract_id=c.id))


@portal_bp.route("/contract/<int:contract_id>/upgrade", methods=["GET", "POST"])
@login_required
@customer_required
def upgrade_plan(contract_id):
    """Mid-contract plan upgrade — auto-creates a prorated ServiceQuotation for
    the difference between the current and the chosen higher plan."""
    c = _own_contract(contract_id)
    plans = AMCPlan.query.filter_by(active=True).order_by(AMCPlan.price).all()
    current_price = (c.plan.price if c.plan else c.price or 0)
    higher = [p for p in plans if p.price > current_price]

    if request.method == "POST":
        target = db.session.get(AMCPlan, int(request.form.get("plan_id"))) if request.form.get("plan_id") else None
        if not target or target.price <= current_price:
            flash("Choose a higher plan to upgrade to.", "warning")
            return redirect(url_for("portal.upgrade_plan", contract_id=c.id))
        # Prorate the difference over the remaining contract months.
        remaining_days = max(0, (c.end_date - datetime.utcnow().date()).days) if c.end_date else 365
        frac = min(1.0, max(0.0, remaining_days / 365.0))
        diff = int(round((target.price - current_price) * frac))
        sq = ServiceQuotation(
            service_type="amc", customer_name=current_user.name,
            customer_phone=current_user.phone, customer_email=current_user.email,
            project_name=c.site_name, customer_address=c.site_address,
            status="sent", sent_at=datetime.utcnow(),
            contract_id=c.id, customer_id=current_user.id,
            gst_percent=18.0, valid_days=15,
            notes=f"Mid-term upgrade of {c.reference}: "
                  f"{(c.plan.name if c.plan else 'current plan')} → {target.name}. "
                  f"Prorated for {remaining_days} days remaining.")
        sq.generate_number()
        db.session.add(sq)
        db.session.flush()
        db.session.add(ServiceQuotationItem(
            quotation_id=sq.id, category="AMC Upgrade",
            description=f"Upgrade to {target.name} (prorated difference, "
                        f"{remaining_days} days remaining)",
            unit="Job", quantity=1.0, rate=float(diff), sort_order=1))
        db.session.add(CustomerJourneyEvent(
            customer_id=current_user.id, event_type="quote_sent",
            description=f"Upgrade quote {sq.quotation_number} raised: {target.name}",
            ref_type="service_quotation", ref_id=sq.id))
        db.session.commit()
        notify_staff(f"Upgrade requested — {c.reference}",
                     f"{current_user.name} wants to upgrade to {target.name} "
                     f"(prorated ₹{diff:,.0f}).",
                     link=url_for("sq.detail_quotation", sq_id=sq.id))
        flash(f"Upgrade quote {sq.reference} prepared — review and accept it below.",
              "success_chime")
        return redirect(url_for("portal.service_quotation", sq_id=sq.id))

    return render_template("portal/upgrade.html", c=c, higher=higher,
                           current_price=current_price)


@portal_bp.route("/defect/<int:defect_id>/acknowledge", methods=["POST"])
@login_required
@customer_required
def acknowledge_defect(defect_id):
    d = db.session.get(VisitDefect, defect_id) or abort(404)
    if not d.contract or d.contract.customer_id != current_user.id:
        abort(404)
    if d.status == "open":
        d.status = "acknowledged"
        d.acknowledged_at = datetime.utcnow()
        db.session.commit()
        notify_staff(f"Defect {d.reference} acknowledged",
                     f"{current_user.name} acknowledged: {d.equipment_name}.",
                     link=url_for("admin.contract", contract_id=d.contract_id))
    flash("Thank you — we've noted your acknowledgement of this fault.", "success")
    return redirect(url_for("portal.contract", contract_id=d.contract_id))


@portal_bp.route("/service-quotation/<int:sq_id>/pay-online")
@login_required
@customer_required
def service_quotation_pay_online(sq_id):
    """Logged-in customer pays a quotation online via Razorpay (if configured)."""
    from .. import payments
    sq = db.session.get(ServiceQuotation, sq_id) or abort(404)
    if sq.customer_id != current_user.id and sq.customer_phone != current_user.phone:
        abort(404)
    if not payments.enabled():
        flash("Online payment is not enabled yet — please use UPI or contact us.", "info")
        return redirect(url_for("portal.service_quotation", sq_id=sq.id))
    order = payments.create_order(sq.grand_total, receipt=sq.reference,
                                  notes={"quotation": sq.reference})
    if not order:
        flash("Online payment is temporarily unavailable.", "warning")
        return redirect(url_for("portal.service_quotation", sq_id=sq.id))
    sq.gateway_order_id = order["id"]
    db.session.commit()
    return render_template("portal/checkout.html", sq=sq, order=order,
                           key_id=payments.key_id())


@portal_bp.route("/service-quotation/<int:sq_id>/pay-online/verify", methods=["POST"])
@login_required
@customer_required
def service_quotation_pay_online_verify(sq_id):
    from .. import payments
    sq = db.session.get(ServiceQuotation, sq_id) or abort(404)
    if sq.customer_id != current_user.id and sq.customer_phone != current_user.phone:
        abort(404)
    order_id = request.form.get("razorpay_order_id")
    payment_id = request.form.get("razorpay_payment_id")
    signature = request.form.get("razorpay_signature")
    if payments.verify_payment_signature(order_id, payment_id, signature):
        payments.mark_quote_paid(sq, payment_id=payment_id, method="online")
        notify_staff(f"Online payment received — {sq.reference}",
                     f"{sq.customer_name} paid ₹{sq.grand_total:,.0f} online.",
                     link=url_for("sq.detail_quotation", sq_id=sq.id))
        flash("Payment successful — thank you!", "success_chime")
    else:
        flash("We could not verify the payment. If money was deducted it will be reconciled.",
              "warning")
    return redirect(url_for("portal.service_quotation", sq_id=sq.id))
