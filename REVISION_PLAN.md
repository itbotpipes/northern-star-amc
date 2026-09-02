# Northern Star — Revision Plan (customer feature requests)

This document tracks the 11 requested changes. Items marked **DONE** are implemented and tested in
this repo — your developer just needs to `git push` (Vercel auto-deploys). Items marked **TO BUILD**
are specified precisely (models, columns, routes, files) so a developer can implement them without
guessing.

Repo: `github.com/itbotpipes/nse-amc` → Vercel. DB: Postgres (Neon) via `DATABASE_URL`.
For any schema change below, run the ALTER TABLEs against the production Postgres (new *tables*
self-create via `db.create_all()` on cold start; new *columns* do not).

---

## ✅ DONE — implemented & tested (push to deploy)

### #7 Remove "Choose Your Plan" from New AMC
`nse/templates/site/apply.html` — the plan dropdown is removed. Customers no longer pick a plan; the
team recommends one after inspecting the site. The apply route already handled `plan = None`, so a
pending Contract is created with `total_visits=4, price=0` and no auto-quote.

### #8b Auto-fill logged-in customer's name / phone / email
`nse/templates/site/apply.html` — when a customer is signed in, name, phone, email, area and address
are pre-filled from their account (still editable). A "Signed in as …" note explains it.

### #8e Remove EMI / premature payment from the AMC inquiry
The payment radio block was removed from `apply.html` (payment happens after the quotation, not at
inquiry). EMI was already removed from contract pages in a prior wave.

### #9 "Submit Application" → inquiry flow
Button now reads **"Send inquiry"**; the heading is "Request a new AMC" and a helper line explains:
*"A technician or maintenance engineer will visit and inspect the site, prepare the maintenance
format, and share the details and quotation with you. No payment is needed now."*

