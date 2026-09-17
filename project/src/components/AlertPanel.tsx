import { AlertTriangle, Info, Lightbulb, Clock, Car, Construction, Shield } from "lucide-react";
import type { AlertItem } from "@/services/api";

interface AlertPanelProps {
  alerts: AlertItem[];
}

const alertIcons: Record<string, typeof AlertTriangle> = {
  crime: Shield,
  lighting: Lightbulb,
  traffic: Car,
  time: Clock,
  road: Construction,
  info: Info,
};

const severityStyles: Record<string, string> = {
  high: "border-red-500/40 bg-red-500/10 text-red-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

export default function AlertPanel({ alerts }: AlertPanelProps) {
  if (!alerts.length) {
    return (
      <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 p-4 text-sm text-slate-400">
        No alerts for this route.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-slate-100 inline-flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 text-amber-400" /> Alerts & Recommendations
      </h3>
      {alerts.map((a, i) => {
        const Icon = alertIcons[a.type] ?? AlertTriangle;
        return (
          <div key={i} className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${severityStyles[a.severity] ?? severityStyles.medium}`}>
            <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{a.message}</span>
          </div>
        );
      })}
    </div>
  );
}
