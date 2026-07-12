import os
import jwt
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify

# --- JWT secret resolution ---------------------------------------------------
# In production we REFUSE to fall back to a hardcoded secret: anyone who reads
# the (public) source would then be able to forge tokens. A dev-only fallback is
# kept solely for local runs where FLASK_ENV is not "production".
_DEV_FALLBACK_SECRET = "transitops-hackathon-dev-secret"

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    if os.environ.get("FLASK_ENV", "").lower() == "production":
        raise RuntimeError(
            "JWT_SECRET environment variable is required when FLASK_ENV=production. "
            "Refusing to start with the insecure development fallback secret."
        )
    JWT_SECRET = _DEV_FALLBACK_SECRET

JWT_ALGO = "HS256"
JWT_EXPIRY_HOURS = 12


def generate_token(user):
    payload = {
        "user_id": user.id,
        "role": user.role,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token):
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        token = auth_header.split(" ", 1)[1]
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        request.user_id = payload["user_id"]
        request.user_role = payload["role"]
        return f(*args, **kwargs)
    return wrapper


def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if request.user_role not in roles:
                return jsonify({"error": f"Requires one of roles: {', '.join(roles)}"}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator
