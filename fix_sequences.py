from nse import create_app
from nse.extensions import db
from sqlalchemy import text

app = create_app()

with app.app_context():
    engine = db.engine
    print("Engine dialect:", engine.dialect.name)
    with engine.begin() as conn:
        for table in db.metadata.sorted_tables:
            pk = list(table.primary_key.columns)
            if len(pk) == 1:
                tname = table.name
                cname = pk[0].name
                sql = f"SELECT setval(pg_get_serial_sequence('{tname}', '{cname}'), COALESCE((SELECT MAX({cname}) FROM {tname}), 1))"
                try:
                    res = conn.execute(text(sql)).scalar()
                    print(f"Synced {tname}.{cname} -> {res}")
                except Exception as e:
                    print(f"Skipped {tname}: {e}")

print("All PostgreSQL sequences synchronized successfully!")
