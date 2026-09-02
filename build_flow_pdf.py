# -*- coding: utf-8 -*-
"""
build_flow_pdf.py — generates NSE_App_Flow.pdf, a developer-facing flowchart
of the entire Northern Star Engineering AMC platform.

Renders with xhtml2pdf (already in .venv — same engine the app uses for its
own PDFs), no new dependency. Run:

    .venv/bin/python build_flow_pdf.py

xhtml2pdf quirks learned the hard way (keep these in mind if editing):
  * Each SEPARATE <table> flowable gets big inter-element spacing, and a
    <table> nested inside a <td> inflates the row enormously. So a "page" is
    built as ONE table with many <tr> rows; boxes are direct styled <td> rows.
  * `<font size="N">` and CSS `padding` both make xhtml2pdf mis-scale row
    height. So fonts are set via CSS (font-size/color on the cell or a span),
    and there is NO padding — border + background-color give the box look,
    and thin spacer rows give vertical rhythm.
  * Side-by-side branches need ONE level of table nesting (unavoidable); each
    branch column is a direct styled <td> (no deeper nesting).
"""
from xhtml2pdf import pisa

P = "%"

# actor colour system: bg, border, text
C = {
    "customer": ("#eef4ff", "#2f6fed", "#1e3a8a"),
    "staff":    ("#fff5e6", "#d97706", "#7c2d12"),
    "system":   ("#eef7f0", "#17864a", "#14532d"),
    "decision": ("#f5f0ff", "#7c3aed", "#4c1d95"),
    "terminal": ("#f1f0ee", "#6b6b72", "#1b1c22"),
    "external": ("#fdecea", "#d23f3f", "#7f1d1d"),
}

def _txt(text, size, color, bold=True):
    b0, b1 = ("<b>", "</b>") if bold else ("", "")
    return f'<span style="font-size:{size}px;color:{color};">{b0}{text}{b1}</span>'

def rbox(text, kind="system", ref=None):
    bg, bd, tx = C[kind]
    ref_html = f'<br/>{_txt(ref, 7, bd, bold=False)}' if ref else ""
    return (f'<tr><td align="center" bgcolor="{bg}" '
            f'style="border:1.3px solid {bd};">'
            f'&nbsp;<br/>{_txt(text, 9, tx)}{ref_html}<br/>&nbsp;</td></tr>'
            + _spacer(4))

def rarrow(label=""):
    lab = f'&nbsp;&nbsp;{_txt(label, 7, "#8a8a90", bold=False)}' if label else ""
    return (f'<tr><td align="center">{_txt("&#8595;", 11, "#9a9aa2", bold=False)}{lab}</td></tr>')

def rbranch(pairs):
    n = len(pairs); w = int(100 / n)
    cells = ""
    for cond, kind, text, ref in pairs:
        bg, bd, tx = C[kind]
        ref_html = f'<br/>{_txt(ref, 7, bd, bold=False)}' if ref else ""
        cond_html = f'{_txt(cond, 7, "#7c3aed")}<br/>{_txt("&#8595;", 10, "#9a9aa2", bold=False)}<br/>' if cond else ""
        cells += (f'<td width="{w}{P}" valign="top">{cond_html}'
                  f'<table width="100{P}" cellspacing="0" cellpadding="0"><tr>'
                  f'<td align="center" bgcolor="{bg}" style="border:1.3px solid {bd};">'
                  f'&nbsp;<br/>{_txt(text, 8, tx)}{ref_html}<br/>&nbsp;</td></tr></table></td>')
    inner = (f'<table width="100{P}" cellspacing="4" cellpadding="0"><tr>{cells}</tr></table>')
    return f'<tr><td>{inner}</td></tr>' + _spacer(4)

def rh2(title):
    return (f'<tr><td bgcolor="#072076">&nbsp;<br/>&nbsp;&nbsp;'
            f'{_txt(title, 13, "#ffffff")}<br/>&nbsp;</td></tr>' + _spacer(6))

def rnote(text):
    return (f'<tr><td bgcolor="#faf8f2" style="border-left:3px solid #d97706;">'
            f'&nbsp;<br/>&nbsp;&nbsp;{_txt(text, 8, "#4a4b52", bold=False)}<br/>&nbsp;</td></tr>'
            + _spacer(4))

