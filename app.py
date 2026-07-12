import os
import csv
import io
from datetime import datetime, date

from flask import Flask, request, jsonify, Response
from flask_cors import CORS

from models import (
    db, User, Vehicle, Driver, Trip, MaintenanceLog, FuelLog, Expense,
    ROLES, VEHICLE_STATUSES, DRIVER_STATUSES,
)
from auth import generate_token, require_auth, require_role

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

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


def init_db():
    with app.app_context():
        db.create_all()


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=8000)
