import { Shield, ShieldCheck, ShieldAlert, Brain, Route as RouteIcon, TrendingUp, Zap } from "lucide-react";
import type { RouteAnalysis } from "@/services/api";

interface RouteCardProps {
  route: RouteAnalysis;
  selected: boolean;
  onSelect: () => void;
}

const riskStyles: Record<string, { bg: string; text: string; icon: typeof Shield; label: string }> = {
  LOW: { bg: "bg-emerald-500/15 border-emerald-500/40", text: "text-emerald-300", icon: ShieldCheck, label: "LOW" },
  MEDIUM: { bg: "bg-amber-500/15 border-amber-500/40", text: "text-amber-300", icon: Shield, label: "MEDIUM" },
  HIGH: { bg: "bg-red-500/15 border-red-500/40", text: "text-red-300", icon: ShieldAlert, label: "HIGH" },
};

export default function RouteCard({ route, selected, onSelect }: RouteCardProps) {
  if (route.error) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
        Route {route.route_index}: {route.error}
      </div>
    );
  }

  const style = riskStyles[route.risk_level] ?? riskStyles.MEDIUM;
  const Icon = style.icon;
  const km = (route.distance / 1000).toFixed(2);
  const mins = Math.round(route.duration / 60);
  const mlDemo = route.ml_source === "demo";

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-3 transition-all ${
        selected ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500" : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <RouteIcon className="w-4 h-4 text-slate-300" />
          <span className="text-sm font-semibold text-slate-100">Route {route.route_index}</span>
          {route.recommended && (
            <span className="inline-flex items-center gap-1 text-xs text-blue-300 font-medium">
              <ShieldCheck className="w-3 h-3" /> Recommended Safer
            </span>
          )}
          {route.shortest && !route.recommended && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-300 font-medium">
              <Zap className="w-3 h-3" /> Shortest
            </span>
          )}
          {route.shortest && route.recommended && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-300 font-medium">
              <Zap className="w-3 h-3" /> Shortest
            </span>
          )}
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${style.bg} ${style.text}`}>
          <Icon className="w-3 h-3" /> {style.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <Metric label="Distance" value={`${km} km`} />
        <Metric label="Duration" value={`${mins} min`} />
        <Metric label="Safety" value={`${route.safety_score.toFixed(0)}/100`} accent={style.text} />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Brain className="w-3 h-3" />
          ML Risk: {route.ml_label} ({(route.ml_probability * 100).toFixed(0)}%)
          {mlDemo && <span className="text-slate-600 ml-1">demo</span>}
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> {route.segment_count} seg, {route.danger_points} danger
        </span>
      </div>
    </button>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-slate-900/60 rounded-lg px-2 py-1">
      <div className="text-slate-500">{label}</div>
      <div className={`font-semibold ${accent ?? "text-slate-200"}`}>{value}</div>
    </div>
  );
}
