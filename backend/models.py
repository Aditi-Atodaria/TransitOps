from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

ROLES = ["fleet_manager", "driver", "safety_officer", "financial_analyst"]

VEHICLE_STATUSES = ["Available", "On Trip", "In Shop", "Retired"]
DRIVER_STATUSES = ["Available", "On Trip", "Off Duty", "Suspended"]
TRIP_STATUSES = ["Draft", "Dispatched", "Completed", "Cancelled"]
MAINTENANCE_STATUSES = ["Open", "Closed"]


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(30), nullable=False, default="fleet_manager")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {"id": self.id, "email": self.email, "name": self.name, "role": self.role}


class Vehicle(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reg_number = db.Column(db.String(30), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    type = db.Column(db.String(60), nullable=False)
    max_load_kg = db.Column(db.Float, nullable=False)
    odometer_km = db.Column(db.Float, default=0)
    acquisition_cost = db.Column(db.Float, default=0)
    region = db.Column(db.String(80), default="")
    status = db.Column(db.String(20), default="Available")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    trips = db.relationship("Trip", backref="vehicle", lazy=True)
    maintenance_logs = db.relationship("MaintenanceLog", backref="vehicle", lazy=True)
    fuel_logs = db.relationship("FuelLog", backref="vehicle", lazy=True)
    expenses = db.relationship("Expense", backref="vehicle", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "reg_number": self.reg_number,
            "name": self.name,
            "type": self.type,
            "max_load_kg": self.max_load_kg,
            "odometer_km": self.odometer_km,
            "acquisition_cost": self.acquisition_cost,
            "region": self.region,
            "status": self.status,
        }


class Driver(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    license_number = db.Column(db.String(40), unique=True, nullable=False)
    license_category = db.Column(db.String(30), nullable=False)
    license_expiry = db.Column(db.Date, nullable=False)
    contact_number = db.Column(db.String(30), nullable=False)
    safety_score = db.Column(db.Float, default=100)
    status = db.Column(db.String(20), default="Available")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    trips = db.relationship("Trip", backref="driver", lazy=True)

    def is_license_expired(self):
        return self.license_expiry < date.today()

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "license_number": self.license_number,
            "license_category": self.license_category,
            "license_expiry": self.license_expiry.isoformat(),
            "contact_number": self.contact_number,
            "safety_score": self.safety_score,
            "status": self.status,
            "license_expired": self.is_license_expired(),
        }


class Trip(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    source = db.Column(db.String(120), nullable=False)
    destination = db.Column(db.String(120), nullable=False)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False)
    driver_id = db.Column(db.Integer, db.ForeignKey("driver.id"), nullable=False)
    cargo_weight_kg = db.Column(db.Float, nullable=False)
    planned_distance_km = db.Column(db.Float, nullable=False)
    actual_distance_km = db.Column(db.Float, nullable=True)
    fuel_consumed_l = db.Column(db.Float, nullable=True)
    revenue = db.Column(db.Float, default=0)
    status = db.Column(db.String(20), default="Draft")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    dispatched_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "source": self.source,
            "destination": self.destination,
            "vehicle_id": self.vehicle_id,
            "vehicle_reg": self.vehicle.reg_number if self.vehicle else None,
            "driver_id": self.driver_id,
            "driver_name": self.driver.name if self.driver else None,
            "cargo_weight_kg": self.cargo_weight_kg,
            "planned_distance_km": self.planned_distance_km,
            "actual_distance_km": self.actual_distance_km,
            "fuel_consumed_l": self.fuel_consumed_l,
            "revenue": self.revenue,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
        }


class MaintenanceLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    cost = db.Column(db.Float, default=0)
    status = db.Column(db.String(20), default="Open")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    closed_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "vehicle_reg": self.vehicle.reg_number if self.vehicle else None,
            "description": self.description,
            "cost": self.cost,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "closed_at": self.closed_at.isoformat() if self.closed_at else None,
        }


class FuelLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False)
    liters = db.Column(db.Float, nullable=False)
    cost = db.Column(db.Float, nullable=False)
    date = db.Column(db.Date, nullable=False, default=date.today)

    def to_dict(self):
        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "vehicle_reg": self.vehicle.reg_number if self.vehicle else None,
            "liters": self.liters,
            "cost": self.cost,
            "date": self.date.isoformat(),
        }


class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False)
    category = db.Column(db.String(60), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(255), default="")
    date = db.Column(db.Date, nullable=False, default=date.today)

    def to_dict(self):
        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "vehicle_reg": self.vehicle.reg_number if self.vehicle else None,
            "category": self.category,
            "amount": self.amount,
            "description": self.description,
            "date": self.date.isoformat(),
        }
