import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Truck, CheckCircle, Clock, Send, User, Navigation } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createNumberedIcon = (number: number, color: string) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

const startIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #22c55e; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

interface MapCenterProps {
  center: [number, number];
}

function MapCenter({ center }: MapCenterProps) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 12);
  }, [center, map]);
  return null;
}

interface RouteMapProps {
  routes: any[];
  selectedRouteId: number | null;
  onSelectRoute: (routeId: number) => void;
  drivers: any[];
  onOpenDriverView: (driverId: number) => void;
}

export default function RouteMap({
  routes,
  selectedRouteId,
  onSelectRoute,
  drivers,
  onOpenDriverView,
}: RouteMapProps) {
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: routeData } = useQuery({
    queryKey: [`/api/routes/${selectedRouteId}`],
    enabled: !!selectedRouteId,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ routeId, driverId }: { routeId: number; driverId: number }) => {
      const response = await fetch(`/api/routes/${routeId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      if (!response.ok) throw new Error("Failed to assign route");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/routes/${selectedRouteId}`] });
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: async (routeId: number) => {
      const response = await fetch(`/api/routes/${routeId}/dispatch`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to dispatch route");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/routes/${selectedRouteId}`] });
    },
  });

  const route = (routeData as any)?.route;
  const stops = (routeData as any)?.stops || [];

  const mapCenter: [number, number] = route?.startLat && route?.startLng
    ? [route.startLat, route.startLng]
    : [40.7128, -74.006];

  const routePath: [number, number][] = [];
  if (route?.startLat && route?.startLng) {
    routePath.push([route.startLat, route.startLng]);
  }
  stops.forEach((stop: any) => {
    if (stop.delivery?.lat && stop.delivery?.lng) {
      routePath.push([stop.delivery.lat, stop.delivery.lng]);
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Route Management</h2>
        <p className="text-slate-400">
          View optimized routes, assign to drivers, and dispatch for delivery.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <MapPin className="h-5 w-5 text-blue-400" />
                Routes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {routes.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">
                  No routes created yet
                </p>
              ) : (
                routes.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => onSelectRoute(r.id)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedRouteId === r.id
                        ? "bg-blue-500/20 border border-blue-500/50"
                        : "bg-slate-900/30 hover:bg-slate-900/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium">{r.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === "dispatched" ? "bg-green-500/20 text-green-400" :
                        r.status === "assigned" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-slate-700 text-slate-400"
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="text-slate-500 text-xs mt-1">
                      {r.estimatedDistance?.toFixed(1)} km &bull; ~{Math.floor((r.estimatedDuration || 0) / 60)}h {(r.estimatedDuration || 0) % 60}m
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {selectedRouteId && route && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Truck className="h-5 w-5 text-blue-400" />
                  Assign & Dispatch
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-slate-300 text-sm block mb-2">Assign to Driver</label>
                  <Select
                    value={route.driverId?.toString() || selectedDriverId?.toString() || ""}
                    onValueChange={(value) => setSelectedDriverId(parseInt(value))}
                  >
                    <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                      <SelectValue placeholder="Select a driver..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {drivers.map((driver: any) => (
                        <SelectItem
                          key={driver.id}
                          value={driver.id.toString()}
                          className="text-white hover:bg-slate-700"
                        >
                          {driver.name} ({driver.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!route.driverId && selectedDriverId && (
                  <Button
                    onClick={() => assignMutation.mutate({ routeId: selectedRouteId, driverId: selectedDriverId })}
                    disabled={assignMutation.isPending}
                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
                  >
                    <User className="mr-2 h-4 w-4" />
                    Assign Route
                  </Button>
                )}

                {route.driverId && route.status !== "dispatched" && (
                  <Button
                    onClick={() => dispatchMutation.mutate(selectedRouteId)}
                    disabled={dispatchMutation.isPending}
                    className="w-full bg-green-500 hover:bg-green-600"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Dispatch to Driver
                  </Button>
                )}

                {route.status === "dispatched" && route.driverId && (
                  <Button
                    onClick={() => onOpenDriverView(route.driverId)}
                    className="w-full bg-blue-500 hover:bg-blue-600"
                  >
                    <Navigation className="mr-2 h-4 w-4" />
                    Open Driver View
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-slate-800/50 border-slate-700 overflow-hidden">
            <div className="h-96">
              <MapContainer
                center={mapCenter}
                zoom={12}
                style={{ height: "100%", width: "100%" }}
                className="z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapCenter center={mapCenter} />
                
                {route?.startLat && route?.startLng && (
                  <Marker position={[route.startLat, route.startLng]} icon={startIcon}>
                    <Popup>
                      <div className="font-medium">Starting Point</div>
                      <div className="text-sm text-gray-600">{route.startAddress}</div>
                    </Popup>
                  </Marker>
                )}

                {stops.map((stop: any, index: number) => {
                  if (!stop.delivery?.lat || !stop.delivery?.lng) return null;
                  const color = stop.status === "completed" ? "#22c55e" : "#3b82f6";
                  return (
                    <Marker
                      key={stop.id}
                      position={[stop.delivery.lat, stop.delivery.lng]}
                      icon={createNumberedIcon(index + 1, color)}
                    >
                      <Popup>
                        <div className="font-medium">Stop {index + 1}</div>
                        <div className="text-sm">{stop.delivery.addressText}</div>
                        {stop.delivery.customerName && (
                          <div className="text-sm text-gray-600">{stop.delivery.customerName}</div>
                        )}
                      </Popup>
                    </Marker>
                  );
                })}

                {routePath.length > 1 && (
                  <Polyline
                    positions={routePath}
                    color="#3b82f6"
                    weight={4}
                    opacity={0.8}
                  />
                )}
              </MapContainer>
            </div>
          </Card>

          {selectedRouteId && stops.length > 0 && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-400" />
                  Delivery Stops ({stops.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {stops.map((stop: any, index: number) => (
                    <div
                      key={stop.id}
                      className="flex items-center gap-3 bg-slate-900/30 rounded-lg p-3"
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        stop.status === "completed" ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{stop.delivery?.addressText}</p>
                        {stop.delivery?.customerName && (
                          <p className="text-slate-500 text-xs">{stop.delivery.customerName}</p>
                        )}
                      </div>
                      {stop.status === "completed" ? (
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                      ) : (
                        <Clock className="h-5 w-5 text-slate-500 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
