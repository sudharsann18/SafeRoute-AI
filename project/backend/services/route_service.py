"""
Route service for SafeRoute.

This module ties together the pieces of the pipeline:
  OSRM route geometry -> segment representation -> safety features ->
  Random Forest prediction -> safety score -> Dijkstra optimization ->
  JSON response for the frontend.

Safety features for each segment are derived deterministically from the
segment's geographic properties (distance, bearing) and the time of day.
This is a prototype: we do NOT claim real crime/traffic data. The values are
synthetic but reproducible and clearly documented.
"""

from __future__ import annotations

import math
import time
import urllib.request
import urllib.parse
import json
from typing import Any

from models.risk_model import predict as ml_predict, get_model_info
from services.safety_scoring import (
    compute_safety_score,
    risk_level,
    aggregate_route_safety,
)
from algorithms.dijkstra import optimize_route

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
USER_AGENT = "SafeRoute/1.0 (college project demo)"


def _http_get_json(url: str, headers: dict | None = None) -> Any:
    """Minimal GET that returns parsed JSON. Raises on HTTP error."""
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def geocode(destination: str) -> dict:
    """Geocode a place name via Nominatim."""
    params = urllib.parse.urlencode({"q": destination, "format": "json", "limit": 1})
    url = f"{NOMINATIM_URL}?{params}"
    data = _http_get_json(url, headers={"User-Agent": USER_AGENT})
    if not data:
        raise ValueError("Destination not found")
    first = data[0]
    return {
        "name": first.get("display_name", destination),
        "lat": float(first["lat"]),
        "lon": float(first["lon"]),
    }


def get_osrm_routes(origin: tuple[float, float], dest: tuple[float, float]) -> list[dict]:
    """Fetch driving routes from OSRM with alternatives."""
    url = f"{OSRM_URL}/{origin[1]},{origin[0]};{dest[1]},{dest[0]}?alternatives=true&overview=full&geometries=geojson"
    data = _http_get_json(url)
    if data.get("code") != "Ok":
        raise ValueError("OSRM routing failed")
    routes = []
    for r in data.get("routes", []):
        routes.append(
            {
                "geometry": r["geometry"]["coordinates"],  # list of [lon, lat]
                "distance": r["distance"],  # meters
                "duration": r["duration"],  # seconds
            }
        )
    return routes


def haversine_m(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """Distance in meters between two [lon, lat] points."""
    lon1, lat1 = p1
    lon2, lat2 = p2
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))


