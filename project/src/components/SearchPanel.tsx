import { Search, Loader2, MapPin } from "lucide-react";

interface SearchPanelProps {
  origin: [number, number] | null;
  destination: string;
  setDestination: (v: string) => void;
  onFindRoutes: () => void;
  loading: boolean;
  locationStatus: string | null;
  onLocate: () => void;
  onSetOrigin: (lat: number, lon: number) => void;
}

export default function SearchPanel({
  origin,
  destination,
  setDestination,
  onFindRoutes,
  loading,
  locationStatus,
  onLocate,
  onSetOrigin,
}: SearchPanelProps) {
  return (
    <div className="rounded-2xl bg-slate-900/70 backdrop-blur border border-slate-700/60 p-4 shadow-lg">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-medium text-slate-200">
          {origin ? `Origin: ${origin[0].toFixed(4)}, ${origin[1].toFixed(4)}` : "No location set"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onFindRoutes()}
            placeholder="Enter destination (e.g. Goa, Chennai, Bangalore)"
            className="flex-1 bg-slate-800/80 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
          <button
            onClick={onFindRoutes}
            disabled={loading || !destination.trim() || !origin}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? "Searching" : "Find Safe Routes"}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={onLocate}
            className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
          >
            <MapPin className="w-3 h-3" /> Use my location
          </button>
          {locationStatus && <span className="text-xs text-amber-400">{locationStatus}</span>}
        </div>

        {/* Manual origin fallback */}
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-300">Set origin manually</summary>
          <div className="flex gap-2 mt-2">
            <input
              type="number"
              step="any"
              placeholder="Latitude"
              id="manual-lat"
              className="flex-1 bg-slate-800/80 text-slate-100 placeholder-slate-500 rounded-lg px-2 py-1.5 text-xs border border-slate-700 outline-none focus:border-emerald-500"
            />
            <input
              type="number"
              step="any"
              placeholder="Longitude"
              id="manual-lon"
              className="flex-1 bg-slate-800/80 text-slate-100 placeholder-slate-500 rounded-lg px-2 py-1.5 text-xs border border-slate-700 outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => {
                const latEl = document.getElementById("manual-lat") as HTMLInputElement | null;
                const lonEl = document.getElementById("manual-lon") as HTMLInputElement | null;
                const lat = parseFloat(latEl?.value ?? "");
                const lon = parseFloat(lonEl?.value ?? "");
                if (!isNaN(lat) && !isNaN(lon)) onSetOrigin(lat, lon);
              }}
              className="bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              Set
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
