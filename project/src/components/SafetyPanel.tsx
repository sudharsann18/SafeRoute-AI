import { Shield, Brain, AlertTriangle, Lightbulb, Clock, Car, Construction, Map as MapIcon, Gauge, CornerDownRight } from "lucide-react";
import type { RouteAnalysis, SafetyFactors } from "@/services/api";

interface SafetyPanelProps {
  route: RouteAnalysis;
}

const factorConfig: { key: keyof SafetyFactors; label: string; icon: typeof Shield; invert?: boolean }[] = [
  { key: "crime_risk", label: "Crime Risk", icon: Shield },
  { key: "lighting_score", label: "Lighting", icon: Lightbulb, invert: true },
  { key: "traffic_level", label: "Traffic", icon: Car },
  { key: "time_risk", label: "Time Risk", icon: Clock },
  { key: "road_risk", label: "Road Risk", icon: Construction },
  { key: "distance", label: "Distance (m)", icon: MapIcon },
];

function barColor(value: number, invert?: boolean): string {
  const safe = invert ? value : 100 - value;
  if (safe >= 70) return "bg-emerald-500";
  if (safe >= 45) return "bg-amber-500";
  return "bg-red-500";
}

export default function SafetyPanel({ route }: SafetyPanelProps) {
  if (!route) {
    return (
      <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 p-4 text-sm text-slate-400">
        Select a route to see its safety analysis.
      </div>
    );
  }

  const score = route.safety_score;
  const scoreColor = score >= 70 ? "text-emerald-400" : score >= 40 ? "text-amber-400" : "text-red-400";
  const isRandomForest = route.ml_source === "random_forest";

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100 inline-flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" /> Analysis for Route {route.route_index}
        </h3>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${route.risk_level === "LOW" ? "bg-emerald-500/15 text-emerald-300" : route.risk_level === "MEDIUM" ? "bg-amber-500/15 text-amber-300" : "bg-red-500/15 text-red-300"}`}>
          {route.risk_level} RISK
        </span>
      </div>

      {/* Safety score gauge */}
      <div>
        <div className="flex items-end justify-between mb-1">
          <span className="text-xs text-slate-400">Overall Safety Score</span>
          <span className={`text-2xl font-bold ${scoreColor}`}>{score.toFixed(0)}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
          <div
            className={`h-full rounded-full ${score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* ML prediction */}
      <div className="rounded-lg bg-slate-800/60 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-slate-300">ML Prediction</span>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-100">
            {isRandomForest ? "Random Forest" : "Demo ML (backend offline)"}
          </div>
          <div className="text-xs text-slate-300">
            {route.ml_label} — probability {(route.ml_probability * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] text-slate-500">
            {isRandomForest
              ? "Random Forest backend connected"
              : "Deterministic preview inference — connect Flask backend for Random Forest prediction."}
          </div>
        </div>
      </div>

      {/* ML features */}
      <div className="rounded-lg bg-slate-800/40 p-3 text-xs text-slate-300 space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">ML Feature Vector</div>
        <div className="flex justify-between"><span className="inline-flex items-center gap-1"><Gauge className="w-3 h-3" /> Speed</span><span className="text-slate-100">{route.ml_features.speed.toFixed(1)} m/s</span></div>
        <div className="flex justify-between"><span className="inline-flex items-center gap-1"><Gauge className="w-3 h-3" /> Acceleration</span><span className="text-slate-100">{route.ml_features.acceleration.toFixed(2)} m/s²</span></div>
        <div className="flex justify-between"><span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Hour</span><span className="text-slate-100">{route.ml_features.hour}:00</span></div>
        <div className="flex justify-between"><span className="inline-flex items-center gap-1"><MapIcon className="w-3 h-3" /> Distance</span><span className="text-slate-100">{route.ml_features.distance.toFixed(0)} m</span></div>
        <div className="flex justify-between"><span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Danger Points</span><span className="text-slate-100">{route.ml_features.danger_points}</span></div>
        <div className="flex justify-between"><span className="inline-flex items-center gap-1"><CornerDownRight className="w-3 h-3" /> Turns</span><span className="text-slate-100">{route.ml_features.turns}</span></div>
      </div>

      {/* Safety factors */}
      <div className="space-y-2">
        <h4 className="text-xs uppercase tracking-wide text-slate-500">Safety Factors <span className="text-slate-600 normal-case">(Demo Safety Data)</span></h4>
        {factorConfig.map((f) => {
          const raw = route.safety_factors[f.key];
          const display = f.key === "distance" ? `${raw.toFixed(0)} m` : raw.toFixed(0);
          const barValue = f.key === "distance" ? Math.min(100, (raw / 2000) * 100) : raw;
          return (
            <div key={f.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="inline-flex items-center gap-1 text-slate-300">
                  <f.icon className="w-3 h-3 text-slate-400" /> {f.label}
                </span>
                <span className="text-slate-200 font-medium">{display}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full ${barColor(barValue, f.invert)}`} style={{ width: `${barValue}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Dijkstra optimization info */}
      <div className="rounded-lg bg-slate-800/60 p-3 text-xs text-slate-300">
        <div className="flex justify-between"><span>Dijkstra optimized distance</span><span className="text-slate-100">{route.optimized_path_distance.toFixed(0)} m</span></div>
        <div className="flex justify-between"><span>Avg segment safety</span><span className="text-slate-100">{route.optimized_avg_safety.toFixed(0)}/100</span></div>
        <div className="flex justify-between"><span>Combined cost</span><span className="text-slate-100">{route.optimized_path_cost.toFixed(4)}</span></div>
      </div>

      {/* Recommendation */}
      <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-xs text-blue-200">
        {route.recommendation}
      </div>
    </div>
  );
}
