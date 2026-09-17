"""
Safety scoring for SafeRoute.

Given the safety features of a route segment (or an aggregated route), we
compute an overall safety score from 0 to 100 where higher = safer.

Formula (documented):
  penalty = w_crime * crime_risk
          + w_traffic * traffic_level
          + w_time * time_risk
          + w_road * road_risk
          + w_distance * distance_penalty
  lighting_bonus = w_lighting * lighting_score

  safety_score = clamp(100 - penalty + lighting_bonus, 0, 100)

All feature inputs are expected on a 0..100 scale (distance is normalized to
0..100 by dividing by a reference max distance).

Weights sum to 1.0 for the penalties + lighting bonus so the score stays
interpretable. Weights are configurable via the WEIGHTS dict.
"""

from __future__ import annotations

# Reference distance (meters) used to normalize distance into 0..100.
# A 2000m segment is considered "max" for normalization purposes.
REF_DISTANCE_M = 2000.0

WEIGHTS = {
    "crime": 0.30,
    "traffic": 0.15,
    "time": 0.15,
    "road": 0.25,
    "distance": 0.05,
    "lighting": 0.20,
}


def normalize_distance(distance_m: float, ref: float = REF_DISTANCE_M) -> float:
    """Normalize a raw distance in meters to a 0..100 scale."""
    if distance_m <= 0:
        return 0.0
    return min(100.0, (distance_m / ref) * 100.0)


def compute_safety_score(
    crime_risk: float,
    lighting_score: float,
    traffic_level: float,
    time_risk: float,
    road_risk: float,
    distance_m: float,
) -> float:
    """Compute a 0..100 safety score. Higher is safer. No randomness."""
    dist_norm = normalize_distance(distance_m)
    penalty = (
        WEIGHTS["crime"] * crime_risk
        + WEIGHTS["traffic"] * traffic_level
        + WEIGHTS["time"] * time_risk
        + WEIGHTS["road"] * road_risk
        + WEIGHTS["distance"] * dist_norm
    )
    lighting_bonus = WEIGHTS["lighting"] * lighting_score
    score = 100.0 - penalty + lighting_bonus
    return float(max(0.0, min(100.0, score)))


def risk_level(score: float) -> str:
    """Map a safety score to a LOW / MEDIUM / HIGH risk label.

    High score = safe = LOW risk.
    """
    if score >= 70:
        return "LOW"
    if score >= 45:
        return "MEDIUM"
    return "HIGH"


def aggregate_route_safety(segments: list[dict]) -> dict:
    """Aggregate per-segment features into route-level features.

    Each segment dict should contain the safety features plus distance.
    We compute a weighted average by distance so longer segments count more.
    """
    total_distance = sum(s["distance"] for s in segments) or 1.0

    def wavg(key: str) -> float:
        return sum(s.get(key, 0) * s["distance"] for s in segments) / total_distance

    return {
        "crime_risk": wavg("crime_risk"),
        "lighting_score": wavg("lighting_score"),
        "traffic_level": wavg("traffic_level"),
        "time_risk": wavg("time_risk"),
        "road_risk": wavg("road_risk"),
        "distance": total_distance,
    }
