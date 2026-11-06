import os
import sys

script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

from nse import create_app, db
from nse.models import User

app = create_app()

STAFF_PHONE_MAP = {
    "admin@northernstar.example": "9825000001",
    "manager@northernstar.example": "9825000002",
    "teamleader@northernstar.example": "9825000003",
    "tech@northernstar.example": "9825000004",
}

with app.app_context():
    # Make sure default staff users exist
    defaults = [
        {"role": "admin", "name": "Ops Admin", "email": "admin@northernstar.example", "phone": "9825000001"},
        {"role": "manager", "name": "Ops Manager", "email": "manager@northernstar.example", "phone": "9825000002"},
        {"role": "team_leader", "name": "Vikram (Team Leader)", "email": "teamleader@northernstar.example", "phone": "9825000003"},
        {"role": "technician", "name": "Ravi (Technician)", "email": "tech@northernstar.example", "phone": "9825000004"},
    ]

    for d in defaults:
        u = User.query.filter_by(email=d["email"]).first()
        if not u:
            u = User(role=d["role"], name=d["name"], email=d["email"], phone=d["phone"], city="Surat, Gujarat")
            db.session.add(u)
        else:
            u.phone = d["phone"]
            u.role = d["role"]
        u.set_password("password123")

    db.session.commit()

    # Now find all staff users and ensure they all have password123 and a valid phone
    staff_users = User.query.filter(User.role != "customer").all()
    seq = 5
    for u in staff_users:
        u.set_password("password123")
        if not u.phone or len(u.phone.strip()) < 10:
            assigned_phone = f"98250000{seq:02d}"
            u.phone = assigned_phone
            seq += 1

    db.session.commit()

    print("=" * 60)
    print("STAFF ACCOUNTS SEEDED WITH PASSWORD: password123")
    print("=" * 60)
    for u in User.query.filter(User.role != "customer").all():
        print(f"Role: {u.role:<14} | Name: {u.name:<22} | Phone: {u.phone} | Email: {u.email}")
    print("=" * 60)

