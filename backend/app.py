import os
import csv
import io
import uuid
from datetime import datetime, date, timedelta

from flask import Flask, request, jsonify, Response, send_from_directory, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

from models import (
    db, User, Vehicle, Driver, Trip, MaintenanceLog, FuelLog, Expense,
    SafetyIncident, VehicleDocument,
    ROLES, VEHICLE_STATUSES, DRIVER_STATUSES, DOCUMENT_TYPES,
)
from auth import generate_token, require_auth, require_role

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))

# Vehicle-document upload constraints
ALLOWED_DOC_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
MAX_DOC_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

# List pagination
DEFAULT_PAGE_LIMIT = 50

app = Flask(__name__)
CORS(
    app,
    resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}},
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["X-Total-Count"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    supports_credentials=True,
)
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


def paginate(query):
    """Apply ?limit / ?offset to a query. Defaults to 50/page. `limit=0` (or
    `limit=all`) returns every row (used by dashboard / dispatch / report callers
    that need the full set). Returns (items, total_count)."""
    total = query.count()
    offset_raw = request.args.get("offset", "0")
    limit_raw = request.args.get("limit")
    try:
        offset = max(0, int(offset_raw))
    except (TypeError, ValueError):
        offset = 0

    if limit_raw is None:
        limit = DEFAULT_PAGE_LIMIT
    elif str(limit_raw).lower() in ("0", "all"):
        limit = None  # unbounded
    else:
        try:
            limit = max(1, int(limit_raw))
        except (TypeError, ValueError):
            limit = DEFAULT_PAGE_LIMIT

    q = query.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    return q.all(), total


def paginated_json(items, total):
    """jsonify a list and attach the total row count as a response header."""
    resp = jsonify(items)
    resp.headers["X-Total-Count"] = str(total)
    return resp


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
    include_archived = request.args.get("include_archived") == "true"

    # Archived vehicles are hidden from dispatch/selection pools and default
    # lists, but preserved for historical reports.
    if not include_archived:
        q = q.filter_by(is_archived=False)
    if status:
        q = q.filter_by(status=status)
    if v_type:
        q = q.filter_by(type=v_type)
    if region:
        q = q.filter_by(region=region)
    if dispatchable == "true":
        q = q.filter_by(status="Available", is_archived=False)

    q = q.order_by(Vehicle.id.desc())
    vehicles, total = paginate(q)
    return paginated_json([v.to_dict() for v in vehicles], total)


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
    """Soft-delete: archive the vehicle instead of physically removing it, so
    trip / maintenance / fuel / expense history stays intact and report totals
    don't break. Archived vehicles are excluded from dispatch pools and default
    list views but remain joinable for historical reports."""
    vehicle = Vehicle.query.get(vehicle_id)
    if not vehicle:
        return err("Vehicle not found", 404)
    if vehicle.status == "On Trip":
        return err("Cannot archive a vehicle that is currently on a trip", 409)
    vehicle.is_archived = True
    db.session.commit()
    return jsonify({"ok": True, "archived": True, "vehicle": vehicle.to_dict()})


@app.post("/api/vehicles/<int:vehicle_id>/restore")
@require_auth
@require_role("fleet_manager")
def restore_vehicle(vehicle_id):
    vehicle = Vehicle.query.get(vehicle_id)
    if not vehicle:
        return err("Vehicle not found", 404)
    vehicle.is_archived = False
    db.session.commit()
    return jsonify(vehicle.to_dict())


# ---------------------------------------------------------------------------
# Drivers
# ---------------------------------------------------------------------------

