import os
import sys
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from nse import create_app
from nse.extensions import db

app = create_app()

def sync_data():
    pg_url = app.config['SQLALCHEMY_DATABASE_URI']
    if not pg_url or "sqlite" in pg_url:
        print("Error: DATABASE_URL in .env must point to your Supabase PostgreSQL database!")
        return

    print("Connecting to local SQLite database...")
    local_engine = create_engine(f"sqlite:///{BASE_DIR}/nse_amc.db")
    LocalSession = sessionmaker(bind=local_engine)
    local_session = LocalSession()

    print("Connecting to Supabase PostgreSQL...")
    pg_engine = create_engine(pg_url)
    PgSession = sessionmaker(bind=pg_engine)
    pg_session = PgSession()

    # Disable FK constraints in Postgres during batch migration
    try:
        pg_session.execute(text("SET session_replication_role = 'replica';"))
        pg_session.commit()
    except Exception as e:
        print("Note on session_replication_role:", e)

    print("\nTransferring data table by table to Supabase...")
    for table in db.metadata.sorted_tables:
        try:
            rows = local_session.execute(text(f'SELECT * FROM "{table.name}"')).fetchall()
            if rows:
                print(f"  -> Transferring {len(rows):4d} row(s) to table [{table.name}]...")
                for row in rows:
                    row_dict = dict(row._mapping)
                    pg_session.execute(table.insert().values(row_dict))
                pg_session.commit()
            else:
                print(f"  -> Skipping empty table [{table.name}]")
        except Exception as e:
            pg_session.rollback()
            print(f"  [!] Exception copying {table.name}: {e}")

    # Re-enable FK constraints in Postgres
    try:
        pg_session.execute(text("SET session_replication_role = 'origin';"))
        pg_session.commit()
    except Exception:
        pass

    print("\n[SUCCESS] All data migrated to Supabase successfully!")

if __name__ == "__main__":
    with app.app_context():
        sync_data()
