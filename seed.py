"""Seed the database with sample plans, staff and a demo customer.

Usage:  python seed.py        (safe to re-run; it resets seeded demo data)
"""
from datetime import date, datetime, timedelta

from nse import create_app
from nse.extensions import db
from nse.models import (User, AMCPlan, Contract, Visit, VisitPhoto, Equipment,
                        RefillRecord, Quotation, QuotationItem, ServiceRequest,
                        Enquiry, Notification, InventoryItem,
                        InquiryChecklistItem, InquiryHistory)

app = create_app()


def run():
    with app.app_context():
        # ---- Plans -------------------------------------------------------- #
        if not AMCPlan.query.first():
            plans = [
                AMCPlan(name="Home Basic", category="residential", tier="Basic",
                        price=25000, visits_per_year=4, response_time="48 hours",
                        description="Essential cover for apartments and small homes.",
                        features="4 scheduled service visits/year\nExtinguisher inspection & refill tracking\n"
                                 "Service report + site photos each visit\nSmoke/heat detector check\nEmergency support"),
                AMCPlan(name="Home Plus", category="residential", tier="Standard",
                        price=35000, visits_per_year=6, response_time="24 hours",
                        description="For villas and housing societies wanting more frequent checks.",
                        features="6 scheduled visits/year\nPriority 24-hour response\nFull equipment & refill register\n"
                                 "Hydrant & alarm panel check\nMaterial quotations with approval\nDiscounted emergency visits"),
                AMCPlan(name="Shop & Office", category="commercial", tier="Basic",
                        price=35000, visits_per_year=4, response_time="24 hours",
                        description="Compliance cover for shops, showrooms and offices.",
                        features="4 scheduled visits/year\nFire NOC compliance support\nExtinguisher & hydrant servicing\n"
                                 "Service report + photos\nRefill tracking\nEmergency response"),
                AMCPlan(name="Complex Pro", category="commercial", tier="Premium",
                        price=50000, visits_per_year=6, response_time="12 hours",
                        description="Complete cover for commercial complexes and industrial units.",
                        features="6 scheduled visits/year\nPriority 12-hour response\nFull system: extinguishers, hydrants, "
                                 "sprinklers, alarms\nDedicated maintenance manager\nNOC renewal assistance\n"
                                 "Material quotations & approvals\n24x7 emergency team"),
            ]
            db.session.add_all(plans)
            db.session.commit()
            print(f"Seeded {len(plans)} plans.")

        # ---- Staff -------------------------------------------------------- #
        admin = User.query.filter_by(email="admin@northernstar.example").first()
        if not admin:
            admin = User(role="admin", name="Ops Admin",
                         email="admin@northernstar.example", city="Surat, Gujarat")
            admin.set_password("admin123")
            db.session.add(admin)

        tech = User.query.filter_by(email="tech@northernstar.example").first()
        if not tech:
            tech = User(role="technician", name="Ravi (Technician)",
                        email="tech@northernstar.example", city="Surat, Gujarat")
            tech.set_password("tech123")
            db.session.add(tech)

        teamleader = User.query.filter_by(email="teamleader@northernstar.example").first()
        if not teamleader:
            teamleader = User(role="team_leader", name="Vikram (Team Leader)",
                              email="teamleader@northernstar.example", city="Surat, Gujarat")
            teamleader.set_password("teamleader123")
            db.session.add(teamleader)

        manager = User.query.filter_by(email="manager@northernstar.example").first()
        if not manager:
            manager = User(role="manager", name="Ops Manager",
                           email="manager@northernstar.example", city="Surat, Gujarat")
            manager.set_password("manager123")
            db.session.add(manager)
        db.session.commit()

        # ---- Inventory (spare parts for visit-linked quotations) --------- #
        if InventoryItem.query.count() == 0:
            inv = [
                ("ABC Dry Powder Refill (6 kg)", "Refilling", "No.", 650),
                ("ABC Dry Powder Refill (4 kg)", "Refilling", "No.", 500),
                ("CO2 Cartridge Refill (CO2 4.5 kg)", "Refilling", "No.", 1200),
                ("Clean Agent Refill (per kg)", "Refilling", "Kg", 1500),
                ("Fire Extinguisher ABC 6 kg (new)", "Equipment", "No.", 2200),
                ("Fire Extinguisher CO2 4.5 kg (new)", "Equipment", "No.", 6500),
                ("Hydrant Valve (single headed)", "Equipment", "No.", 2800),
                ("Branch Pipe (SS)", "Equipment", "No.", 1400),
                ("RRL Hose Pipe 63mm x 15m", "Equipment", "No.", 3200),
                ("Shut-off Nozzle", "Equipment", "No.", 950),
                ("Hose Box (MS, single)", "Equipment", "No.", 2600),
                ("Sprinkler Head (pendant)", "Equipment", "No.", 220),
                ("Smoke Detector", "Equipment", "No.", 850),
                ("Heat Detector", "Equipment", "No.", 800),
                ("Manual Call Point (MCP)", "Equipment", "No.", 700),
                ("Hooter / Sounder", "Equipment", "No.", 650),
                ("Pressure Gauge", "Spares", "No.", 450),
                ("Pressure Switch", "Spares", "No.", 1100),
                ("Ball Valve 25mm", "Spares", "No.", 350),
                ("Fire Retardant Paint (per ltr)", "Consumables", "Ltr", 480),
                ("Safety Signage (photo-luminescent)", "Consumables", "No.", 180),
                ("Service / Labour Charge", "Service", "Job", 500),
            ]
            for name, cat, unit, rate in inv:
                db.session.add(InventoryItem(name=name, category=cat, unit=unit, rate=rate))
            db.session.commit()
            print(f"Seeded {len(inv)} inventory items.")

        # ---- Demo customer + contract ------------------------------------ #
        cust = User.query.filter_by(phone="9876543210").first()
        if not cust:
            cust = User(role="customer", name="Demo Customer", phone="9876543210",
                        email="demo@example.com", area="Adajan", city="Surat, Gujarat",
                        address="A-101, Sunrise Residency, Adajan, Surat")
            db.session.add(cust)
            db.session.commit()

        if not Contract.query.filter_by(customer_id=cust.id).first():
            plan = AMCPlan.query.filter_by(name="Home Plus").first()
            start = date.today() - timedelta(days=120)
            c = Contract(customer_id=cust.id, plan_id=plan.id, status="active",
                         site_name="Sunrise Residency A-101", site_address=cust.address,
                         area="Adajan", applicant_name=cust.name, applicant_phone=cust.phone,
                         applicant_email=cust.email, property_type="Independent house / villa",
                         start_date=start, end_date=start + timedelta(days=365),
                         total_visits=plan.visits_per_year, price=plan.price,
                         payment_mode="online", payment_status="paid")
            db.session.add(c)
            db.session.commit()

            # Visits — first two completed, rest scheduled.
            interval = 365 // plan.visits_per_year
            for i in range(plan.visits_per_year):
                vdate = start + timedelta(days=interval * i)
                done = i < 2
                v = Visit(contract_id=c.id, visit_number=i + 1, scheduled_date=vdate,
                          status="completed" if done else "scheduled",
                          technician_id=tech.id if done else None,
                          completed_date=vdate if done else None,
                          work_done=("Inspected all extinguishers, checked pressure gauges, "
                                     "tested smoke detectors, cleaned hydrant valve and updated "
                                     "service tags.") if done else None)
                db.session.add(v)
            db.session.commit()

            # Equipment with refill history
            equips = [
                ("ABC Dry Powder 6kg", "extinguisher", "Kitchen", "EXT-001", 12, 300),
                ("CO2 Extinguisher 4.5kg", "extinguisher", "Living room", "EXT-002", 12, 20),
                ("Fire Hydrant Valve", "hydrant", "Building entrance", "HYD-001", 24, 200),
                ("Smoke Detector", "alarm", "Master bedroom", "SMK-001", 36, 600),
            ]
            for name, etype, loc, sn, interval_m, last_days in equips:
                last = date.today() - timedelta(days=last_days)
                e = Equipment(contract_id=c.id, name=name, equip_type=etype, location=loc,
                              serial_no=sn, install_date=start, last_refill_date=last,
                              refill_interval_months=interval_m)
                e.recompute_next_refill()
                db.session.add(e)
                db.session.flush()
                db.session.add(RefillRecord(equipment_id=e.id, refill_date=last,
                                            performed_by="Ravi (Technician)",
                                            notes="Refilled and pressure-tested."))
            db.session.commit()

            # A pending quotation for materials
            q = Quotation(contract_id=c.id, status="pending",
                          notes="Items found during the 2nd service visit that need replacement.")
            db.session.add(q)
            db.session.flush()
            db.session.add_all([
                QuotationItem(quotation_id=q.id, description="ABC refill powder (6kg)", quantity=1, unit_price=850),
                QuotationItem(quotation_id=q.id, description="Pressure gauge replacement", quantity=2, unit_price=450),
                QuotationItem(quotation_id=q.id, description="Safety pin & tamper seal set", quantity=4, unit_price=60),
            ])
            db.session.commit()

            notify_id = cust.id
            db.session.add_all([
                Notification(user_id=notify_id, title="AMC activated",
                             body=f"Your contract {c.reference} is active with {plan.visits_per_year} scheduled visits."),
                Notification(user_id=notify_id, title="New quotation for approval",
                             body=f"Quotation {q.reference} is ready for your review."),
            ])
            db.session.commit()
            print(f"Seeded demo customer (phone 9876543210) with contract {c.reference}.")

        # A sample open emergency request (unlinked walk-in)
        if not ServiceRequest.query.first():
            db.session.add(ServiceRequest(
                request_type="emergency", name="Mehul Shah", phone="9123456780",
                area="Vesu", location="Shop 12, Green Plaza, Vesu, Surat",
                description="Extinguisher discharged accidentally, need an urgent refill and check.",
                status="new", payment_mode="cash"))
        # Backfill reference on any legacy inquiries
        for legacy_e in Enquiry.query.all():
            if not legacy_e.reference:
                legacy_e.reference = f"INQ-{legacy_e.id:04d}"
        db.session.commit()

        # Sample inquiries demonstrating the full workflow
        if InquiryChecklistItem.query.count() == 0:
            tech = User.query.filter_by(role="technician").first()
            tl = User.query.filter_by(role="team_leader").first()

            # 1. New Inquiry
            inq1 = Enquiry.query.filter_by(phone="9988776655").first()
            if not inq1:
                inq1 = Enquiry(
                    name="Priya Patel", phone="9988776655", email="priya@example.com",
                    address="Shiv Residency, Opp. Lake Garden", area="Katargam", city="Surat, Gujarat",
                    service_requirement="Fire Safety Inspection & AMC",
                    subject="AMC for 6-floor housing society",
                    message="We have a 6-floor residential society in Katargam. We need an on-site inspection and an AMC quotation.",
                    status="new"
                )
                db.session.add(inq1)
                db.session.flush()
                inq1.reference = f"INQ-{inq1.id:04d}"
                db.session.add(InquiryHistory(
                    inquiry_id=inq1.id,
                    action="Inquiry Created",
                    actor_name="Priya Patel",
                    details="Inquiry submitted via public web portal for residential AMC."
                ))

            # 2. Assigned Inquiry
            inq2 = Enquiry(
                name="Rajesh Mehta (Diamond Plaza)", phone="9825123456", email="rajesh@diamondplaza.example",
                address="Tower B, Diamond Park, Ring Road", area="Ring Road", city="Surat, Gujarat",
                service_requirement="Fire Hydrant & Hose Reel System Inspection",
                subject="Hydrant pressure drop inspection",
                message="Basement fire hydrants are showing low pressure. Require technician visit to test booster pump and check landing valves.",
                status="assigned",
                assigned_to_id=tech.id if tech else None,
                assigned_by_id=tl.id if tl else None,
                assigned_at=datetime.utcnow() - timedelta(days=1),
                visit_scheduled_date=date.today() + timedelta(days=1),
                visit_time_slot="Morning (10:00 AM - 01:00 PM)",
                team_leader_notes="Bring hydrostatic test kit and check booster pump cut-in pressure."
            )
            db.session.add(inq2)
            db.session.flush()
            inq2.reference = f"INQ-{inq2.id:04d}"
            db.session.add_all([
                InquiryHistory(
                    inquiry_id=inq2.id,
                    action="Inquiry Created",
                    actor_name="Rajesh Mehta",
                    details="Commercial inquiry logged for hydrant inspection."
                ),
                InquiryHistory(
                    inquiry_id=inq2.id,
                    action="Assigned to Technician",
                    actor_name=tl.name if tl else "Team Leader",
                    details=f"Assigned to {tech.name if tech else 'Technician'} for site visit on {inq2.visit_scheduled_date}."
                )
            ])

            # 3. Checklist Submitted Inquiry
            inq3 = Enquiry(
                name="Anand Textiles Hub", phone="9898012345", email="anand@textiles.example",
                address="Plot 44, GIDC Industrial Estate, Sachin", area="Sachin GIDC", city="Surat, Gujarat",
                service_requirement="Fire Extinguisher Refilling & Servicing",
                subject="Factory fire audit and refilling check",
                message="Need complete audit of 45 extinguishers across spinning and weaving sheds.",
                status="checklist_submitted",
                assigned_to_id=tech.id if tech else None,
                assigned_by_id=tl.id if tl else None,
                assigned_at=datetime.utcnow() - timedelta(days=3),
                visit_scheduled_date=date.today() - timedelta(days=1),
                visit_time_slot="Morning (10:00 AM - 01:00 PM)",
                visit_completed_at=datetime.utcnow() - timedelta(hours=4),
                checklist_submitted_at=datetime.utcnow() - timedelta(hours=4),
                team_leader_notes="Count all CO2 and ABC cylinders; check hydro-test dates.",
                technician_notes="Inspected 45 units. 12 ABC cylinders due for immediate refilling. Hydrant valve #3 gland leaking."
            )
            db.session.add(inq3)
            db.session.flush()
            inq3.reference = f"INQ-{inq3.id:04d}"
            db.session.add_all([
                InquiryHistory(
                    inquiry_id=inq3.id,
                    action="Inquiry Created",
                    actor_name="Anand Textiles Hub",
                    details="Industrial inquiry logged via website."
                ),
                InquiryHistory(
                    inquiry_id=inq3.id,
                    action="Assigned to Technician",
                    actor_name=tl.name if tl else "Team Leader",
                    details=f"Assigned to {tech.name if tech else 'Technician'}."
                ),
                InquiryHistory(
                    inquiry_id=inq3.id,
                    action="Checklist Submitted",
                    actor_name=tech.name if tech else "Technician",
                    details="Site visit inspection completed: 5 checks passed, 1 attention needed, 1 critical defect."
                ),
                # Add sample checklist items
                InquiryChecklistItem(
                    inquiry_id=inq3.id,
                    category="Fire Extinguishers",
                    item_name="Cylinder physical condition, paint integrity & corrosion check",
                    status="pass",
                    remarks="All 45 cylinders physically intact, no external rust."
                ),
                InquiryChecklistItem(
                    inquiry_id=inq3.id,
                    category="Fire Extinguishers",
                    item_name="Pressure gauge needle located in operable green zone",
                    status="attention",
                    remarks="12 ABC cylinders showing low pressure.",
                    recommendation="Immediate refilling & nitrogen pressurization required."
                ),
                InquiryChecklistItem(
                    inquiry_id=inq3.id,
                    category="Hydrant & Hose Reel System",
                    item_name="Landing valves operation, wheel smoothness & gland packing leakage",
                    status="fail",
                    remarks="Hydrant valve #3 gland packing severely leaking water.",
                    recommendation="Replace gland packing and lubricate spindle."
                ),
                InquiryChecklistItem(
                    inquiry_id=inq3.id,
                    category="Fire Alarm & Detection",
                    item_name="Main Fire Alarm Control Panel (FACP) AC power & battery backup status",
                    status="pass",
                    remarks="Panel operating normally, battery backup 24V steady."
                )
            ])

            db.session.commit()
            print("Seeded sample inquiries demonstrating the complete workflow.")

        print("\nSeed complete. Logins:")
        print("  Admin       : admin@northernstar.example / admin123")
        print("  Team Leader : teamleader@northernstar.example / teamleader123")
        print("  Tech        : tech@northernstar.example / tech123")
        print("  Customer    : log in with phone 9876543210 (OTP shown on screen)")


if __name__ == "__main__":
    run()
