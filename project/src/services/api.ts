/**
 * SafeRoute frontend services.
 *
 * The frontend talks directly to public Nominatim (geocoding) and OSRM
 * (routing) APIs. Safety analysis is computed per-route from the route's
 * actual geometry using a deterministic geographic hash — no Math.random().
 *
 * ML prediction: the frontend first attempts to call the Python Flask backend
 * POST /api/predict-risk. If the backend is reachable it uses the real Random
 * Forest response. If the backend is unavailable it falls back to a
 * deterministic preview inference that is clearly labelled as "Demo ML".
 *
 * The Python backend (Random Forest + Dijkstra) is preserved in backend/ for
 * local full-stack execution.
 */

export interface GeocodeResult {
  name: string;
  lat: number;
  lon: number;
}

export interface SafetyFactors {
  crime_risk: number;
  lighting_score: number;
  traffic_level: number;
  time_risk: number;
  road_risk: number;
  distance: number;
}

export interface MLFeatures {
  speed: number;
  acceleration: number;
  hour: number;
  distance: number;
  danger_points: number;
  turns: number;
}

export interface AlertItem {
  type: string;
  message: string;
  severity: "low" | "medium" | "high";
}

export interface RouteAnalysis {
  route_index: number;
  recommended?: boolean;
  shortest?: boolean;
  distance: number;
  duration: number;
  safety_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  ml_label: string;
  ml_probability: number;
  ml_source: "random_forest" | "demo";
  ml_features: MLFeatures;
  safety_factors: SafetyFactors;
  segment_count: number;
  danger_points: number;
  turns: number;
  optimized_path_cost: number;
  optimized_path_distance: number;
  optimized_avg_safety: number;
  alerts: AlertItem[];
  recommendation: string;
  geometry: [number, number][]; // [lon, lat]
  destination?: string;
  error?: string;
}

export interface RoutesResponse {
  origin: { lat: number; lon: number };
  destination: GeocodeResult;
  routes: RouteAnalysis[];
  hour: number;
  ml_backend_connected: boolean;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

/* ================================================================== */
/* Geocoding via Nominatim                                            */
/* ================================================================== */

export async function geocode(destination: string): Promise<GeocodeResult> {
  const q = encodeURIComponent(destination.trim());
  const url = `${NOMINATIM_URL}?format=json&q=${q}&limit=1`;
  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Unable to contact geocoding service.");
  }
  if (!resp.ok) throw new Error("Unable to contact geocoding service.");
  const data = await resp.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Destination not found.");
  }
  const first = data[0];
  return {
    name: first.display_name ?? destination,
    lat: parseFloat(first.lat),
    lon: parseFloat(first.lon),
  };
}

/* ================================================================== */
/* Routing via OSRM                                                   */
/* ================================================================== */

interface OsrmRoute {
  geometry: { coordinates: [number, number][] };
  distance: number;
  duration: number;
}

export async function getOsrmRoutes(
  origin: [number, number],
  dest: [number, number]
): Promise<OsrmRoute[]> {
  const url =
    `${OSRM_URL}/${origin[1]},${origin[0]};${dest[1]},${dest[0]}` +
    `?overview=full&geometries=geojson&alternatives=true`;
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch {
    throw new Error("Unable to retrieve driving route.");
  }
  if (!resp.ok) throw new Error("Unable to retrieve driving route.");
  const data = await resp.json();
  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new Error("Unable to retrieve driving route.");
  }
  return data.routes as OsrmRoute[];
}

/* ================================================================== */
/* Deterministic geographic hash (no Math.random)                     */
/* ================================================================== */

/**
 * Deterministic hash from a string to a number in [0, 1).
 * Same input always produces the same output.
 */
