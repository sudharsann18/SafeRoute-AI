"""
SafeRoute Flask backend.

Endpoints:
  GET  /                 -> service info + model metadata
  POST /api/geocode      -> geocode a destination
  POST /api/routes       -> full route recommendation pipeline
  POST /api/predict-risk -> ML risk prediction for given features
  POST /api/optimize-route -> Dijkstra optimization over provided segments
  POST /api/analyze-route  -> analyze a single route's safety

All responses are JSON. CORS is enabled for the React frontend. Errors are
returned as {"error": "..."} without stack traces.
"""

from __future__ import annotations

import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS

from models.risk_model import predict as ml_predict, get_model_info
from services.safety_scoring import compute_safety_score, risk_level
from services.route_service import geocode, recommend_routes, analyze_route, get_osrm_routes
from algorithms.dijkstra import optimize_route

app = Flask(__name__)
CORS(app)


def _json_error(message: str, status: int = 400):
    return jsonify({"error": message}), status


@app.get("/")
def index():
    return jsonify(
        {
            "service": "SafeRoute API",
            "status": "running",
            "model": get_model_info(),
            "endpoints": [
                "GET /",
                "POST /api/geocode",
                "POST /api/routes",
                "POST /api/predict-risk",
                "POST /api/optimize-route",
                "POST /api/analyze-route",
            ],
        }
    )


@app.post("/api/geocode")
def api_geocode():
    data = request.get_json(silent=True) or {}
    destination = (data.get("destination") or "").strip()
    if not destination:
        return _json_error("Missing 'destination' field")
    try:
        result = geocode(destination)
        return jsonify(result)
    except ValueError as exc:
        return _json_error(str(exc), 404)
    except Exception:
        return _json_error("Geocoding service unavailable", 502)


@app.post("/api/routes")
def api_routes():
    data = request.get_json(silent=True) or {}
    origin = data.get("origin")
    destination = (data.get("destination") or "").strip()
    if not origin or not isinstance(origin, (list, tuple)) or len(origin) != 2:
        return _json_error("Missing or invalid 'origin' [lat, lon]")
    if not destination:
        return _json_error("Missing 'destination' field")
    try:
        result = recommend_routes((float(origin[0]), float(origin[1])), destination)
        return jsonify(result)
    except ValueError as exc:
        return _json_error(str(exc), 404)
    except Exception:
        traceback.print_exc()
        return _json_error("Route generation failed", 502)


@app.post("/api/predict-risk")
def api_predict_risk():
    data = request.get_json(silent=True) or {}
    features = data.get("features")
    if not features or not isinstance(features, dict):
        return _json_error("Missing 'features' object")
    required = ["crime_risk", "lighting_score", "traffic_level", "time_risk", "road_risk", "distance"]
    missing = [k for k in required if k not in features]
    if missing:
        return _json_error(f"Missing features: {', '.join(missing)}")
    try:
        result = ml_predict(features)
        return jsonify(result)
    except Exception as exc:
        return _json_error(f"Prediction failed: {exc}", 500)


@app.post("/api/optimize-route")
def api_optimize_route():
    data = request.get_json(silent=True) or {}
    segments = data.get("segments")
    if not segments or not isinstance(segments, list):
        return _json_error("Missing 'segments' list")
    try:
        result = optimize_route(segments)
        return jsonify(result)
    except Exception as exc:
        return _json_error(f"Optimization failed: {exc}", 500)


@app.post("/api/analyze-route")
def api_analyze_route():
    data = request.get_json(silent=True) or {}
    origin = data.get("origin")
    destination = (data.get("destination") or "").strip()
    if not origin or not isinstance(origin, (list, tuple)) or len(origin) != 2:
        return _json_error("Missing or invalid 'origin' [lat, lon]")
    if not destination:
        return _json_error("Missing 'destination' field")
    try:
        import time as _time
        dest = geocode(destination)
        routes = get_osrm_routes((float(origin[0]), float(origin[1])), (dest["lat"], dest["lon"]))
        if not routes:
            return _json_error("No routes found")
        hour = _time.localtime().tm_hour
        analyzed = analyze_route(routes[0], hour)
        analyzed["destination"] = dest["name"]
        return jsonify(analyzed)
    except ValueError as exc:
        return _json_error(str(exc), 404)
    except Exception:
        traceback.print_exc()
        return _json_error("Route analysis failed", 502)


@app.get("/api/model")
def api_model():
    return jsonify(get_model_info())


if __name__ == "__main__":
    # Train/load the model on import already; this print confirms readiness.
    print("SafeRoute backend starting on http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