def rlegend():
    cells = ""
    labels = [
        ("Customer", "customer"), ("Staff", "staff"), ("System", "system"),
        ("Decision", "decision"), ("Start/End", "terminal"), ("External", "external"),
    ]
    for lbl, k in labels:
        bg, bd, tx = C[k]
        cells += (f'<td width="16{P}" align="center" bgcolor="{bg}" '
                  f'style="border:1px solid {bd};">{_txt(lbl, 7, tx, bold=False)}</td>'
                  f'<td width="1{P}"></td>')
    inner = f'<table width="100{P}" cellspacing="0" cellpadding="0"><tr>{cells}</tr></table>'
    return f'<tr><td>{inner}</td></tr>' + _spacer(6)

def _spacer(px):
    return f'<tr><td><span style="font-size:{px}px;">&nbsp;</span></td></tr>'

def page(rows):
    """Wrap a list of <tr> row-strings into ONE table = one logical page."""
    return (f'<table width="100{P}" cellspacing="0" cellpadding="0">'
            + "".join(rows) + '</table>')

def pagebreak():
    return '<div style="page-break-before:always;"></div>'

# ─────────────────────────────────────────────────────────────────────────────
pages = []

# ===== COVER =====
cover = [
    _spacer(80),
    f'<tr><td align="center">{_txt("Northern Star Engineering", 26, "#072076")}</td></tr>',
    _spacer(8),
    f'<tr><td align="center">{_txt("Fire Safety AMC Platform", 15, "#d97706")}</td></tr>',
    _spacer(10),
    f'<tr><td align="center">{_txt("Complete Application Flow &mdash; Developer Reference", 12, "#4a4b52", bold=False)}</td></tr>',
    _spacer(30),
    rnote("This document maps every operational flow in the platform end-to-end, flow by flow "
          "(Flow 1, Flow 2, &hellip;) with colour-coded flowcharts so a new developer can see who does "
          "what, in what order, and which route/model backs each step. Route references appear under "
          "each box (e.g. <b>public.apply</b> = the <b>apply()</b> view in <b>nse/blueprints/public.py</b>). "
          "Company tagline: <i>Enlightening Safety</i>."),
    _spacer(8),
    rlegend(),
    _spacer(16),
    rh2("0 &nbsp; System Architecture at a Glance"),
    rnote("One Flask app (app-factory in <b>nse/__init__.py</b>) serves <b>three web surfaces</b> plus a "
          "<b>JSON API</b> for the mobile app and <b>Tara</b>, the OpenRouter AI assistant. SQLite in dev, "
          "Postgres in production. No build step; Tailwind via CDN."),
    rbranch([
        ("PUBLIC (no login)", "terminal", "Marketing + intake forms:<br/>home, plans, apply, emergency,<br/>noc, refill, enquiry, /q/&lt;token&gt;", "public.py"),
        ("CUSTOMER PORTAL", "customer", "Contracts, visits, quotes,<br/>tickets, profile, journey<br/>(login: phone + OTP)", "portal.py"),
        ("OPS CONSOLE", "staff", "Staff back-office: leads,<br/>visits, quotes, renewals<br/>(login: email + password)", "admin.py + sq.py"),
    ]),
    rarrow("all backed by"),
    rbox("Shared models &amp; helpers &mdash; models.py (Contract is the spine), utils.py (notify, save_upload, "
         "geofence), ai.py (Tara), pdf_generator.py", "system"),
    _spacer(4),
    rnote("<b>Four roles</b> (User.role): <b>customer</b> &middot; <b>technician</b> &middot; <b>manager</b> "
          "&middot; <b>admin</b>. is_staff = technician/manager/admin. Decorators in utils.py gate every "
          "handler (customer_required, staff_required, admin_required)."),
]
pages.append(page(cover))

# ===== AUTH =====
auth = [
    rh2("1 &nbsp; Authentication"),
    rbranch([
        ("CUSTOMER", "customer", "Enter mobile number", "auth.login"),
        ("STAFF", "staff", "Enter email + password", "auth.login"),
    ]),
    rbranch([
        ("", "system", "Request OTP &mdash; dev code shown<br/>on screen (no SMS gateway yet)", "auth.otp_request"),
        ("", "system", "Verify password<br/>(pbkdf2:sha256)", "auth.staff_login"),
    ]),
    rbranch([
        ("verify", "customer", "User created on first verify<br/>&rarr; Customer Portal", "auth.otp_verify"),
        ("match", "staff", "Role routes to<br/>Ops Console", "_home_for(user)"),
    ]),
]
pages.append(page(auth))