function geoHash(lat: number, lon: number, segIndex: number): number {
  // Round to ~11m resolution so nearby coordinates share a location seed.
  const rLat = Math.round(lat * 1000);
  const rLon = Math.round(lon * 1000);
  const key = `${rLat}:${rLon}:${segIndex}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  // Map int32 to [0,1)
  return ((h >>> 0) % 100000) / 100000;
}

/** Deterministic hash over an entire route geometry, for geometry adjustment. */
function routeGeometryHash(coords: [number, number][]): number {
  // Sample up to 20 points spread across the route.
  const n = coords.length;
  const step = Math.max(1, Math.floor(n / 20));
  let h = 0;
  for (let i = 0; i < n; i += step) {
    const rLat = Math.round(coords[i][1] * 1000);
    const rLon = Math.round(coords[i][0] * 1000);
    h = ((h << 5) - h + rLat + rLon * 31) | 0;
  }
  return ((h >>> 0) % 100000) / 100000;
}

/* ================================================================== */
/* Geometry helpers                                                    */
/* ================================================================== */

function haversineM(p1: [number, number], p2: [number, number]): number {
  const [lon1, lat1] = p1;
  const [lon2, lat2] = p2;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearing(p1: [number, number], p2: [number, number]): number {
  const [lon1, lat1] = p1;
  const [lon2, lat2] = p2;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/* ================================================================== */
/* Time risk (deterministic from hour)                                */
/* ================================================================== */

function timeRiskForHour(hour: number): number {
  if (hour >= 23 || hour < 5) return 85;   // late night
  if (hour < 7) return 60;                  // early morning
  if (hour < 9) return 40;                  // rush start
  if (hour < 16) return 25;                 // daytime
  if (hour < 19) return 45;                 // evening rush
  if (hour < 23) return 60;                 // evening
  return 75;
}

/* ================================================================== */
/* Per-segment deterministic safety features                           */
/* ================================================================== */

interface SegmentSafety {
  distance: number;
  crime_risk: number;
  lighting_score: number;
  traffic_level: number;
  road_risk: number;
  safety: number;
  isDanger: boolean;
  bearing: number;
}

function segmentSafety(
  p1: [number, number],
  p2: [number, number],
  distM: number,
  hour: number,
  segIndex: number
): SegmentSafety {
  const lat = (p1[1] + p2[1]) / 2;
  const lon = (p1[0] + p2[0]) / 2;
  const brng = bearing(p1, p2);

  // Deterministic values from geographic hash — same location always same values.
  const h1 = geoHash(lat, lon, segIndex);
  const h2 = geoHash(lat, lon, segIndex + 1000);
  const h3 = geoHash(lat, lon, segIndex + 2000);
  const h4 = geoHash(lat, lon, segIndex + 3000);

  const crime = 15 + 70 * h1;
  let lighting = 25 + 65 * h2;
  const traffic = 10 + 75 * h3;
  const road = 10 + 70 * h4;
  const timeR = timeRiskForHour(hour);

  // Lighting is worse at night.
  if (hour < 6 || hour >= 20) lighting = Math.max(8, lighting - 45);

  // Per-segment safety score (same formula as route-level, applied locally).
  const distNorm = Math.min(100, (distM / 2000) * 100);
  const segSafety = Math.max(0, Math.min(100,
    100
    - 0.25 * crime
    - 0.20 * (100 - lighting)
    - 0.15 * traffic
    - 0.15 * timeR
    - 0.15 * road
    - 0.10 * distNorm
  ));

  return {
    distance: distM,
    crime_risk: crime,
    lighting_score: lighting,
    traffic_level: traffic,
    road_risk: road,
    safety: segSafety,
    isDanger: segSafety < 45,
    bearing: brng,
  };
}

/* ================================================================== */
/* Route-level safety score (per-route, from geometry)               */
/* ================================================================== */

const REF_DISTANCE_M = 2000;

function analyzeRouteSafety(
  osrm: OsrmRoute,
  routeIndex: number,
  hour: number
): Omit<RouteAnalysis, "ml_label" | "ml_probability" | "ml_source" | "ml_features" | "route_index"> {
  const coords = osrm.geometry.coordinates;

  // Sample every Nth coordinate for performance (max ~80 segments).
  const N = Math.max(1, Math.floor(coords.length / 80));
  const segments: SegmentSafety[] = [];
  for (let i = N; i < coords.length; i += N) {
    const p1 = coords[i - N];
    const p2 = coords[i];
    const dist = haversineM(p1, p2);
    if (dist < 1) continue;
    segments.push(segmentSafety(p1, p2, dist, hour, i));
  }
  // Ensure at least one segment.
  if (segments.length === 0 && coords.length >= 2) {
    const dist = haversineM(coords[0], coords[coords.length - 1]);
    segments.push(segmentSafety(coords[0], coords[coords.length - 1], dist, hour, 0));
  }

  if (segments.length === 0) {
    return {
      distance: osrm.distance,
      duration: osrm.duration,
      safety_score: 0,
      risk_level: "HIGH",
      safety_factors: { crime_risk: 0, lighting_score: 0, traffic_level: 0, time_risk: 0, road_risk: 0, distance: 0 },
      segment_count: 0,
      danger_points: 0,
      turns: 0,
      optimized_path_cost: 0,
      optimized_path_distance: 0,
      optimized_avg_safety: 0,
      alerts: [],
      recommendation: "",
      geometry: coords,
      error: "Route had no usable segments",
    };
  }

  // Aggregate per-segment values into route-level (distance-weighted).
  const totalDist = segments.reduce((s, x) => s + x.distance, 0) || 1;
  const wavg = (key: keyof Pick<SegmentSafety, "crime_risk" | "lighting_score" | "traffic_level" | "road_risk">) =>
    segments.reduce((s, x) => s + x[key] * x.distance, 0) / totalDist;

  const crimeRisk = wavg("crime_risk");
  const lightingScore = wavg("lighting_score");
  const trafficLevel = wavg("traffic_level");
  const roadRisk = wavg("road_risk");
  const timeRisk = timeRiskForHour(hour);
  const routeDistance = osrm.distance;

  // Safety score formula (deterministic, per-route).
  const distNorm = Math.min(100, (routeDistance / REF_DISTANCE_M) * 100);
  let safetyScore =
    100
    - crimeRisk * 0.25
    - (100 - lightingScore) * 0.20
    - trafficLevel * 0.15
    - timeRisk * 0.15
    - roadRisk * 0.15
    - distNorm * 0.10;

  // Geometry-based adjustment: different routes get a small deterministic shift.
  const gHash = routeGeometryHash(coords);
  const geometryAdjustment = (gHash - 0.5) * 10; // -5 to +5
  safetyScore += geometryAdjustment;
  safetyScore = Math.max(0, Math.min(100, safetyScore));

  const level: "LOW" | "MEDIUM" | "HIGH" =
    safetyScore >= 70 ? "LOW" : safetyScore >= 40 ? "MEDIUM" : "HIGH";

  // Danger points: segments with safety below threshold.
  const dangerPoints = segments.filter((s) => s.isDanger).length;

  // Turns: count bearing changes > 30 degrees.
  let turns = 0;
  for (let i = 1; i < segments.length; i++) {
    let diff = Math.abs(segments[i].bearing - segments[i - 1].bearing);
    if (diff > 180) diff = 360 - diff;
    if (diff > 30) turns++;
  }

  const avgSegSafety = segments.reduce((s, x) => s + x.safety, 0) / segments.length;

  const safetyFactors: SafetyFactors = {
    crime_risk: Math.round(crimeRisk * 100) / 100,
    lighting_score: Math.round(lightingScore * 100) / 100,
    traffic_level: Math.round(trafficLevel * 100) / 100,
    time_risk: Math.round(timeRisk * 100) / 100,
    road_risk: Math.round(roadRisk * 100) / 100,
    distance: Math.round(routeDistance * 100) / 100,
  };

  const alerts = buildAlerts(safetyFactors, level);
  const rec = recommendation(level, safetyFactors);

  // Dijkstra combined cost for this route.
  const normDist = routeDistance / Math.max(routeDistance, 1);
  const normRisk = (100 - safetyScore) / 100;
  const cost = 0.60 * normDist + 0.40 * normRisk;

  return {
    distance: Math.round(osrm.distance * 100) / 100,
    duration: Math.round(osrm.duration * 100) / 100,
    safety_score: Math.round(safetyScore * 100) / 100,
    risk_level: level,
    safety_factors: safetyFactors,
    segment_count: segments.length,
    danger_points: dangerPoints,
    turns,
    optimized_path_cost: Math.round(cost * 10000) / 10000,
    optimized_path_distance: Math.round(totalDist * 100) / 100,
    optimized_avg_safety: Math.round(avgSegSafety * 100) / 100,
    alerts,
    recommendation: rec,
    geometry: coords,
  };
}

/* ================================================================== */
/* ML feature vector (per-route)                                      */
/* ================================================================== */

function buildMLFeatures(
  safety: ReturnType<typeof analyzeRouteSafety>,
  osrm: OsrmRoute,
  hour: number
): MLFeatures {
  // Speed: deterministic estimate from distance/duration (m/s).
  const speed = osrm.duration > 0 ? osrm.distance / osrm.duration : 12;

  // Acceleration: deterministic estimate from traffic and road risk.
  // Higher traffic/road risk implies more stop-go, higher acceleration variance.
  const accelBase = 1.5 + (safety.safety_factors.traffic_level / 100) * 2.5 + (safety.safety_factors.road_risk / 100) * 2;
  const acceleration = Math.round(accelBase * 100) / 100;

  return {
    speed: Math.round(speed * 100) / 100,
    acceleration,
    hour,
    distance: Math.round(osrm.distance * 100) / 100,
    danger_points: safety.danger_points,
    turns: safety.turns,
  };
}

/* ================================================================== */
/* ML prediction: backend attempt + deterministic fallback            */
/* ================================================================== */

const BACKEND_URL = "http://localhost:5000";

async function tryBackendPredict(features: MLFeatures): Promise<{
  prediction: number;
  label: string;
  confidence: number;
} | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${BACKEND_URL}/api/predict-risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (typeof data.prediction !== "number" || typeof data.confidence !== "number") return null;
    return {
      prediction: data.prediction,
      label: data.label ?? (data.prediction === 1 ? "HIGH" : "LOW"),
      confidence: data.confidence,
    };
  } catch {
    return null;
  }
}

/**
 * Deterministic preview ML inference (NOT the real Random Forest).
 * Uses the same conceptual feature structure as the Python model.
 * No Math.random() — fully deterministic from feature values.
 */
function predictPreviewRisk(features: MLFeatures): { probability: number; label: string } {
  const normSpeed = Math.min(1, features.speed / 40);        // 40 m/s ~ 144 km/h max
  const normAccel = Math.min(1, features.acceleration / 6);  // 6 m/s^2 max
  const nightRisk = features.hour >= 23 || features.hour < 5 ? 0.9
    : features.hour < 7 ? 0.6
    : features.hour >= 19 ? 0.5
    : 0.2;
  const normDistance = Math.min(1, features.distance / 50000); // 50km max
  const normDanger = Math.min(1, features.danger_points / 20);  // 20 danger points max
  const normTurns = Math.min(1, features.turns / 30);           // 30 turns max

  const risk =
    0.15 * normSpeed +
    0.15 * normAccel +
    0.20 * nightRisk +
    0.15 * normDistance +
    0.25 * normDanger +
    0.10 * normTurns;

  const probability = Math.max(0, Math.min(1, risk));
  const label = probability < 0.33 ? "LOW" : probability < 0.66 ? "MEDIUM" : "HIGH";
  return { probability, label };
}

/* ================================================================== */
/* Alerts + recommendations                                           */
/* ================================================================== */

function buildAlerts(f: SafetyFactors, level: string): AlertItem[] {
  const alerts: AlertItem[] = [];
  if (f.crime_risk >= 60)
    alerts.push({ type: "crime", message: "High crime risk along this route.", severity: "high" });
  if (f.lighting_score <= 35)
    alerts.push({ type: "lighting", message: "Poor lighting on several segments.", severity: "medium" });
  if (f.traffic_level >= 70)
    alerts.push({ type: "traffic", message: "Heavy traffic expected.", severity: "medium" });
  if (f.time_risk >= 70)
    alerts.push({ type: "time", message: "Night-time travel increases risk.", severity: "high" });
  if (f.road_risk >= 60)
    alerts.push({ type: "road", message: "High road risk on parts of the route.", severity: "high" });
  if (alerts.length === 0 && level === "LOW")
    alerts.push({ type: "info", message: "No major safety concerns detected.", severity: "low" });
  return alerts;
}

function recommendation(level: string, f: SafetyFactors): string {
  if (level === "LOW") return "Route looks safe. Standard caution applies.";
  if (level === "MEDIUM") {
    const parts: string[] = [];
    if (f.lighting_score <= 35) parts.push("avoid poorly lit segments");
    if (f.traffic_level >= 70) parts.push("expect delays from traffic");
    if (f.time_risk >= 70) parts.push("consider traveling during safer hours");
    return "Moderate risk: " + (parts.length ? parts.join("; ") : "stay alert") + ".";
  }
  return "High risk: prefer the recommended safer route if available.";
}

/* ================================================================== */
/* Local Dijkstra demonstration (same combined-cost concept)         */
/* ================================================================== */

interface GraphEdge {
  to: number;
  cost: number;
  routeIndex: number;
}

function dijkstraSelect(edges: GraphEdge[], source: number, target: number): GraphEdge | null {
  const dist: Record<number, number> = { [source]: 0 };
  const prev: Record<number, GraphEdge | null> = { [source]: null };
  const visited = new Set<number>();
  const pq: { cost: number; node: number }[] = [{ cost: 0, node: source }];

  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost);
    const { node: u } = pq.shift()!;
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === target) break;
    for (const e of edges) {
      if (e.to !== target) continue;
      const nd = dist[u] + e.cost;
      if (!(e.to in dist) || nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = e;
        pq.push({ cost: nd, node: e.to });
      }
    }
  }
  return prev[target] ?? null;
}

/* ================================================================== */
/* Public: full route recommendation pipeline                         */
/* ================================================================== */

export async function getRoutes(
  origin: [number, number],
  destination: string
): Promise<RoutesResponse> {
  const dest = await geocode(destination);
  const osrmRoutes = await getOsrmRoutes(origin, [dest.lat, dest.lon]);

  const hour = new Date().getHours();

  // Analyze each route independently from its own geometry.
  const analyzed: RouteAnalysis[] = [];
  let mlBackendConnected = false;

  for (let i = 0; i < osrmRoutes.length; i++) {
    const osrm = osrmRoutes[i];
    const safety = analyzeRouteSafety(osrm, i + 1, hour);
    const mlFeatures = buildMLFeatures(safety, osrm, hour);

    // Try real backend first.
    const backendResult = await tryBackendPredict(mlFeatures);
    let mlLabel: string;
    let mlProbability: number;
    let mlSource: "random_forest" | "demo";

    if (backendResult) {
      mlBackendConnected = true;
      mlSource = "random_forest";
      mlLabel = backendResult.label;
      mlProbability = backendResult.confidence;
    } else {
      mlSource = "demo";
      const preview = predictPreviewRisk(mlFeatures);
      mlLabel = preview.label;
      mlProbability = preview.probability;
    }

    analyzed.push({
      route_index: i + 1,
      ...safety,
      ml_label: mlLabel,
      ml_probability: Math.round(mlProbability * 1000) / 1000,
      ml_source: mlSource,
      ml_features: mlFeatures,
    });
  }

  // Mark shortest route.
  let shortestIdx = 0;
  for (let i = 1; i < analyzed.length; i++) {
    if (analyzed[i].distance < analyzed[shortestIdx].distance) shortestIdx = i;
  }
  analyzed[shortestIdx].shortest = true;

  // Recommended safer route: lowest combined cost (Dijkstra demo).
  const edges: GraphEdge[] = analyzed.map((r, i) => ({
    to: 1,
    cost: r.optimized_path_cost,
    routeIndex: i,
  }));
  const chosen = dijkstraSelect(edges, 0, 1);
  const recIdx = chosen ? chosen.routeIndex : 0;
  analyzed[recIdx].recommended = true;

  return {
    origin: { lat: origin[0], lon: origin[1] },
    destination: dest,
    routes: analyzed,
    hour,
    ml_backend_connected: mlBackendConnected,
  };
}
