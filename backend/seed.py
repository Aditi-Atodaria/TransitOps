"""
seed.py

By default this ONLY ensures the database schema exists — it inserts
NO users, vehicles, or drivers. Real users register via
POST /api/auth/register and real vehicles/drivers are entered through
the app's normal endpoints.

Optional demo data, for local testing/demos only, is available behind
an explicit flag:

    python seed.py --demo

Seeding is always additive and idempotent: rows are matched by their
unique key (email / reg_number / license_number) and existing rows
are never touched, updated, or overwritten.
"""
import argparse
from datetime import date, timedelta

from app import app
from models import db, User, Vehicle, Driver

# Optional demo data — only inserted when run with --demo, and only if
# a matching row doesn't already exist.
DEMO_USERS = [
    ("manager@transitops.dev", "password123", "Priya Sharma", "fleet_manager"),
    ("safety@transitops.dev", "password123", "Arjun Mehta", "safety_officer"),
    ("finance@transitops.dev", "password123", "Kavya Rao", "financial_analyst"),
    ("driver@transitops.dev", "password123", "Alex Fernandes", "driver"),
]

DEMO_VEHICLES = [
    ("MH-04-AB-1234", "Van-05", "Van", 500, 12500, 850000, "Mumbai"),
    ("GJ-01-CD-5678", "Truck-12", "Truck", 3000, 45210, 2200000, "Ahmedabad"),
    ("MH-12-EF-9012", "Van-08", "Van", 750, 8700, 950000, "Pune"),
    ("RJ-14-GH-3456", "Truck-03", "Truck", 5000, 61230, 2800000, "Jaipur"),
]

DEMO_DRIVERS = [
    ("Rahul Verma", "DL-MH-2019-001122", "LMV", date.today() + timedelta(days=400), "9820011223", 92),
    ("Sneha Kulkarni", "DL-GJ-2020-004455", "HMV", date.today() + timedelta(days=200), "9820033445", 88),
    ("Imran Sheikh", "DL-MH-2018-007788", "LMV", date.today() - timedelta(days=10), "9820055667", 75),
    ("Neha Joshi", "DL-RJ-2021-009900", "HMV", date.today() + timedelta(days=600), "9820077889", 95),
]


def ensure_schema():
    db.create_all()


def seed_demo_data():
    added = {"users": 0, "vehicles": 0, "drivers": 0}

    for email, password, name, role in DEMO_USERS:
        if not User.query.filter_by(email=email).first():
            u = User(email=email, name=name, role=role)
            u.set_password(password)
            db.session.add(u)
            added["users"] += 1

    for reg, name, vtype, load, odo, cost, region in DEMO_VEHICLES:
        if not Vehicle.query.filter_by(reg_number=reg).first():
            db.session.add(Vehicle(
                reg_number=reg, name=name, type=vtype, max_load_kg=load,
                odometer_km=odo, acquisition_cost=cost, region=region, status="Available",
            ))
            added["vehicles"] += 1

    for name, lic, cat, expiry, contact, score in DEMO_DRIVERS:
        if not Driver.query.filter_by(license_number=lic).first():
            db.session.add(Driver(
                name=name, license_number=lic, license_category=cat,
                license_expiry=expiry, contact_number=contact, safety_score=score,
                status="Available",
            ))
            added["drivers"] += 1

    db.session.commit()
    return added


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initialize the TransitOps database.")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Also insert optional demo users/vehicles/drivers for local testing. "
             "Never overwrites or duplicates existing rows.",
    )
    args = parser.parse_args()

    with app.app_context():
        ensure_schema()
        print("Database schema ready.")

        if args.demo:
            added = seed_demo_data()
            print(
                f"Demo data seeded: {added['users']} users, "
                f"{added['vehicles']} vehicles, {added['drivers']} drivers "
                f"(any already-existing rows were left untouched)."
            )
            if added["users"]:
                print("Demo logins (password: password123):")
                for email, _, name, role in DEMO_USERS:
                    print(f"  {email:30s} {role:20s} ({name})")
        else:
            print("No demo data inserted — this is a real, empty database.")
            print("Register real users via POST /api/auth/register.")
            print("(Run with --demo to also add optional test data for local dev.)")