# ===== FLOW 1 =====
flow1 = [
    rh2("FLOW 1 &nbsp; New AMC Lead (customer-initiated enquiry)"),
    rnote("A new site contacts NSE. The enquiry becomes a <b>Contract</b> row with "
          "<b>lead_stage='new'</b> and travels through the Leads pipeline in the Ops Console until it "
          "resolves into an active AMC, an audit-fee-only close, or a rework flag."),
    rbox("Customer taps &ldquo;+ New AMC&rdquo; (portal) or &ldquo;Apply for AMC&rdquo; (public)", "customer", "portal/dashboard.html &rarr; public.apply"),
    rarrow(),
    rbox("&ldquo;Send Enquiry&rdquo; form: site name, address, phone, the problem,<br/>photo/video upload, voice note, optional GPS location", "customer", "site/apply.html"),
    rarrow("POST"),
    rbox("Create Contract(status=pending, lead_stage='new', project_type='new')<br/>+ save attachments; link to existing customer by phone if found", "system", "public.apply()"),
    rarrow(),
    rbox("Manager gets a pop-up notification: &ldquo;New enquiry &mdash; NSE-AMC-XXXX&rdquo;", "external", "notify_managers()"),
    rarrow(),
    rbox("Manager opens Leads &rarr; Lead Detail, schedules a site inspection<br/>(date + assign technician), informs client of the date", "staff", "admin.leads / lead_detail / schedule_inspection"),
    rarrow("lead_stage &rarr; inspection_scheduled"),
    rbox("Technician (or manager) visits site &amp; fills the Fire Safety Health<br/>Checkup Report (FSHCR) &mdash; recording a SCORE and an OUTCOME", "staff", "admin.health_report (admin/health_report_form.html)"),
    rarrow("status=completed &rarr; branch on outcome"),
    rbranch([
        ("outcome = OK", "decision", "Fine now (or maintain later)<br/>&rarr; charge a lightweight<br/>one-line AUDIT FEE quote", "lead_decide: audit_fee"),
        ("outcome = ISSUES", "decision", "Site needs work &rarr;<br/>raise a full AMC quotation<br/>(&rarr; Flow 3)", "lead_decide: raise_quote"),
    ]),
    rarrow("issues path &rarr; ServiceQuotation created &amp; sent (sq.new_quotation) &rarr; Flow 3"),
    rnote("On accept &amp; pay, the contract is <b>activated</b>: the year&rsquo;s <b>Visit</b> rows are "
          "auto-generated, the agreement is presented, and the <b>customer profile</b> is saved (lead_stage "
          "clears). Activation is gated &mdash; staff cannot activate until the linked quote is accepted "
          "(admin.activate_contract checks Contract.can_activate)."),
]
pages.append(page(flow1))

# ===== FLOW 2 =====
flow2 = [
    rh2("FLOW 2 &nbsp; Project Handover (engineering &rarr; maintenance)"),
    rnote("An NSE-built site is handed from the engineering team to the maintenance (AMC) department. "
          "This is <b>staff-initiated</b> &mdash; there is no public form. Same Leads pipeline as Flow 1, but "
          "project_type='existing' unlocks SPOC fields, a rework path, and a complimentary (free) AMC option."),
    rbox("Manager opens Leads &rarr; &ldquo;+ New lead&rdquo; &rarr; toggles &ldquo;Existing / Handover&rdquo;", "staff", "admin.leads (POST)"),
    rarrow(),
    rbox("Records: site name, engineer name, client, SPOC (name / phone / role), address", "staff", "Contract(project_type='existing', spoc_*)"),
    rarrow(),
    rbox("Engineer + maintenance engineer do a JOINT site visit &amp; fill the FSHCR", "staff", "admin.health_report"),
    rarrow("status=completed &rarr; branch on outcome"),
    rbranch([
        ("NEEDS REWORK", "external", "Work maintenance can&rsquo;t do<br/>&rarr; flagged to the REWORK<br/>queue for the manager", "ReworkItem &rarr; admin.rework_list"),
        ("OK", "decision", "Start complimentary<br/>FREE AMC (1 yr from<br/>agreement + validity date)", "lead_decide: free_amc"),
        ("ISSUES", "decision", "Maintenance needed<br/>&rarr; PAID quotation<br/>(&rarr; Flow 3)", "lead_decide: raise_quote"),
    ]),
    rarrow("free / paid both converge"),
    rbox("Contract activated &rarr; Visit rows generated &rarr; agreement &rarr; visits begin (Flow 4)", "system", "admin.activate_contract / lead_decide free_amc"),
    _spacer(4),
    rnote("<b>Rework queue</b> is a manual tracker (per spec): a flagged list the manager works through &mdash; "
          "toggle open/done at admin.rework_toggle. No automation. Once cleared, the site can re-enter the "
          "quote / activate path."),
]
pages.append(page(flow2))

