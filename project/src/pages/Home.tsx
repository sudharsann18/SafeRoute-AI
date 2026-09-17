import { useState, useCallback } from "react";
import MapView from "@/components/MapView";
import SearchPanel from "@/components/SearchPanel";
import RouteCard from "@/components/RouteCard";
import SafetyPanel from "@/components/SafetyPanel";
import AlertPanel from "@/components/AlertPanel";
import { getRoutes, type RouteAnalysis, type RoutesResponse } from "@/services/api";
import { AlertCircle, Loader2, Route as RouteIcon, ShieldCheck, Info, Wifi, WifiOff } from "lucide-react";

export default function Home() {
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState("");
  const [destCoords, setDestCoords] = useState<{ lat: number; lon: number; name: string } | null>(null);
  const [routes, setRoutes] = useState<RouteAnalysis[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [mlBackendConnected, setMlBackendConnected] = useState(false);

  const locate = useCallback(() => {
    setLocationStatus("Requesting location...");
    if (!navigator.geolocation) {
      setLocationStatus("Geolocation not supported by this browser. You can still search after setting an origin below.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = pos.coords;
        setOrigin([c.latitude, c.longitude]);
        setLocationStatus(null);
      },
      (err) => {
        const messages: Record<number, string> = {
          1: "Location permission denied. Using a default location.",
          2: "Position unavailable. Using a default location.",
          3: "Location request timed out. Using a default location.",
        };
        setLocationStatus(messages[err.code] ?? "Could not get location.");
        setOrigin([40.7128, -74.006]);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  const findRoutes = useCallback(async () => {
    if (!origin) {
      setError("Please set your location first (click \"Use my location\").");
      return;
    }
    if (!destination.trim()) {
      setError("Please enter a destination.");
      return;
    }
    setLoading(true);
    setError(null);
    setRoutes([]);
    setSelected(null);
    setDestCoords(null);
    try {
      const data: RoutesResponse = await getRoutes(origin, destination.trim());
      setRoutes(data.routes);
      setMlBackendConnected(data.ml_backend_connected);
      if (data.destination) setDestCoords(data.destination);
      const recIdx = data.routes.findIndex((r) => r.recommended);
      setSelected(recIdx >= 0 ? recIdx : 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch routes.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [origin, destination]);

  const selectedRoute = selected != null ? routes[selected] : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <h1 className="text-lg font-bold tracking-tight">SafeRoute</h1>
            <span className="text-xs text-slate-500 hidden sm:inline">AI-Powered Safe Route Recommendation</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400 inline-flex items-center gap-1">
              <Info className="w-3 h-3 text-amber-400" />
              Demo Safety Data
            </span>
            {routes.length > 0 && (
              <span className={`inline-flex items-center gap-1 ${mlBackendConnected ? "text-emerald-400" : "text-slate-500"}`}>
                {mlBackendConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {mlBackendConnected ? "Random Forest backend connected" : "Demo ML — backend offline"}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-3 p-3">
        {/* Sidebar */}
        <div className="flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-64px)]">
          <SearchPanel
            origin={origin}
            destination={destination}
            setDestination={setDestination}
            onFindRoutes={findRoutes}
            loading={loading}
            locationStatus={locationStatus}
            onLocate={locate}
            onSetOrigin={(lat, lon) => {
              setOrigin([lat, lon]);
              setLocationStatus(null);
            }}
          />

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Route cards */}
          <div className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1">
              <RouteIcon className="w-3 h-3" /> Route Options
            </h2>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-slate-400 p-3">
                <Loader2 className="w-4 h-4 animate-spin" /> Analyzing routes...
              </div>
            )}
            {!loading && routes.map((r, i) => (
              <RouteCard key={i} route={r} selected={selected === i} onSelect={() => setSelected(i)} />
            ))}
            {!loading && routes.length === 0 && !error && (
              <div className="text-sm text-slate-500 p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                Enter a destination and click "Find Safe Routes" to see route options with safety analysis.
              </div>
            )}
          </div>

          {/* Safety panel */}
          {selectedRoute && <SafetyPanel route={selectedRoute} />}

          {/* Alerts */}
          {selectedRoute && <AlertPanel alerts={selectedRoute.alerts} />}
        </div>

        {/* Map */}
        <div className="rounded-2xl overflow-hidden border border-slate-800 min-h-[400px] lg:min-h-0 relative">
          <MapView
            origin={origin}
            destination={destCoords}
            routes={routes}
            selectedRoute={selected}
            onSelectRoute={(i) => setSelected(i)}
          />
          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-[1000] rounded-lg bg-slate-900/85 border border-slate-700 p-2 text-xs text-slate-200 backdrop-blur space-y-1">
            <div className="font-semibold text-slate-100 mb-1">Legend</div>
            <LegendItem color="#22c55e" label="Low Risk" />
            <LegendItem color="#f59e0b" label="Medium Risk" />
            <LegendItem color="#ef4444" label="High Risk" />
            <LegendItem color="#2563eb" label="Recommended Route" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block w-3 h-1.5 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