@app.get("/api/drivers")
@require_auth
def list_drivers():
    q = Driver.query
    status = request.args.get("status")
    dispatchable = request.args.get("dispatchable")
    include_archived = request.args.get("include_archived") == "true"

    if not include_archived:
        q = q.filter_by(is_archived=False)
    if status:
        q = q.filter_by(status=status)

    # Dispatchable pool excludes archived, suspended, on-trip and expired-license
    # drivers — resolved before pagination so the filter can't be truncated away.
    if dispatchable == "true":
        drivers = q.filter_by(status="Available").order_by(Driver.id.desc()).all()
        result = [d.to_dict() for d in drivers if not d.is_license_expired()]
        return jsonify(result)

    q = q.order_by(Driver.id.desc())
    drivers, total = paginate(q)
    return paginated_json([d.to_dict() for d in drivers], total)


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
    """Soft-delete: archive the driver (preserving trip / incident history)
    instead of a hard delete that would orphan rows or throw an IntegrityError."""
    driver = Driver.query.get(driver_id)
    if not driver:
        return err("Driver not found", 404)
    if driver.status == "On Trip":
        return err("Cannot archive a driver that is currently on a trip", 409)
    driver.is_archived = True
    db.session.commit()
    return jsonify({"ok": True, "archived": True, "driver": driver.to_dict()})


@app.post("/api/drivers/<int:driver_id>/restore")
@require_auth
@require_role("fleet_manager", "safety_officer")
def restore_driver(driver_id):
    driver = Driver.query.get(driver_id)
    if not driver:
        return err("Driver not found", 404)
    driver.is_archived = False
    db.session.commit()
    return jsonify(driver.to_dict())


# ---------------------------------------------------------------------------
# Safety incidents  (Safety Officer records events that adjust safety_score)
# ---------------------------------------------------------------------------

@app.get("/api/drivers/<int:driver_id>/incidents")
@require_auth
def list_incidents(driver_id):
    driver = Driver.query.get(driver_id)
    if not driver:
        return err("Driver not found", 404)
    incidents = (
        SafetyIncident.query.filter_by(driver_id=driver_id)
        .order_by(SafetyIncident.id.desc())
        .all()
    )
    return jsonify([i.to_dict() for i in incidents])


@app.post("/api/drivers/<int:driver_id>/incident")
@require_auth
@require_role("safety_officer", "fleet_manager")
def record_incident(driver_id):
    """Log a safety incident and deduct points from the driver's safety_score.
    Safety score is clamped to the 0-100 range."""
    driver = Driver.query.get(driver_id)
    if not driver:
        return err("Driver not found", 404)
    data = request.get_json(force=True, silent=True) or {}
    reason = (data.get("reason") or "").strip()
    if not reason:
        return err("reason is required")
    try:
        points = float(data.get("points", 0))
    except (TypeError, ValueError):
        return err("points must be a number")
    if points <= 0:
        return err("points must be a positive number of points to deduct")

    driver.safety_score = max(0.0, driver.safety_score - points)
    incident = SafetyIncident(driver_id=driver.id, points_deducted=points, reason=reason)
    db.session.add(incident)
    db.session.commit()
    return jsonify({"driver": driver.to_dict(), "incident": incident.to_dict()}), 201


# ---------------------------------------------------------------------------
# Trips  (core business-rule engine)
# ---------------------------------------------------------------------------

@app.get("/api/trips")
@require_auth
def list_trips():
    q = Trip.query
    status = request.args.get("status")
    driver_id = request.args.get("driver_id")
    if status:
        q = q.filter_by(status=status)
    if driver_id:
        try:
            q = q.filter_by(driver_id=int(driver_id))
        except (TypeError, ValueError):
            return err("driver_id must be an integer")
    q = q.order_by(Trip.id.desc())
    trips, total = paginate(q)
    return paginated_json([t.to_dict() for t in trips], total)


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

    # Safety-score reward: a clean trip completion nudges the driver's score up
    # by +0.5, capped at 100. Incidents (see /drivers/<id>/incident) deduct it.
    # Formula:  new_score = min(100, safety_score + 0.5)
    driver.safety_score = min(100.0, (driver.safety_score or 0) + 0.5)

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
    q = q.order_by(MaintenanceLog.id.desc())
    logs, total = paginate(q)
    return paginated_json([m.to_dict() for m in logs], total)


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
    q = q.order_by(FuelLog.id.desc())
    logs, total = paginate(q)
    return paginated_json([f.to_dict() for f in logs], total)


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
    q = q.order_by(Expense.id.desc())
    expenses, total = paginate(q)
    return paginated_json([e.to_dict() for e in expenses], total)


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
    status = request.args.get("status")

    # Archived vehicles never count toward the live status board.
    vq = Vehicle.query.filter_by(is_archived=False)
    if v_type:
        vq = vq.filter_by(type=v_type)
    if region:
        vq = vq.filter_by(region=region)
    if status:
        vq = vq.filter_by(status=status)
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