# ===== FLOW 3 =====
flow3 = [
    rh2("FLOW 3 &nbsp; Quotation Lifecycle (ServiceQuotation)"),
    rnote("The sales proposal for any service (AMC / NOC / refill / audit). Built by staff (or auto-created "
          "by the AMC apply flow) and shared with the client &mdash; including a <b>no-login link</b> for "
          "non-tech-savvy customers (society presidents, elderly owners) who won&rsquo;t install an app."),
    rbox("Staff creates / edits quotation (line items from the 1,273-item inventory)", "staff", "sq.new_quotation / sq.edit_quotation"),
    rarrow("status: draft"),
    rbox("Send to customer &mdash; email + WhatsApp link + QR (all free, no API)", "external", "sq.detail_quotation: public_url() + whatsapp_url()"),
    rarrow("status: sent"),
    rbranch([
        ("LOGGED-IN", "customer", "Views in portal &rarr;<br/>Accept / Negotiate / Reject", "portal.service_quotation_*"),
        ("NO-LOGIN LINK", "customer", "Opens /q/&lt;token&gt; &mdash; big-button<br/>senior-friendly page, no OTP", "public.public_quote"),
    ]),
    rarrow("status: viewed &rarr; negotiation_requested / accepted / rejected"),
    rbranch([
        ("NEGOTIATE", "staff", "Client note &rarr; staff<br/>revises rates &amp; re-sends", "sq.edit_quotation"),
        ("ACCEPT", "system", "Auto-create account,<br/>log journey, notify staff", "public_quote_pay / accept"),
        ("REJECT", "terminal", "Marked rejected<br/>(deletable while unpaid)", "status=rejected"),
    ]),
    rarrow("on accept &rarr; payment"),
    rbox("PAYMENT &mdash; UPI QR / cash / cheque (manual confirm) or Razorpay online (auto-confirm)", "external", "public_quote_upi / pay-online + sq.mark_paid"),
    rarrow("payment_status=paid; cascades to Contract"),
    rbox("If linked to an AMC contract &rarr; unlocks activation (Flow 1 / 2 tail)", "system", "Contract.can_activate / quote_locked_price"),
    _spacer(4),
    rnote("<b>Delete guard (new):</b> sq.delete_quotation removes a quote + its items, but is <b>blocked</b> "
          "once sq.is_paid or the linked contract is already active &mdash; those stay as a permanent record."),
]
pages.append(page(flow3))

