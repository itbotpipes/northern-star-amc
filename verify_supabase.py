import os
import sys
from pathlib import Path
from sqlalchemy import create_engine, text

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from nse import create_app
from nse.extensions import db

app = create_app()

def verify():
    print("=== SUPABASE DATABASE VERIFICATION ===")
    with app.app_context():
        for table in db.metadata.sorted_tables:
            try:
                count = db.session.execute(text(f'SELECT count(*) FROM "{table.name}"')).scalar()
                print(f"Table: {table.name:28s} | Rows in Supabase: {count}")
            except Exception as e:
                print(f"Table: {table.name:28s} | Error: {e}")

if __name__ == "__main__":
    verify()