@app.get("/api/dashboard/facets")
@require_auth
def dashboard_facets():
    """Distinct vehicle types & regions (from live, non-archived vehicles) so the
    dashboard filter dropdowns can be populated. Statuses are a fixed enum."""
    vehicles = Vehicle.query.filter_by(is_archived=False).all()
    types = sorted({v.type for v in vehicles if v.type})
    regions = sorted({v.region for v in vehicles if v.region})
    return jsonify({"types": types, "regions": regions, "statuses": VEHICLE_STATUSES})


# ---------------------------------------------------------------------------
# Compliance  (proactive expiry surfacing for Safety Officers)
# ---------------------------------------------------------------------------

def send_expiry_reminder(driver):
    """Hook point for wiring a real email/SMS provider later. For now it just
    records intent to the server log — no fake email is dispatched. Wire this to
    an SMTP / provider call to enable real reminders.

    Returns a small dict describing the (would-be) notification."""
    payload = {
        "to": driver.contact_number,
        "driver": driver.name,
        "license_expiry": driver.license_expiry.isoformat(),
        "days_left": driver.days_to_license_expiry(),
    }
    app.logger.info("send_expiry_reminder (stub, not dispatched): %s", payload)
    return payload


@app.get("/api/compliance/alerts")
@require_auth
def compliance_alerts():
    """Licenses (and vehicle documents) expiring soon, soonest-first. `?within`
    controls the look-ahead window in days (default 30). Already-expired items
    are always included."""
    try:
        within = int(request.args.get("within", 30))
    except (TypeError, ValueError):
        within = 30

    drivers = Driver.query.filter_by(is_archived=False).all()
    license_alerts = []
    for d in drivers:
        days = d.days_to_license_expiry()
        if days <= within:
            license_alerts.append({
                "driver_id": d.id,
                "driver_name": d.name,
                "license_number": d.license_number,
                "license_expiry": d.license_expiry.isoformat(),
                "days_left": days,
                "expired": d.is_license_expired(),
                "safety_score": d.safety_score,
            })
    license_alerts.sort(key=lambda a: a["days_left"])

    doc_alerts = []
    for doc in VehicleDocument.query.all():
        if doc.expiry_date is None:
            continue
        days = (doc.expiry_date - date.today()).days
        if days <= within:
            doc_alerts.append({
                "document_id": doc.id,
                "vehicle_id": doc.vehicle_id,
                "vehicle_reg": doc.vehicle.reg_number if doc.vehicle else None,
                "doc_type": doc.doc_type,
                "file_name": doc.file_name,
                "expiry_date": doc.expiry_date.isoformat(),
                "days_left": days,
                "expired": doc.is_expired(),
            })
    doc_alerts.sort(key=lambda a: a["days_left"])

    return jsonify({
        "within_days": within,
        "license_alerts": license_alerts,
        "document_alerts": doc_alerts,
    })


# ---------------------------------------------------------------------------
# Vehicle documents  (registration / insurance / permits)
# ---------------------------------------------------------------------------

@app.get("/api/vehicles/<int:vehicle_id>/documents")
@require_auth
def list_documents(vehicle_id):
    if not Vehicle.query.get(vehicle_id):
        return err("Vehicle not found", 404)
    docs = (
        VehicleDocument.query.filter_by(vehicle_id=vehicle_id)
        .order_by(VehicleDocument.id.desc())
        .all()
    )
    return jsonify([d.to_dict() for d in docs])


