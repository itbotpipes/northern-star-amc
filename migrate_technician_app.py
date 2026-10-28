"""Technician App migration — adds the new column the Technician App needs on
an existing SQLite table (db.create_all() cannot add columns to a table that
already exists). Idempotent via PRAGMA table_info — safe to run repeatedly.

Run:  .venv/bin/python migrate_technician_app.py
"""
from nse import create_app
from nse.extensions import db
from sqlalchemy import text

# (table, column, DDL type)
COLUMNS = [
    ("refill_orders", "assigned_technician_id", "INTEGER"),
    ("visits",        "scheduled_time",         "VARCHAR(5)"),
]

app = create_app()
with app.app_context():
    db.create_all()  # creates any new tables
    conn = db.session
    for table, col, ddl in COLUMNS:
        cols = [r[1] for r in conn.execute(text(f"PRAGMA table_info({table})"))]
        if col in cols:
            print(f"  = {table}.{col} already present")
            continue
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
        print(f"  + added {table}.{col}")
    conn.commit()
    print("Technician App migration complete.")
