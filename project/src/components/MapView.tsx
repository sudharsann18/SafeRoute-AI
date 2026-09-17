import { useEffect, useMemo, useRef } from "react";
import type React from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteAnalysis } from "@/services/api";

const greenIcon = L.divIcon({
  className: "custom-div-icon",
  html: '<div style="background:#22c55e;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.4)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const redIcon = L.divIcon({
  className: "custom-div-icon",
  html: '<div style="background:#ef4444;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.4)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function routeColor(route: RouteAnalysis): string {
  if (route.recommended) return "#2563eb";
  if (route.risk_level === "LOW") return "#22c55e";
  if (route.risk_level === "MEDIUM") return "#f59e0b";
  return "#ef4444";
}

function FitBounds({ routes, origin, destination }: { routes: RouteAnalysis[]; origin: [number, number] | null; destination: { lat: number; lon: number } | null }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    if (origin) pts.push([origin[0], origin[1]]);
    if (destination) pts.push([destination.lat, destination.lon]);
    routes.forEach((r) => {
      if (r.geometry) r.geometry.forEach(([lon, lat]) => pts.push([lat, lon]));
    });
    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
    } else if (pts.length === 1) {
      map.setView(pts[0], 13);
    }
  }, [routes, origin, destination, map]);
  return null;
}

interface MapViewProps {
  origin: [number, number] | null;
  destination: { lat: number; lon: number; name: string } | null;
  routes: RouteAnalysis[];
  selectedRoute: number | null;
  onSelectRoute: (index: number) => void;
}

export default function MapView({ origin, destination, routes, selectedRoute, onSelectRoute }: MapViewProps) {
  const center: [number, number] = origin ?? [40.7128, -74.006];
  const markerRef = useRef<L.Marker | null>(null);

  const routesWithColor = useMemo(
    () => routes.map((r, i) => ({ ...r, color: routeColor(r), idx: i })),
    [routes]
  );

  return (
    <MapContainer center={center} zoom={13} className="h-full w-full" style={{ background: "#0b1220" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitBounds routes={routes} origin={origin} destination={destination} />

      {routesWithColor.map((r) => {
        const isSelected = selectedRoute === r.idx;
        const positions = r.geometry.map(([lon, lat]) => [lat, lon] as [number, number]);
        return (
          <Polyline
            key={r.route_index}
            positions={positions}
            pathOptions={{
              color: r.color,
              weight: isSelected ? 7 : 5,
              opacity: isSelected ? 1 : 0.6,
              dashArray: r.recommended ? undefined : "8,6",
            }}
            eventHandlers={{ click: () => onSelectRoute(r.idx) }}
          />
        );
      })}

      {origin && (
        <Marker position={[origin[0], origin[1]]} icon={greenIcon}>
          <Popup>Your location</Popup>
        </Marker>
      )}

      {destination && (
        <Marker position={[destination.lat, destination.lon]} icon={redIcon} ref={markerRef as unknown as React.Ref<L.Marker>}>
          <Popup>{destination.name}</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