@app.post("/api/vehicles/<int:vehicle_id>/documents")
@require_auth
@require_role("fleet_manager")
def upload_document(vehicle_id):
    vehicle = Vehicle.query.get(vehicle_id)
    if not vehicle:
        return err("Vehicle not found", 404)

    if "file" not in request.files:
        return err("A file part is required (multipart/form-data)")
    file = request.files["file"]
    if not file or not file.filename:
        return err("No file selected")

    doc_type = (request.form.get("doc_type") or "Other").strip()
    if doc_type not in DOCUMENT_TYPES:
        return err(f"doc_type must be one of {DOCUMENT_TYPES}")

    original = secure_filename(file.filename)
    ext = os.path.splitext(original)[1].lower()
    if ext not in ALLOWED_DOC_EXTENSIONS:
        return err(f"File type {ext or '(none)'} not allowed. Allowed: "
                   f"{sorted(ALLOWED_DOC_EXTENSIONS)}", 422)

    # size check (read into memory once — files are small & capped)
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_DOC_SIZE_BYTES:
        return err(f"File exceeds max size of {MAX_DOC_SIZE_BYTES // (1024 * 1024)} MB", 422)

    expiry_date = None
    if request.form.get("expiry_date"):
        try:
            expiry_date = parse_date(request.form["expiry_date"], "expiry_date")
        except ValueError as e:
            return err(str(e))

    stored_name = f"{vehicle_id}_{uuid.uuid4().hex}{ext}"
    file.save(os.path.join(UPLOAD_DIR, stored_name))

    doc = VehicleDocument(
        vehicle_id=vehicle_id,
        doc_type=doc_type,
        file_name=original,
        stored_name=stored_name,
        expiry_date=expiry_date,
    )
    db.session.add(doc)
    db.session.commit()
    return jsonify(doc.to_dict()), 201


@app.get("/api/documents/<int:doc_id>/download")
@require_auth
def download_document(doc_id):
    doc = VehicleDocument.query.get(doc_id)
    if not doc:
        return err("Document not found", 404)
    path = os.path.join(UPLOAD_DIR, doc.stored_name)
    if not os.path.exists(path):
        return err("Stored file is missing on disk", 410)
    return send_file(path, as_attachment=True, download_name=doc.file_name)


@app.delete("/api/documents/<int:doc_id>")
@require_auth
@require_role("fleet_manager")
def delete_document(doc_id):
    doc = VehicleDocument.query.get(doc_id)
    if not doc:
        return err("Document not found", 404)
    path = os.path.join(UPLOAD_DIR, doc.stored_name)
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass
    db.session.delete(doc)
    db.session.commit()
    return jsonify({"ok": True})


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


def _cost_breakdown():
    """Fleet-wide operational cost split by category, for the cost pie/bar."""
    fuel = sum(f.cost for f in FuelLog.query.all())
    maintenance = sum(m.cost for m in MaintenanceLog.query.all())
    other = sum(e.amount for e in Expense.query.all())
    return {"Fuel": round(fuel, 2), "Maintenance": round(maintenance, 2), "Other": round(other, 2)}


def _utilization_trend(days=14):
    """Completed-trip count per day over the trailing window — a simple stand-in
    for a fleet-utilization trend line (charts consume this)."""
    today = date.today()
    window = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    counts = {d.isoformat(): 0 for d in window}
    start = window[0]
    for t in Trip.query.filter(Trip.status == "Completed").all():
        if t.completed_at and t.completed_at.date() >= start:
            key = t.completed_at.date().isoformat()
            if key in counts:
                counts[key] += 1
    return [{"date": k, "completed_trips": v} for k, v in counts.items()]


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
        "cost_breakdown": _cost_breakdown(),
        "utilization_trend": _utilization_trend(),
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