# ===== FLOW 4 =====
flow4 = [
    rh2("FLOW 4 &nbsp; Visit Lifecycle (the AMC service visit)"),
    rbox("Contract activated &rarr; Visit rows auto-generated, evenly spaced over the year", "system", "admin.activate_contract &rarr; _generate_visits()"),
    rarrow("status: scheduled"),
    rbox("Technician Day Plan: sees today / next 7 days &rarr; Accept or Flag-conflict", "staff", "admin.day_plan / admin.confirm_visit"),
    rarrow(),
    rbox("Auto reminders fire at 30 / 7 / 1 days before &mdash; to customer AND technician", "external", "reminders.process_visit_reminders() (idempotent)"),
    rarrow("visit day"),
    rbox("Technician CHECK-IN &mdash; GPS captured, 100 m geofence enforced if the site<br/>has coords (customer notified: &ldquo;your technician has arrived&rdquo;)", "staff", "admin.visit_checkin (utils.meters_between)"),
    rarrow(),
    rbox("On site: maintenance CHECKLIST (12 std items) + work notes + photos<br/>+ log DEFECTS (photo, severity) + raise MATERIAL QUOTATION (Flow 5)", "staff", "admin.visit / visit_defect_add / visit_quotation"),
    rarrow(),
    rbox("CHECK-OUT &mdash; on-site duration recorded; customer notified technician left", "staff", "admin.visit_checkout"),
    rarrow("status: completed"),
    rbox("Customer gets celebration notification + chime; branded Service Report PDF built", "system", "generate_service_report_pdf / _trigger_feedback"),
    rarrow(),
    rbox("Customer must APPROVE &amp; RATE (5 dimensions, mandatory) to view the report", "customer", "portal.visit_approve &rarr; VisitFeedback"),
    rarrow("on the 4th completed visit"),
    rbox("AMC Fire Safety CERTIFICATE auto-issued (landscape PDF) + celebration", "system", "_maybe_issue_certificate() &rarr; portal.amc_certificate"),
    _spacer(4),
    rnote("<b>Fire Safety Score</b> (Contract.safety_score, 0&ndash;100, graded A&ndash;D) now recomputes "
          "from: the latest completed FSHCR score (25) + visit compliance (25) + equipment (15) + open "
          "defects (15) + certificate (10) + agreement accepted (10). Shown on the contract page and the "
          "Insights dashboard."),
]
pages.append(page(flow4))

# ===== FLOW 5 + 6 =====
flow56 = [
    rh2("FLOW 5 &nbsp; Material Quotation (spare parts during a visit)"),
    rbox("Technician finds a part needs replacing &rarr; picks from inventory datalist (rate auto-fills)", "staff", "admin.visit_quotation (Quotation + QuotationItem)"),
    rarrow("status: pending; client notified"),
    rbranch([
        ("APPROVE", "customer", "Part will be replaced<br/>&rarr; payment tracked", "portal.quotation_decide"),
        ("DECLINE", "external", "Must accept LIABILITY WAIVER<br/>(NSE not responsible) to proceed", "WAIVER_TEXT &rarr; rejection_acknowledged"),
    ]),
    rarrow("declined can be re-opened"),
    rbox("&ldquo;Changed your mind?&rdquo; &rarr; client reopens &rarr; staff re-sends / revises", "system", "portal.quotation_reopen / admin.quotation_resend"),
    _spacer(4),
    rnote("<b>Edit &amp; Delete (new):</b> staff can edit a pending quote (admin.quotation_edit) or delete "
          "it (admin.quotation_delete) &mdash; delete is blocked once approved or paid. Per-quote payment: "
          "admin.quotation_payment. Historical rate hints show past prices for the same client/item."),
    _spacer(8),
    rh2("FLOW 6 &nbsp; Complaints / Support Tickets"),
    rbox("Customer raises complaint (title, description, voice note, priority) from the contract page or /portal/tickets", "customer", "portal.raise_ticket (SupportTicket)"),
    rarrow("status: open"),
    rbox("Staff sees red badge &rarr; opens ticket &rarr; Acknowledge (client notified)", "staff", "admin.tickets / admin.ticket_detail"),
    rarrow("acknowledged &rarr; resolved &rarr; closed"),
    rbranch([
        ("resolved in time", "terminal", "Closed; customer notified", "status=closed"),
        ("no reply in 24 h", "external", "is_overdue=True &rarr; client<br/>can &ldquo;Send reminder&rdquo;", "portal.retrigger_ticket"),
    ]),
]
pages.append(page(flow56))