def _bearing(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """Compass bearing 0..359 between two [lon, lat] points."""
    lon1, lat1 = math.radians(p1[0]), math.radians(p1[1])
    lon2, lat2 = math.radians(p2[0]), math.radians(p2[1])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _time_risk(hour: int) -> float:
    """Map hour of day (0..23) to a 0..100 time risk.

    Late night / early morning is riskier. Peak hours have moderate traffic risk.
    """
    if 0 <= hour < 5:
        return 85.0
    if 5 <= hour < 7:
        return 55.0
    if 7 <= hour < 9:
        return 40.0
    if 9 <= hour < 16:
        return 25.0
    if 16 <= hour < 19:
        return 45.0
    if 19 <= hour < 22:
        return 55.0
    return 75.0


def _segment_features(distance_m: float, bearing: float, hour: int, seg_index: int) -> dict:
    """Deterministically derive synthetic safety features for a segment.

    We use the segment's bearing and index as a pseudo-location seed so that
    different parts of a city get different (but stable) values. No randomness
    is used in the final safety score; these features are deterministic.
    """
    # Pseudo-random but deterministic from bearing + index.
    def norm(x):
        return (math.sin(x) * 43758.5453) % 1.0

    seed = bearing + seg_index * 13.0
    crime = 20 + 60 * norm(seed)
    lighting = 30 + 60 * norm(seed + 1.7)
    traffic = 10 + 70 * norm(seed + 3.3)
    road = 15 + 65 * norm(seed + 5.1)
    time_r = _time_risk(hour)

    # Lighting is worse at night regardless of the pseudo-seed.
    if 0 <= hour < 6 or hour >= 20:
        lighting = max(10, lighting - 40)

    return {
        "crime_risk": round(crime, 2),
        "lighting_score": round(lighting, 2),
        "traffic_level": round(traffic, 2),
        "time_risk": round(time_r, 2),
        "road_risk": round(road, 2),
        "distance": round(distance_m, 2),
    }


def analyze_route(route: dict, hour: int) -> dict:
    """Analyze a single candidate route end-to-end.

    Steps:
      1. Split geometry into segments.
      2. Compute per-segment features.
      3. Run ML prediction per segment.
      4. Compute per-segment safety score.
      5. Build a graph and run Dijkstra to find the safer sub-path.
      6. Aggregate into route-level metrics.
    """
    coords = route["geometry"]
    segments = []
    for i in range(1, len(coords)):
        p1 = coords[i - 1]
        p2 = coords[i]
        dist = haversine_m(p1, p2)
        if dist < 1:
            continue
        bearing = _bearing(p1, p2)
        feats = _segment_features(dist, bearing, hour, i)
        seg_safety = compute_safety_score(
            crime_risk=feats["crime_risk"],
            lighting_score=feats["lighting_score"],
            traffic_level=feats["traffic_level"],
            time_risk=feats["time_risk"],
            road_risk=feats["road_risk"],
            distance_m=feats["distance"],
        )
        ml = ml_predict(feats)
        segments.append(
            {
                "from_node": i - 1,
                "to_node": i,
                "distance": dist,
                "safety_score": round(seg_safety, 2),
                "features": feats,
                "ml_prediction": ml["prediction"],
                "ml_label": ml["label"],
                "ml_confidence": ml["confidence"],
            }
        )

    if not segments:
        raise ValueError("Route had no usable segments")

    # Dijkstra optimization over the segment graph.
    optimized = optimize_route(segments)

    # Aggregate features for the whole route (distance-weighted).
    agg = aggregate_route_safety([{"distance": s["distance"], **s["features"]} for s in segments])
    route_safety = compute_safety_score(
        crime_risk=agg["crime_risk"],
        lighting_score=agg["lighting_score"],
        traffic_level=agg["traffic_level"],
        time_risk=agg["time_risk"],
        road_risk=agg["road_risk"],
        distance_m=agg["distance"],
    )
    level = risk_level(route_safety)

    # ML prediction at the route level: use aggregated features.
    route_ml = ml_predict(agg)

    # Alerts: only when a factor is actually responsible for the risk.
    alerts = _build_alerts(agg, level)

    return {
        "distance": round(route["distance"], 2),
        "duration": round(route["duration"], 2),
        "safety_score": round(route_safety, 2),
        "risk_level": level,
        "ml_prediction": route_ml["prediction"],
        "ml_label": route_ml["label"],
        "ml_confidence": route_ml["confidence"],
        "safety_factors": {
            "crime_risk": round(agg["crime_risk"], 2),
            "lighting_score": round(agg["lighting_score"], 2),
            "traffic_level": round(agg["traffic_level"], 2),
            "time_risk": round(agg["time_risk"], 2),
            "road_risk": round(agg["road_risk"], 2),
            "distance": round(agg["distance"], 2),
        },
        "segment_count": len(segments),
        "optimized_path_cost": optimized["total_cost"],
        "optimized_path_distance": optimized["total_distance"],
        "optimized_avg_safety": optimized["avg_safety"],
        "alerts": alerts,
        "recommendation": _recommendation(level, agg),
        "geometry": coords,
    }


def _build_alerts(agg: dict, level: str) -> list[dict]:
    """Produce alerts only for factors that genuinely contribute to risk."""
    alerts = []
    if agg["crime_risk"] >= 60:
        alerts.append({"type": "crime", "message": "High crime risk along this route.", "severity": "high"})
    if agg["lighting_score"] <= 35:
        alerts.append({"type": "lighting", "message": "Poor lighting on several segments.", "severity": "medium"})
    if agg["traffic_level"] >= 70:
        alerts.append({"type": "traffic", "message": "Heavy traffic expected.", "severity": "medium"})
    if agg["time_risk"] >= 70:
        alerts.append({"type": "time", "message": "Night-time travel increases risk.", "severity": "high"})
    if agg["road_risk"] >= 60:
        alerts.append({"type": "road", "message": "High road risk on parts of the route.", "severity": "high"})
    if not alerts and level == "LOW":
        alerts.append({"type": "info", "message": "No major safety concerns detected.", "severity": "low"})
    return alerts


def _recommendation(level: str, agg: dict) -> str:
    """Short human-readable recommendation."""
    if level == "LOW":
        return "Route looks safe. Standard caution applies."
    if level == "MEDIUM":
        parts = []
        if agg["lighting_score"] <= 35:
            parts.append("avoid poorly lit segments")
        if agg["traffic_level"] >= 70:
            parts.append("expect delays from traffic")
        if agg["time_risk"] >= 70:
            parts.append("consider traveling during safer hours")
        return "Moderate risk: " + ("; ".join(parts) if parts else "stay alert") + "."
    return "High risk: prefer the recommended safer route if available."


def recommend_routes(origin: tuple[float, float], destination_name: str) -> dict:
    """Full pipeline: geocode -> OSRM -> analyze each route -> pick best."""
    dest = geocode(destination_name)
    routes = get_osrm_routes(origin, (dest["lat"], dest["lon"]))
    if not routes:
        raise ValueError("No routes returned by OSRM")

    hour = time.localtime().tm_hour
    analyzed = []
    for idx, r in enumerate(routes):
        try:
            a = analyze_route(r, hour)
            a["route_index"] = idx + 1
            a["destination"] = dest["name"]
            analyzed.append(a)
        except Exception as exc:
            # Skip a route that failed to analyze but keep the others.
            a = {
                "route_index": idx + 1,
                "error": str(exc),
                "distance": round(r["distance"], 2),
                "geometry": r["geometry"],
            }
            analyzed.append(a)

    # Pick the recommended route: highest safety score (tie-break: shorter distance).
    ok = [a for a in analyzed if "safety_score" in a]
    if ok:
        recommended = max(ok, key=lambda a: (a["safety_score"], -a["distance"]))
        recommended["recommended"] = True
        for a in analyzed:
            if a is not recommended:
                a.setdefault("recommended", False)
    else:
        for a in analyzed:
            a.setdefault("recommended", False)

    return {
        "origin": {"lat": origin[0], "lon": origin[1]},
        "destination": dest,
        "routes": analyzed,
        "model_info": get_model_info(),
        "hour": hour,
    }
