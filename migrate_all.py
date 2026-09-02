"""
migrate_all.py — schema-diff migration, works against SQLite (local) or
Postgres (production/Vercel).

Every past wave shipped its own one-off migration snippet documented in
CLAUDE.md (or, worse, only mentioned as "run this ALTER TABLE") — easy to
forget one against production since `db.create_all()` only ever adds brand
new TABLES, never new COLUMNS on tables that already exist. Symptom: a
feature works perfectly in local dev (fresh nse_amc.db) and silently 500s
or drops data in production, because a column added three waves ago was
never added to the live Postgres. The "customer profile not saving" bug
(company_name/gst_number/photo_path missing from an un-migrated `users`
table) is a concrete example of exactly this.

This script is a permanent fix for that class of bug: it inspects the
*actual* connected database (whatever DATABASE_URL points at) with
SQLAlchemy's Inspector, diffs it against every model in nse/models.py, and
issues `ALTER TABLE ... ADD COLUMN` for anything the models declare that
the live schema is missing. New tables are created via db.create_all() as
before. Idempotent — safe to run any time, any number of times, against
either dialect.

Run locally:       .venv/bin/python migrate_all.py
Run against prod:  DATABASE_URL="postgresql://..." .venv/bin/python migrate_all.py
"""
from nse import create_app
from nse.extensions import db
from sqlalchemy import inspect, text

app = create_app()

with app.app_context():
    engine = db.engine
    dialect = engine.dialect.name  # "sqlite" or "postgresql"

    # 1) Brand-new tables (safe no-op if they already exist).
    db.create_all()

    inspector = inspect(engine)
    added = []
    skipped_new_tables = []

    for table in db.metadata.sorted_tables:
        existing_cols = {c["name"] for c in inspector.get_columns(table.name)} \
            if inspector.has_table(table.name) else None
        if existing_cols is None:
            # db.create_all() above should have created it — nothing to diff.
            skipped_new_tables.append(table.name)
            continue
        for col in table.columns:
            if col.name in existing_cols:
                continue
            # Compile this column's type for whichever dialect we're connected to.
            coltype = col.type.compile(dialect=engine.dialect)
            ddl = f'ALTER TABLE {table.name} ADD COLUMN {col.name} {coltype}'
            # Postgres and SQLite both accept a literal DEFAULT clause here;
            # skip server_default to avoid dialect-specific quoting headaches —
            # nullable columns (all of ours are) are simply added as NULL and
            # the app fills them in going forward.
            with engine.begin() as conn:
                conn.execute(text(ddl))
            added.append(f"{table.name}.{col.name}")
            print(f"  + added {table.name}.{col.name} ({coltype})")

    print()
    if skipped_new_tables:
        print(f"New tables created by db.create_all(): {', '.join(skipped_new_tables)}")
    if added:
        print(f"Migration complete — {len(added)} column(s) added.")
    else:
        print("Migration complete — schema already up to date, nothing to do.")