# ===== FLOW 7 + 8 =====
flow78 = [
    rh2("FLOW 7 &nbsp; Renewals &amp; Loyalty"),
    rbox("System watches contract expiry &mdash; buckets into bands", "system", "reminders.renewal_reminders() / process_milestones()"),
    rarrow(),
    rbranch([
        ("EXPIRED", "external", "Overdue", "band=expired"),
        ("&le; 7 days", "decision", "Due this week", "band=7"),
        ("&le; 30 days", "decision", "Due this month", "band=30"),
        ("&le; 60/90", "decision", "Upcoming", "band=60/90"),
    ]),
    rarrow(),
    rbox("Manager opens Renewals &rarr; &ldquo;Renew&rdquo; clones contract + auto-creates AMC quote", "staff", "admin.renewals / renew_contract (_clone_contract_for_renewal)"),
    rarrow("redirects to share page"),
    rbox("Share renewal quote via WhatsApp / link / QR &rarr; back into FLOW 3", "external", "sq.detail_quotation"),
    _spacer(4),
    rnote("Customers can also request renewal themselves (portal.request_renewal) or upgrade mid-contract "
          "(portal.upgrade_plan &mdash; creates a prorated-difference quote). Anniversary / loyalty "
          "notifications are part of process_milestones(), de-duped via MilestoneLog."),
    _spacer(8),
    rh2("8 &nbsp; Standalone Service Channels (no AMC needed)"),
    rbranch([
        ("EMERGENCY", "customer", "Public form &rarr; ServiceRequest<br/>+ 4-hour SLA clock", "public.emergency"),
        ("FIRE NOC", "customer", "Public form &rarr; ServiceRequest<br/>(upload old NOC for renewal)", "public.noc"),
        ("REFILL", "customer", "On-demand refill &rarr;<br/>RefillOrder + line items", "public.refill"),
    ]),
    rarrow("all land in the Ops Console"),
    rbox("Staff manage emergency / NOC requests, refill orders (status / ETA / amount / payment), enquiries", "staff", "admin.requests / refills / enquiries"),
]
pages.append(page(flow78))

# ===== 9 + 10 =====
final = [
    rh2("9 &nbsp; Cross-Cutting Systems"),
    rbranch([
        ("NOTIFICATIONS", "system", "In-app bell + deep links<br/>notify / notify_staff /<br/>notify_managers", "utils.py + base.html"),
        ("JOURNEY TIMELINE", "system", "Audit log of every key<br/>event per customer", "CustomerJourneyEvent"),
        ("TARA (AI)", "system", "OpenRouter assistant,<br/>canned fallback if no key", "nse/ai.py + chat.ask"),
    ]),
    _spacer(4),
    rnote("<b>Mobile app:</b> a parallel JSON API at <b>/api/v1</b> (nse/blueprints/api.py, bearer tokens via "
          "itsdangerous) mirrors the full customer portal for the Expo / React-Native app in <b>mobile/</b>. "
          "The website is unchanged &mdash; the API is additive and reuses the same models. Staff features "
          "stay web-only."),
    _spacer(8),
    rh2("10 &nbsp; Data &amp; Deploy Notes for Developers"),
    rnote("&bull; <b>Contract</b> is the spine of the data model &mdash; it carries the lead pipeline "
          "(lead_stage, project_type, spoc_*, handover_*), the AMC lifecycle, visits, quotes, and the "
          "safety score."),
    rnote("&bull; <b>Migrations:</b> db.create_all() only creates NEW TABLES, never new columns. After any "
          "deploy, run <b>migrate_all.py</b> &mdash; it schema-diffs the live DB (SQLite or Postgres) against "
          "the models and adds any missing columns automatically. This is the fix for &ldquo;works locally, "
          "breaks in production&rdquo; bugs."),
    rnote("&bull; <b>Deploy:</b> Vercel serverless (api/index.py exposes the WSGI app). Production needs "
          "Postgres (DATABASE_URL), Vercel Blob (BLOB_READ_WRITE_TOKEN) for uploads, and the COMPANY_* / "
          "OPENROUTER / optional RAZORPAY / MAIL env vars. OTP is still a dev flow (code on screen) until "
          "an SMS gateway is wired."),
]
pages.append(page(final))

# ─────────────────────────────────────────────────────────────────────────────
body = pagebreak().join(pages)
html = (f'<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
        f'@page {{ size: A4 portrait; margin: 1.5cm 1.3cm; }}'
        f'body {{ font-family: Helvetica, Arial, sans-serif; }}'
        f'td {{ font-family: Helvetica, Arial, sans-serif; }}'
        f'</style></head><body>{body}</body></html>')

out = "NSE_App_Flow.pdf"
with open(out, "wb") as fh:
    result = pisa.CreatePDF(html, dest=fh)
print("PDF errors:", result.err)
print("Wrote", out)
