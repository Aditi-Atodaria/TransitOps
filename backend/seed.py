"""Run once to populate demo data: `python seed.py`"""
from datetime import date, timedelta
from app import app
from models import db, User, Vehicle, Driver

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

with app.app_context():
    db.create_all()

    for email, password, name, role in DEMO_USERS:
        if not User.query.filter_by(email=email).first():
            u = User(email=email, name=name, role=role)
            u.set_password(password)
            db.session.add(u)

    for reg, name, vtype, load, odo, cost, region in DEMO_VEHICLES:
        if not Vehicle.query.filter_by(reg_number=reg).first():
            db.session.add(Vehicle(
                reg_number=reg, name=name, type=vtype, max_load_kg=load,
                odometer_km=odo, acquisition_cost=cost, region=region, status="Available",
            ))

    for name, lic, cat, expiry, contact, score in DEMO_DRIVERS:
        if not Driver.query.filter_by(license_number=lic).first():
            db.session.add(Driver(
                name=name, license_number=lic, license_category=cat,
                license_expiry=expiry, contact_number=contact, safety_score=score,
                status="Available",
            ))

    db.session.commit()
    print("Seed complete.")
    print("Demo logins (all passwords: password123):")
    for email, _, name, role in DEMO_USERS:
        print(f"  {email:30s} {role:20s} ({name})")
