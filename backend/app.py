import os
import csv
import io
from datetime import datetime, date

<<<<<<< HEAD
from flask import Flask, request, jsonify, Response, send_from_directory
=======
from flask import Flask, request, jsonify, Response
>>>>>>> bf849d6190ec16ca66680f37f6bd79531549ac33
from flask_cors import CORS

from models import (
    db, User, Vehicle, Driver, Trip, MaintenanceLog, FuelLog, Expense,
    ROLES, VEHICLE_STATUSES, DRIVER_STATUSES,
)
from auth import generate_token, require_auth, require_role

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
<<<<<<< HEAD
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))
=======
>>>>>>> bf849d6190ec16ca66680f37f6bd79531549ac33

app = Flask(__name__)
CORS(app)
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.path.join(BASE_DIR, 'transitops.db')}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)


def err(msg, code=400):
    return jsonify({"error": msg}), code


def parse_date(value, field):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ValueError(f"{field} must be a date in YYYY-MM-DD format")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()
    role = data.get("role") or "fleet_manager"

    if not email or not password or not name:
        return err("email, password and name are required")
    if role not in ROLES:
        return err(f"role must be one of {ROLES}")
    if User.query.filter_by(email=email).first():
        return err("A user with that email already exists", 409)

    user = User(email=email, name=name, role=role)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    token = generate_token(user)
    return jsonify({"token": token, "user": user.to_dict()}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return err("Invalid email or password", 401)

    token = generate_token(user)
    return jsonify({"token": token, "user": user.to_dict()})


@app.get("/api/auth/me")
@require_auth
def me():
    user = User.query.get(request.user_id)
    if not user:
        return err("User not found", 404)
    return jsonify(user.to_dict())


# ---------------------------------------------------------------------------
# Vehicles
# ---------------------------------------------------------------------------

@app.get("/api/vehicles")
@require_auth
def list_vehicles():
    q = Vehicle.query
    status = request.args.get("status")
    v_type = request.args.get("type")
    region = request.args.get("region")
    dispatchable = request.args.get("dispatchable")
    if status:
        q = q.filter_by(status=status)
    if v_type:
        q = q.filter_by(type=v_type)
    if region:
        q = q.filter_by(region=region)
    if dispatchable == "true":
        q = q.filter_by(status="Available")
    vehicles = q.order_by(Vehicle.id.desc()).all()
    return jsonify([v.to_dict() for v in vehicles])


@app.post("/api/vehicles")
@require_auth
@require_role("fleet_manager")
def create_vehicle():
    data = request.get_json(force=True, silent=True) or {}
    reg_number = (data.get("reg_number") or "").strip()
    if not reg_number:
        return err("reg_number is required")
    if Vehicle.query.filter_by(reg_number=reg_number).first():
        return err("A vehicle with that registration number already exists", 409)
    try:
        vehicle = Vehicle(
            reg_number=reg_number,
            name=data["name"],
            type=data["type"],
            max_load_kg=float(data["max_load_kg"]),
            odometer_km=float(data.get("odometer_km", 0)),
            acquisition_cost=float(data.get("acquisition_cost", 0)),
            region=data.get("region", ""),
            status="Available",
        )
    except (KeyError, TypeError, ValueError) as e:
        return err(f"Invalid or missing field: {e}")
    db.session.add(vehicle)
    db.session.commit()
    return jsonify(vehicle.to_dict()), 201


@app.put("/api/vehicles/<int:vehicle_id>")
@require_auth
@require_role("fleet_manager")
def update_vehicle(vehicle_id):
    vehicle = Vehicle.query.get(vehicle_id)
    if not vehicle:
        return err("Vehicle not found", 404)
    data = request.get_json(force=True, silent=True) or {}

    if "reg_number" in data and data["reg_number"] != vehicle.reg_number:
        if Vehicle.query.filter_by(reg_number=data["reg_number"]).first():
            return err("A vehicle with that registration number already exists", 409)
        vehicle.reg_number = data["reg_number"]
    if "status" in data:
        if data["status"] not in VEHICLE_STATUSES:
            return err(f"status must be one of {VEHICLE_STATUSES}")
        vehicle.status = data["status"]
    for field in ["name", "type", "region"]:
        if field in data:
            setattr(vehicle, field, data[field])
    for field in ["max_load_kg", "odometer_km", "acquisition_cost"]:
        if field in data:
            setattr(vehicle, field, float(data[field]))

    db.session.commit()
    return jsonify(vehicle.to_dict())


@app.delete("/api/vehicles/<int:vehicle_id>")
@require_auth
@require_role("fleet_manager")
def delete_vehicle(vehicle_id):
    vehicle = Vehicle.query.get(vehicle_id)
    if not vehicle:
        return err("Vehicle not found", 404)
    if vehicle.status == "On Trip":
        return err("Cannot delete a vehicle that is currently on a trip", 409)
    db.session.delete(vehicle)
    db.session.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Drivers
# ---------------------------------------------------------------------------

@app.get("/api/drivers")
@require_auth
def list_drivers():
    q = Driver.query
    status = request.args.get("status")
    dispatchable = request.args.get("dispatchable")
    if status:
        q = q.filter_by(status=status)
    drivers = q.order_by(Driver.id.desc()).all()
    result = [d.to_dict() for d in drivers]
    if dispatchable == "true":
        result = [d for d in result if d["status"] == "Available" and not d["license_expired"]]
    return jsonify(result)


@app.post("/api/drivers")
@require_auth
@require_role("fleet_manager", "safety_officer")
def create_driver():
    data = request.get_json(force=True, silent=True) or {}
    license_number = (data.get("license_number") or "").strip()
    if not license_number:
        return err("license_number is required")
    if Driver.query.filter_by(license_number=license_number).first():
        return err("A driver with that license number already exists", 409)
    try:
        driver = Driver(
            name=data["name"],
            license_number=license_number,
            license_category=data["license_category"],
            license_expiry=parse_date(data["license_expiry"], "license_expiry"),
            contact_number=data["contact_number"],
            safety_score=float(data.get("safety_score", 100)),
            status="Available",
        )
    except (KeyError, TypeError, ValueError) as e:
        return err(f"Invalid or missing field: {e}")
    db.session.add(driver)
    db.session.commit()
    return jsonify(driver.to_dict()), 201


@app.put("/api/drivers/<int:driver_id>")
@require_auth
@require_role("fleet_manager", "safety_officer")
def update_driver(driver_id):
    driver = Driver.query.get(driver_id)
    if not driver:
        return err("Driver not found", 404)
    data = request.get_json(force=True, silent=True) or {}

    if "status" in data:
        if data["status"] not in DRIVER_STATUSES:
            return err(f"status must be one of {DRIVER_STATUSES}")
        driver.status = data["status"]
    if "license_expiry" in data:
        driver.license_expiry = parse_date(data["license_expiry"], "license_expiry")
    for field in ["name", "license_category", "contact_number"]:
        if field in data:
            setattr(driver, field, data[field])
    if "safety_score" in data:
        driver.safety_score = float(data["safety_score"])

    db.session.commit()
    return jsonify(driver.to_dict())


@app.delete("/api/drivers/<int:driver_id>")
@require_auth
@require_role("fleet_manager", "safety_officer")
def delete_driver(driver_id):
    driver = Driver.query.get(driver_id)
    if not driver:
        return err("Driver not found", 404)
    if driver.status == "On Trip":
        return err("Cannot delete a driver that is currently on a trip", 409)
    db.session.delete(driver)
    db.session.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Trips  (core business-rule engine)
# ---------------------------------------------------------------------------

@app.get("/api/trips")
@require_auth
def list_trips():
    q = Trip.query
    status = request.args.get("status")
    if status:
        q = q.filter_by(status=status)
    trips = q.order_by(Trip.id.desc()).all()
    return jsonify([t.to_dict() for t in trips])


@app.post("/api/trips")
@require_auth
@require_role("fleet_manager", "driver")
def create_trip():
    """Create a trip in Draft status. Vehicle/driver are only reserved on dispatch."""
    data = request.get_json(force=True, silent=True) or {}
    try:
        vehicle_id = int(data["vehicle_id"])
        driver_id = int(data["driver_id"])
        cargo_weight_kg = float(data["cargo_weight_kg"])
        planned_distance_km = float(data["planned_distance_km"])
    except (KeyError, TypeError, ValueError) as e:
        return err(f"Invalid or missing field: {e}")

    source = (data.get("source") or "").strip()
    destination = (data.get("destination") or "").strip()
    if not source or not destination:
        return err("source and destination are required")

    vehicle = Vehicle.query.get(vehicle_id)
    driver = Driver.query.get(driver_id)
    if not vehicle:
        return err("Vehicle not found", 404)
    if not driver:
        return err("Driver not found", 404)

    if cargo_weight_kg > vehicle.max_load_kg:
        return err(
            f"Cargo weight {cargo_weight_kg}kg exceeds vehicle max load capacity "
            f"{vehicle.max_load_kg}kg",
            422,
        )

    trip = Trip(
        source=source,
        destination=destination,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        cargo_weight_kg=cargo_weight_kg,
        planned_distance_km=planned_distance_km,
        revenue=float(data.get("revenue", 0)),
        status="Draft",
    )
    db.session.add(trip)
    db.session.commit()
    return jsonify(trip.to_dict()), 201


@app.post("/api/trips/<int:trip_id>/dispatch")
@require_auth
@require_role("fleet_manager", "driver")
def dispatch_trip(trip_id):
    trip = Trip.query.get(trip_id)
    if not trip:
        return err("Trip not found", 404)
    if trip.status != "Draft":
        return err(f"Only Draft trips can be dispatched (current status: {trip.status})", 409)

    vehicle = trip.vehicle
    driver = trip.driver

    # --- Mandatory business rule checks ---
    if vehicle.status in ("Retired", "In Shop"):
        return err(f"Vehicle {vehicle.reg_number} is {vehicle.status} and cannot be dispatched", 422)
    if vehicle.status == "On Trip":
        return err(f"Vehicle {vehicle.reg_number} is already on another trip", 422)
    if driver.status == "Suspended":
        return err(f"Driver {driver.name} is suspended and cannot be assigned", 422)
    if driver.is_license_expired():
        return err(f"Driver {driver.name}'s license expired on {driver.license_expiry}", 422)
    if driver.status == "On Trip":
        return err(f"Driver {driver.name} is already on another trip", 422)
    if trip.cargo_weight_kg > vehicle.max_load_kg:
        return err(
            f"Cargo weight {trip.cargo_weight_kg}kg exceeds vehicle max load "
            f"{vehicle.max_load_kg}kg",
            422,
        )

    vehicle.status = "On Trip"
    driver.status = "On Trip"
    trip.status = "Dispatched"
    trip.dispatched_at = datetime.utcnow()
    db.session.commit()
    return jsonify(trip.to_dict())


@app.post("/api/trips/<int:trip_id>/complete")
@require_auth
@require_role("fleet_manager", "driver")
def complete_trip(trip_id):
    trip = Trip.query.get(trip_id)
    if not trip:
        return err("Trip not found", 404)
    if trip.status != "Dispatched":
        return err(f"Only Dispatched trips can be completed (current status: {trip.status})", 409)

    data = request.get_json(force=True, silent=True) or {}
    try:
        final_odometer = float(data["final_odometer_km"])
        fuel_consumed_l = float(data["fuel_consumed_l"])
    except (KeyError, TypeError, ValueError) as e:
        return err(f"Invalid or missing field: {e}")

    vehicle = trip.vehicle
    driver = trip.driver

    trip.actual_distance_km = max(0.0, final_odometer - vehicle.odometer_km)
    trip.fuel_consumed_l = fuel_consumed_l
    trip.status = "Completed"
    trip.completed_at = datetime.utcnow()

    vehicle.odometer_km = final_odometer
    vehicle.status = "Available"
    driver.status = "Available"

    # log the fuel automatically so reports stay consistent
    fuel_log = FuelLog(
        vehicle_id=vehicle.id,
        liters=fuel_consumed_l,
        cost=float(data.get("fuel_cost", 0)),
        date=date.today(),
    )
    db.session.add(fuel_log)
    db.session.commit()
    return jsonify(trip.to_dict())


@app.post("/api/trips/<int:trip_id>/cancel")
@require_auth
@require_role("fleet_manager", "driver")
def cancel_trip(trip_id):
    trip = Trip.query.get(trip_id)
    if not trip:
        return err("Trip not found", 404)
    if trip.status not in ("Draft", "Dispatched"):
        return err(f"Cannot cancel a trip that is {trip.status}", 409)

    was_dispatched = trip.status == "Dispatched"
    trip.status = "Cancelled"

    if was_dispatched:
        trip.vehicle.status = "Available"
        trip.driver.status = "Available"

    db.session.commit()
    return jsonify(trip.to_dict())


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------

@app.get("/api/maintenance")
@require_auth
def list_maintenance():
    q = MaintenanceLog.query
    status = request.args.get("status")
    if status:
        q = q.filter_by(status=status)
    logs = q.order_by(MaintenanceLog.id.desc()).all()
    return jsonify([m.to_dict() for m in logs])


@app.post("/api/maintenance")
@require_auth
@require_role("fleet_manager")
def create_maintenance():
    data = request.get_json(force=True, silent=True) or {}
    try:
        vehicle_id = int(data["vehicle_id"])
        description = data["description"]
    except (KeyError, TypeError, ValueError) as e:
        return err(f"Invalid or missing field: {e}")

    vehicle = Vehicle.query.get(vehicle_id)
    if not vehicle:
        return err("Vehicle not found", 404)
    if vehicle.status == "On Trip":
        return err("Cannot start maintenance on a vehicle that is currently on a trip", 422)

    log = MaintenanceLog(
        vehicle_id=vehicle_id,
        description=description,
        cost=float(data.get("cost", 0)),
        status="Open",
    )
    # Mandatory rule: an active maintenance record puts the vehicle In Shop
    vehicle.status = "In Shop"
    db.session.add(log)
    db.session.commit()
    return jsonify(log.to_dict()), 201


@app.post("/api/maintenance/<int:log_id>/close")
@require_auth
@require_role("fleet_manager")
def close_maintenance(log_id):
    log = MaintenanceLog.query.get(log_id)
    if not log:
        return err("Maintenance record not found", 404)
    if log.status == "Closed":
        return err("Maintenance record is already closed", 409)

    data = request.get_json(force=True, silent=True) or {}
    if "cost" in data:
        log.cost = float(data["cost"])
    log.status = "Closed"
    log.closed_at = datetime.utcnow()

    # Rule: closing maintenance restores the vehicle to Available, unless retired
    if log.vehicle.status != "Retired":
        # only restore if no other open maintenance logs exist for this vehicle
        other_open = MaintenanceLog.query.filter(
            MaintenanceLog.vehicle_id == log.vehicle_id,
            MaintenanceLog.status == "Open",
            MaintenanceLog.id != log.id,
        ).first()
        if not other_open:
            log.vehicle.status = "Available"

    db.session.commit()
    return jsonify(log.to_dict())


# ---------------------------------------------------------------------------
# Fuel logs & expenses
# ---------------------------------------------------------------------------

@app.get("/api/fuel-logs")
@require_auth
def list_fuel_logs():
    q = FuelLog.query
    vehicle_id = request.args.get("vehicle_id")
    if vehicle_id:
        q = q.filter_by(vehicle_id=int(vehicle_id))
    logs = q.order_by(FuelLog.id.desc()).all()
    return jsonify([f.to_dict() for f in logs])


@app.post("/api/fuel-logs")
@require_auth
@require_role("fleet_manager", "driver")
def create_fuel_log():
    data = request.get_json(force=True, silent=True) or {}
    try:
        vehicle_id = int(data["vehicle_id"])
        liters = float(data["liters"])
        cost = float(data["cost"])
    except (KeyError, TypeError, ValueError) as e:
        return err(f"Invalid or missing field: {e}")
    if not Vehicle.query.get(vehicle_id):
        return err("Vehicle not found", 404)

    log = FuelLog(
        vehicle_id=vehicle_id,
        liters=liters,
        cost=cost,
        date=parse_date(data["date"], "date") if data.get("date") else date.today(),
    )
    db.session.add(log)
    db.session.commit()
    return jsonify(log.to_dict()), 201


@app.get("/api/expenses")
@require_auth
def list_expenses():
    q = Expense.query
    vehicle_id = request.args.get("vehicle_id")
    if vehicle_id:
        q = q.filter_by(vehicle_id=int(vehicle_id))
    expenses = q.order_by(Expense.id.desc()).all()
    return jsonify([e.to_dict() for e in expenses])


@app.post("/api/expenses")
@require_auth
@require_role("fleet_manager", "financial_analyst")
def create_expense():
    data = request.get_json(force=True, silent=True) or {}
    try:
        vehicle_id = int(data["vehicle_id"])
        category = data["category"]
        amount = float(data["amount"])
    except (KeyError, TypeError, ValueError) as e:
        return err(f"Invalid or missing field: {e}")
    if not Vehicle.query.get(vehicle_id):
        return err("Vehicle not found", 404)

    expense = Expense(
        vehicle_id=vehicle_id,
        category=category,
        amount=amount,
        description=data.get("description", ""),
        date=parse_date(data["date"], "date") if data.get("date") else date.today(),
    )
    db.session.add(expense)
    db.session.commit()
    return jsonify(expense.to_dict()), 201


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.get("/api/dashboard/kpis")
@require_auth
def dashboard_kpis():
    v_type = request.args.get("type")
    region = request.args.get("region")

    vq = Vehicle.query
    if v_type:
        vq = vq.filter_by(type=v_type)
    if region:
        vq = vq.filter_by(region=region)
    vehicles = vq.all()

    total_vehicles = len(vehicles)
    active_vehicles = sum(1 for v in vehicles if v.status != "Retired")
    available_vehicles = sum(1 for v in vehicles if v.status == "Available")
    in_maintenance = sum(1 for v in vehicles if v.status == "In Shop")
    on_trip_vehicles = sum(1 for v in vehicles if v.status == "On Trip")

    active_trips = Trip.query.filter_by(status="Dispatched").count()
    pending_trips = Trip.query.filter_by(status="Draft").count()
    drivers_on_duty = Driver.query.filter_by(status="On Trip").count()

    fleet_utilization = round((on_trip_vehicles / active_vehicles) * 100, 1) if active_vehicles else 0.0

    return jsonify({
        "active_vehicles": active_vehicles,
        "available_vehicles": available_vehicles,
        "vehicles_in_maintenance": in_maintenance,
        "active_trips": active_trips,
        "pending_trips": pending_trips,
        "drivers_on_duty": drivers_on_duty,
        "fleet_utilization_pct": fleet_utilization,
        "total_vehicles": total_vehicles,
    })


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def _vehicle_report_row(vehicle):
    completed_trips = [t for t in vehicle.trips if t.status == "Completed"]
    total_distance = sum(t.actual_distance_km or 0 for t in completed_trips)
    total_trip_fuel = sum(t.fuel_consumed_l or 0 for t in completed_trips)
    total_revenue = sum(t.revenue or 0 for t in completed_trips)

    fuel_log_cost = sum(f.cost for f in vehicle.fuel_logs)
    maintenance_cost = sum(m.cost for m in vehicle.maintenance_logs)
    expense_cost = sum(e.amount for e in vehicle.expenses)

    operational_cost = fuel_log_cost + maintenance_cost + expense_cost
    fuel_efficiency = round(total_distance / total_trip_fuel, 2) if total_trip_fuel else 0.0
    roi = (
        round((total_revenue - (maintenance_cost + fuel_log_cost)) / vehicle.acquisition_cost, 4)
        if vehicle.acquisition_cost else 0.0
    )

    return {
        "vehicle_id": vehicle.id,
        "reg_number": vehicle.reg_number,
        "name": vehicle.name,
        "completed_trips": len(completed_trips),
        "total_distance_km": round(total_distance, 1),
        "fuel_efficiency_km_per_l": fuel_efficiency,
        "operational_cost": round(operational_cost, 2),
        "total_revenue": round(total_revenue, 2),
        "vehicle_roi": roi,
    }


@app.get("/api/reports/summary")
@require_auth
def reports_summary():
    vehicles = Vehicle.query.all()
    rows = [_vehicle_report_row(v) for v in vehicles]

    total_vehicles = len(vehicles)
    on_trip = sum(1 for v in vehicles if v.status == "On Trip")
    fleet_utilization = round((on_trip / total_vehicles) * 100, 1) if total_vehicles else 0.0

    return jsonify({
        "fleet_utilization_pct": fleet_utilization,
        "vehicles": rows,
    })


@app.get("/api/reports/export.csv")
@require_auth
def export_csv():
    vehicles = Vehicle.query.all()
    rows = [_vehicle_report_row(v) for v in vehicles]

    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        buf.write("no data\n")

    return Response(
        buf.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=transitops_report.csv"},
    )


# ---------------------------------------------------------------------------
<<<<<<< HEAD
# Frontend entrypoint
# ---------------------------------------------------------------------------

@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/styles.css")
def serve_styles():
    return send_from_directory(FRONTEND_DIR, "styles.css")


@app.get("/app.js")
def serve_app_js():
    return send_from_directory(FRONTEND_DIR, "app.js")


# ---------------------------------------------------------------------------
=======
>>>>>>> bf849d6190ec16ca66680f37f6bd79531549ac33
# Health & bootstrap
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


def init_db():
    with app.app_context():
        db.create_all()


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=8000)