### #8c "Use my current location" (GPS)
`apply.html` has a **Use my current location** button (browser geolocation, like Zomato). It captures
lat/long into hidden fields; `public.apply` folds them into the application notes with a Google Maps
link so staff can see the exact spot. (A full reverse-geocode to a street address needs a maps API key
— see #8c note under TO BUILD if you want the address auto-filled too.)

### #11 Customer profile not saving  (root-cause fixed)
`nse/blueprints/portal.py` → `profile()`. **Root cause:** the photo upload called `save_upload()`,
which on Vercel's read-only filesystem (no `BLOB_READ_WRITE_TOKEN`) raised an exception and 500'd the
whole request, so *nothing* saved. Fixed: the photo upload is wrapped in try/except — the text details
now always save, and a soft warning shows if only the photo failed. An **Email** field was also added
to the form and route.
> **Production note:** to make photo/ID uploads actually persist on Vercel, set the
> `BLOB_READ_WRITE_TOKEN` env var (Vercel Blob). Without it, uploads can't be stored on serverless.

### #6d Unlock visit dates
Already resolved in a prior wave: the old "locked until scheduled date" gate was removed. The visit
scheduled-date field is fully editable up or down; `admin/visit.html`'s `is_future` block is now only
an informational banner. Nothing further needed.

### #5 Maintenance Terms & Conditions (content)
Drafted in `MAINTENANCE_TERMS_AND_CONDITIONS.md` (root) — 18 AMC-specific clauses + a handover clause +
a "complimentary first-year" line. The **code wiring** to show them on AMC quotations is under TO BUILD
(#5 code) below.

---

## 🔧 TO BUILD — specified for the developer

### #5 (code) Branch the quotation T&C by service type — ✅ DONE (tested)
`AMC_QUOTATION_TERMS` (18 maintenance clauses) added to `nse/utils.py`, passed into the PDF context in
`nse/pdf_generator.py`, and `nse/templates/pdf/quotation.html` now branches: AMC quotes render the
maintenance terms, all other service types keep the installation clauses. Verified: an AMC quote PDF
shows "periodic inspection, testing and routine servicing" and no longer shows the "godown for material
storage" installation clause. (Handover / free-first-year lines still to be appended once #2 lands.)

### #1 "New Quotation" — Project dropdown that auto-fills the client — ✅ DONE (tested)
`sq.new_quotation` now passes `projects` (all contracts) to `admin/sq_new.html`, which has a **Project**
`<select>` at the top. Selecting a project auto-fills customer name / phone / email / project name /
address (from `data-*` attributes), and sets hidden `client_id` + `contract_id` so the quote links to
the contract and powers the price hint (#10c). "— New client —" keeps the manual free-text flow.

### #2 & #3 Existing vs New project + Handover + FSHCR sign-off + free/paid AMC — ✅ REBUILT & tested

**The first pass (a single "Onboard Project" mega-form) was scrapped** after the user corrected the
actual operational flow in detail — it didn't match how NSE really runs a new enquiry vs. a handover.
It's rebuilt as a proper sequential pipeline. **Full detail is in `CLAUDE.md`** under "Lead pipeline
rebuild (#2/#3, superseded/corrected)" — read that section, not this one, for the authoritative spec.
Summary:

- **Flow 1 (customer enquiry):** intake → manager schedules inspection → FSHCR **with a score** →
  branch: OK → audit fee only + deferred follow-up reminder (~5 months) / issues → normal AMC quote
  pipeline (WhatsApp → payment → agreement → visits, unchanged).
- **Flow 2 (engineer→maintenance handover, staff-only):** intake with a **SPOC contact** → joint FSHCR
  signed by engineer + technician → branch: needs rework (→ a manually-tracked **Rework queue**) /
  ready → **Free 1-year AMC** (explicit "valid until" date) or **Paid AMC** (same quote pipeline).
- New routes: `admin.leads`, `admin.lead_detail`, `admin.schedule_inspection`, `admin.lead_decide`,
  `admin.rework_list`/`admin.rework_toggle`. New model `ReworkItem`. `Contract` gained a parallel
  `lead_stage` field (doesn't touch the existing `status` field or any template that reads it).
  `HealthCheckReport` gained `score`+`outcome`. The customer "+ New AMC" button is now a **"Send
  Enquiry"** form with a project picker (existing site vs new) and a `problem_description` field.
- All branches verified end-to-end with the Flask test client, including a real SQLAlchemy gotcha
  (`db.session.flush()` needed after setting a FK before accessing the relationship on an unflushed
  object) documented in `CLAUDE.md`.

### #4 Send the AMC agreement
Already exists end-to-end: `AMC_AGREEMENT_CLAUSES`/`AMC_AGREEMENT_VERSION` in `utils.py`,
`portal.agreement` + `portal.agreement_accept`, scroll-to-accept UI in `portal/agreement.html`, and
the amber "accept your agreement" banner on `portal/contract.html`. **No change needed** unless you
want to also send it as a signed PDF — if so, mirror the certificate PDF pattern in `pdf_generator.py`.

### #6 Three roles + geofenced check-in + technician portfolio — ✅ DONE (tested)

Implemented & tested:
- **Manager role.** `User.is_staff` now includes `manager`; added `is_manager` / `is_technician`
  properties. Seeded `manager@northernstar.example` / `manager123` in `seed.py`. Managers get staff
  access to the Ops Console (admin-only actions still require `admin`).
- **Geofenced check-in (100 m).** `Contract` gained `latitude` / `longitude` columns; the apply form's
  GPS button now stores them on the contract. `utils.meters_between()` (haversine) added.
  `admin.visit_checkin` reads the technician's `lat`/`lng` (captured by `admin/visit.html`'s check-in
  button via `navigator.geolocation`) and **rejects check-in beyond 100 m** when the site has a stored
  location; sites without coordinates are not blocked. The technician's coords + distance are recorded
  in `checkin_note`. Verified: a 6.7 km check-in was rejected, a 22 m one succeeded.
- **Technician portfolio dashboard.** `admin.my_portfolio` (`/ops/my-portfolio`, template
  `admin/my_portfolio.html`, nav link added) shows the logged-in technician: sites assigned, visits
  completed/upcoming, on-time %, average customer rating + per-dimension bars, industry mix (by
  `property_type`), recent comments, and a site-wise work log with check-in/out times. Admins/managers
  can view any technician via `?tech_id=`.

**Production migration (run once against Postgres):**
```
ALTER TABLE contracts ADD COLUMN latitude  VARCHAR(32);
ALTER TABLE contracts ADD COLUMN longitude VARCHAR(32);
```
Then run `seed.py` (or insert the manager row) to create the manager login.

**Still optional (nice-to-have):** capture site lat/long from the Ops "create/activate contract" form
too (not just the public apply form), and reverse-geocode the typed address to coordinates via a maps
API so older contracts get a geofence without a site visit.

<details><summary>Original spec (for reference)</summary>

**(a) Manager role.** `User.role` already supports `customer / technician / admin`. Add `manager`:
- Treat `manager` as staff: update `is_staff` and the `staff_required` decorator (`nse/utils.py`) to
  include `manager`; add `manager_required` if managers get extra powers (e.g. assigning technicians,
  approving quotes) that plain technicians don't.
- Seed a manager account in `seed.py` (email + `set_password`, `method="pbkdf2:sha256"`).
- Gate manager-only nav/actions in `base_ops.html` with `{% if current_user.role in ['admin','manager'] %}`.

**(b) Geofenced check-in / check-out (100 m radius).**
- Store the site location on the contract: `latitude` / `longitude` columns (added in #2). Capture them
  when the project is onboarded (the apply form already has a GPS button — reuse it in the ops
  create-contract form, or reverse-geocode the address once with a maps API).
- Check-in/out routes already exist: `admin.visit_checkin` / `admin.visit_checkout` (Wave 11) stamp
  `checkin_at` / `checkout_at`. Add geofencing:
  - On the visit page, the "Check in" button first calls `navigator.geolocation.getCurrentPosition`,
    then POSTs the technician's lat/long to `admin.visit_checkin`.
  - Server computes the haversine distance between the technician and the contract's lat/long; **reject
    check-in if > 100 m** (return a flash "You must be at the site to check in — you are Xm away").
  - Store the technician's coordinates in `checkin_note` for the record.
  - Haversine helper (add to `utils.py`):
    ```python
    from math import radians, sin, cos, asin, sqrt
    def meters_between(lat1, lon1, lat2, lon2):
        r = 6371000
        dlat, dlon = radians(lat2-lat1), radians(lon2-lon1)
        a = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlon/2)**2
        return 2*r*asin(sqrt(a))
    ```

**(c) Technician portfolio / dashboard.** New page `admin.technician_profile` (`/ops/my-portfolio`),
visible to the logged-in technician. Aggregate from existing data:
- **Sites assigned:** `Visit.query.filter_by(technician_id=me.id)` → distinct `contract_id`.
- **Site-wise check-out:** list each assigned visit with `checkin_at` / `checkout_at` and
  `onsite_duration_label` (already a `Visit` property).
- **Completed work portfolio:** completed visits count, plus a list.
- **Industry breakdown:** group the technician's contracts by `Contract.property_type`
  (residential / society / factory / office …) and count each — render as bars.
- **Feedback + rating:** average of `VisitFeedback.avg_rating` across the technician's visits
  (`VisitFeedback.technician_id == me.id`), plus the recent comments. Show the star average
  prominently on the dashboard so the technician sees their own performance.
- The existing `/ops/technician-performance` (admin view) already computes most of these aggregates —
  reuse that query, filtered to the current technician.

</details>

### #8d Tap-to-speak not working — ✅ FIXED (tested)
Two real bugs found and fixed (not just platform detection):
1. **`rec.start()` had no try/catch.** If it threw synchronously (invalid state, permission edge
   cases), the click handler errored silently — the button visibly did nothing, which is exactly the
   "not working" symptom. Now wrapped, with a visible error message on catch.
2. **The fallback message told users to "use Chrome or Safari"** — but **Safari never implements the
   Web Speech API on iOS**, and Apple mandates WebKit app-wide on iOS, so no iOS browser (Safari,
   Chrome-on-iOS, etc.) supports it. That's actively wrong advice for a large share of Indian
   smartphone users. Fixed copy: points iPhone/iPad users to their **keyboard's built-in dictation
   mic** (a system feature, works in the same plain textarea, no web API needed) instead.
Also added: an explicit secure-context check (http on a non-localhost host silently fails `start()`),
and per-error-code messages (`no-speech`, `audio-capture`, `network`, `not-allowed`) instead of a
generic "Error: x". Verified: JS syntax-checked with `node --check`, copy renders correctly on `/apply`.

### #8f Notification pop-ups don't deep-link — ✅ FIXED (tested)
Audited all 61 `notify()`/`notify_staff()`/`notify_managers()` call sites across `admin.py`, `portal.py`,
`sq.py`, `public.py`, `reminders.py`, and `api.py`. **54 already had a `link=`**; the 7 missing were all
in `api.py` (the mobile API — but these `notify_staff()` calls land in the same `Notification` table the
web Ops Console bell reads, so they mattered for web too): visit-rated, quote-accepted, negotiation-
requested, material-quote approved/declined, new referral, agreement-accepted. Added `url_for` import to
`api.py` (was missing) and a correct deep link to each. Verified end-to-end via the mobile API's negotiate
endpoint: the admin's resulting notification now links to `/ops/sq/<id>` instead of falling back to the
generic list. `Notification.link` column confirmed present in the model — if the production Postgres
predates it, run `ALTER TABLE notifications ADD COLUMN link VARCHAR(255)`.

### #8g Video upload alongside photos — ✅ DONE (tested, from the earlier batch)
`photo_upload_widget` accepts `image/*,video/*`; `_save_attachments()` widened to mp4/mov/webm/m4v/avi,
tagging video rows `attachment_type='video'`; `admin/contract.html` renders a `<video>` thumbnail for
those instead of `<img>`; preview JS in `base.html` shows a muted video preview. `MAX_CONTENT_LENGTH`
raised 16MB → 60MB (`config.py`) since it's a whole-request cap and video is much bigger than photos.

### #10a Camera scan-and-upload on the service report — ✅ DONE (tested)
`admin/visit.html`'s service-report field gained a second, camera-icon-only input
(`name="report_scan"`, `accept="image/*" capture="environment"`) next to the regular file picker —
tapping it opens the phone's rear camera directly (one tap, no picker menu). `admin.visit()` now checks
`report_scan` as a fallback when `report` is empty, so either path saves to `Visit.service_report_path`.
Verified: POSTing with only `report_scan` populated correctly sets the path.

### #10b Material quotation — make it editable (item + description) — ✅ DONE (tested)
New route `admin.quotation_edit` (`/ops/quotation/<id>/edit`, GET+POST, template
`admin/quotation_edit.html`) — separate from the existing `quotation_resend`'s "revise" flag (which is
specifically for a quote the client has already rejected and re-opened). This is a general-purpose edit
available any time a quote is `pending`, e.g. to fix a typo or add a missed item before the client acts
on it. Pre-fills items, supports add/remove rows, reuses the inventory datalist for rate auto-fill, and
notifies the client with the updated total on save. An "Edit" link appears next to any pending quote on
`admin/visit.html`. Verified: pre-fill, item replace (qty/rate change + new row), and total recompute all
tested end-to-end.

### #10c Historical rate hint ("what we charged this client before") — ✅ DONE (tested) — both locations
Endpoint `sq.price_history` (`GET /ops/sq/price-history?q=<desc>&client_id=<id>`) queries past
`ServiceQuotationItem` and visit-linked `QuotationItem` rows for that client (case-insensitive match),
de-dupes and returns up to 5 `{rate, date, quote}` entries. Wired into **both** places technicians quote
from: `admin/sq_new.html` (office quotation form) and now also `admin/visit.html`'s on-site material-quote
picker (debounced 400ms, same faded `opacity:.6` "Previously: ₹… (date)" hint under the rate field, using
`v.contract.customer_id` as the client filter). Verified: raised a real material quote, then confirmed
the endpoint returns that exact rate when querying the same item description for that client.

---

## Suggested build order for the developer
1. Push the DONE batch (already tested) → immediate wins live.
2. #5 code wiring (T&C on AMC quotes) + #1 project autofill (both small, high value).
3. #8f notification links + #10b material-quote edit + #10a camera scan (small-medium).
4. #10c historical rate hint (medium — one endpoint + a bit of JS).
5. #2/#3 existing-vs-new handover flow (large — schema + FSHCR sign-off + free/paid branch).
6. #6 manager role + geofencing + technician portfolio (large — schema + haversine + new dashboard).
7. #8d tap-to-speak (debug on-device) + #8g video upload.

## Mobile app
The React Native customer app (`mobile/`) already mirrors the customer portal and reads the same JSON
API (`nse/blueprints/api.py`). None of the DONE items change the API contract, so the mobile app does
not need changes for them. When the TO-BUILD features that touch the customer side land (handover
report visibility, richer notifications), add matching endpoints in `api.py` and screens in
`mobile/src/screens/` following the recipe in `MOBILE_APP.md`.
