# Maintenance (AMC) Terms & Conditions — for the quotation

Your current quotation T&C (19 clauses) are written for **new installation / project work**
(BOQ, scaffolding, godown for material storage, 50% advance against delivery, "if project continues
beyond 6 months"…). Those do not fit an **Annual Maintenance Contract**. Below is a maintenance-
specific set you can send with an AMC quotation.

These are drafted specifically for a fire-safety AMC in India and align with your existing
AMC agreement clauses in `nse/utils.py`.

---

## Recommended AMC Terms & Conditions (18 clauses)

1. **Scope.** This Annual Maintenance Contract covers periodic inspection, testing, and routine
   servicing of the fire-safety equipment listed in this quotation, at the registered site only, for
   a period of twelve (12) months from the date of contract activation.

2. **Number of visits.** The contract includes the number of scheduled maintenance visits stated in
   this quotation, spaced evenly across the year. Additional visits requested by the client outside
   this schedule are chargeable.

3. **Emergency / breakdown calls.** Reactive breakdown visits requested between scheduled visits are
   provided on a priority basis; travel and labour for such calls are covered, but any spare parts or
   materials required are chargeable separately (see clause 6).

4. **What is included.** Routine maintenance consumables (cleaning materials, minor fittings,
   servicing labour) and standard servicing of the covered equipment are included in the AMC fee.

5. **What is not included.** Replacement of expired, damaged, or non-functional parts; refilling of
   extinguishers; hydrostatic testing; replacement of cylinders, hoses, glass, or heads; civil,
   electrical, or plumbing infrastructure (piping, wiring, panels); and any equipment added to the
   site after contract activation without prior written intimation.

6. **Spare parts & materials.** Where replacement is required, a separate material quotation is
   raised for the client's approval. The client is free to decline, but Northern Star Engineering
   bears no liability for any fire incident attributable to equipment the client has declined to
   repair or replace; a liability waiver will be recorded at the time of decline.

7. **Site access.** The client must ensure safe, unobstructed access to all equipment on the
   scheduled visit date, along with power, water, and any keys or permissions required. If access is
   denied or the site is not ready on the scheduled date, that visit is treated as completed and is
   not carried forward.

8. **Rescheduling.** Rescheduling requests must be made at least 48 hours before the scheduled visit.
   Northern Star Engineering will make reasonable efforts to accommodate a new mutually convenient
   date within the contract period.

9. **Condition of equipment at handover.** For equipment already installed (whether by NSE or a third
   party), the AMC covers upkeep only. Any pre-existing defect identified at the first inspection
   will be reported to the client; rectification of such defects is chargeable and is outside the
   scope of routine maintenance.

10. **Warranties.** Warranties on any equipment or parts supplied are limited to the respective
    manufacturer's warranty. The AMC fee does not extend or substitute any manufacturer warranty.

11. **Standards & compliance.** Maintenance is carried out in line with applicable Indian standards
    (NBC, BIS/IS, and relevant NFPA guidance). NOC assistance, if required, is a separate service and
    is subject to inspection by the concerned fire officer.

12. **Client responsibilities.** The client shall keep equipment clean and accessible between visits,
    report any fault or damage promptly, not permit any third party to service the covered equipment
    during the contract period, and use all equipment strictly as per standard operating procedure.

13. **Records & reports.** A service report is issued after each completed visit. The client is
    requested to verify and acknowledge the report. Digital reports shared via the customer portal /
    email constitute valid records.

14. **Payment terms.** The AMC fee is due within seven (7) days of contract activation (or as stated
    on this quotation). Services may be suspended for non-payment until the outstanding amount is
    cleared. All amounts are subject to GST as applicable (GST No. 24ALQPD0899P1ZD).

15. **Price validity.** This quotation is valid for the number of days stated on it. Rates for spare
    parts and consumables are subject to prevailing market prices at the time of actual replacement.

16. **Liability cap.** Northern Star Engineering's total liability under this contract shall not
    exceed the annual AMC fee paid. NSE is not liable for consequential loss, property damage, or
    injury arising from equipment failure where the client was notified of a fault and did not
    authorise repair or replacement.

17. **Renewal & termination.** The contract does not auto-renew. Either party may terminate with 30
    days' written notice; a pro-rata refund is payable only for scheduled visits not yet performed.
    No refund is due once all scheduled visits have been consumed.

18. **Jurisdiction.** This contract is governed by the laws of India. Any dispute shall be subject to
    the exclusive jurisdiction of the courts at Surat, Gujarat.

---

## Special clause for the "Existing Project / Handover" flow (item 2 & 3)

When you take over maintenance of a site installed by another engineer/team, add:

> **19. Handover condition.** This maintenance contract is entered into on an "as-is" basis following
> a joint site inspection (Fire System Health Check-up) signed by the outgoing engineer's
> representative and the Northern Star maintenance technician. NSE's maintenance obligation is limited
> to the equipment recorded as functional in that handover report. Defects noted at handover are the
> client's responsibility to rectify and are quoted separately.

---

## For the "one year free AMC" case (item 2)

When a first-year AMC is offered free (e.g. bundled after an installation project), add a line on the
quotation:

> **Complimentary first-year AMC.** The first year of Annual Maintenance is provided at no charge as
> agreed. The above terms apply in full. Renewal after 12 months is chargeable at the prevailing AMC
> rate.

---

## How this gets used in the app (for the developer)

- Add a new constant `AMC_QUOTATION_TERMS` (the 18 clauses above) in `nse/utils.py`.
- In `nse/templates/pdf/quotation.html`, branch the T&C block on `service_type`: render
  `AMC_QUOTATION_TERMS` when `q.service_type == "amc"`, else keep the existing installation clauses.
- The "handover" clause (19) is appended when the quotation is linked to an existing-project handover.
- The "complimentary first-year" line is added when the AMC is marked free.