@app.get("/api/reports/print")
@require_auth
def export_print():
    """Server-rendered, print-styled HTML of the report (same data as the CSV).
    The frontend opens this in a window and triggers print → the browser's
    'Save as PDF' produces the PDF, so no PDF library dependency is needed."""
    vehicles = Vehicle.query.all()
    rows = [_vehicle_report_row(v) for v in vehicles]
    breakdown = _cost_breakdown()
    generated = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    def cell(v):
        return f"<td>{v}</td>"

    body_rows = "".join(
        "<tr>"
        + cell(r["reg_number"]) + cell(r["name"]) + cell(r["completed_trips"])
        + cell(f'{r["total_distance_km"]:,} km') + cell(r["fuel_efficiency_km_per_l"])
        + cell(f'₹{r["operational_cost"]:,.0f}') + cell(f'₹{r["total_revenue"]:,.0f}')
        + cell(f'{r["vehicle_roi"] * 100:.1f}%')
        + "</tr>"
        for r in rows
    ) or '<tr><td colspan="8">No data yet.</td></tr>'

    html = f"""<!doctype html><html><head><meta charset="utf-8">
<title>TransitOps Report — {generated}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: Georgia, 'Times New Roman', serif; color: #17140d; margin: 40px; }}
  h1 {{ font-size: 26px; margin: 0 0 4px; letter-spacing: -0.02em; }}
  .meta {{ color: #6a6350; font-size: 12px; margin-bottom: 24px; font-family: monospace; }}
  .accent {{ color: #E5431B; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }}
  th, td {{ text-align: left; padding: 7px 10px; border-bottom: 1px solid #cfc7b2; }}
  th {{ text-transform: uppercase; letter-spacing: 1px; font-size: 10px; font-family: monospace; }}
  td:nth-child(n+3), th:nth-child(n+3) {{ text-align: right; }}
  .summary {{ margin: 20px 0; font-size: 13px; }}
  .summary span {{ display: inline-block; margin-right: 28px; }}
  @media print {{ body {{ margin: 12mm; }} .noprint {{ display: none; }} }}
</style></head><body onload="window.print()">
  <h1>TransitOps <span class="accent">//</span> Fleet Report</h1>
  <div class="meta">Generated {generated}</div>
  <div class="summary">
    <span>Fuel: <b>₹{breakdown['Fuel']:,.0f}</b></span>
    <span>Maintenance: <b>₹{breakdown['Maintenance']:,.0f}</b></span>
    <span>Other: <b>₹{breakdown['Other']:,.0f}</b></span>
  </div>
  <table>
    <thead><tr>
      <th>Reg No.</th><th>Name</th><th>Trips</th><th>Distance</th>
      <th>Fuel Eff. (km/L)</th><th>Op. Cost</th><th>Revenue</th><th>ROI</th>
    </tr></thead>
    <tbody>{body_rows}</tbody>
  </table>
</body></html>"""
    return Response(html, mimetype="text/html")


# ---------------------------------------------------------------------------
# Frontend entrypoint
# ---------------------------------------------------------------------------

@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/styles.css")
def serve_styles():
    return send_from_directory(FRONTEND_DIR, "styles.css")


@app.get("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, "js"), filename)


@app.get("/app.js")
def serve_app_js():
    return send_from_directory(FRONTEND_DIR, "app.js")


@app.get("/js/<path:filename>")
def serve_js_modules(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, "js"), filename)


# ---------------------------------------------------------------------------
# Health & bootstrap
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


def seed_demo_data():
    demo_users = [
        ("manager@transitops.dev", "password123", "Priya Sharma", "fleet_manager"),
        ("safety@transitops.dev", "password123", "Arjun Mehta", "safety_officer"),
        ("finance@transitops.dev", "password123", "Kavya Rao", "financial_analyst"),
        ("driver@transitops.dev", "password123", "Alex Fernandes", "driver"),
    ]

    for email, password, name, role in demo_users:
        user = User.query.filter_by(email=email).first()
        if user is None:
            user = User(email=email, name=name, role=role)
            user.set_password(password)
            db.session.add(user)
        elif user.check_password(password) is False:
            user.set_password(password)
            db.session.add(user)

    db.session.commit()
    return True


def _migrate_add_columns():
    """Lightweight SQLite migration: add columns introduced after the DB was
    first created (create_all() never ALTERs existing tables). Idempotent."""
    from sqlalchemy import inspect, text
    inspector = inspect(db.engine)
    wanted = {
        "vehicle": [("is_archived", "BOOLEAN NOT NULL DEFAULT 0")],
        "driver": [("is_archived", "BOOLEAN NOT NULL DEFAULT 0")],
    }
    for table, columns in wanted.items():
        if not inspector.has_table(table):
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        for name, ddl in columns:
            if name not in existing:
                db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
    db.session.commit()


def init_db():
    with app.app_context():
        db.create_all()
        _migrate_add_columns()
        seed_demo_data()


if __name__ == "__main__":
    init_db()
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False)
