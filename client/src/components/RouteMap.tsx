import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, Truck, CheckCircle, Clock, Send, User, Navigation,
  XCircle, Trash2, PlusCircle, Search, Loader2, AlertCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
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
  // Add Stops modal state
  const [showAddStops, setShowAddStops] = useState(false);
  const [addStopsSearch, setAddStopsSearch] = useState("");
  const [addStopsPharmacyFilter, setAddStopsPharmacyFilter] = useState<string>("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [addStopsError, setAddStopsError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: routeData } = useQuery({
    queryKey: [`/api/routes/${selectedRouteId}`],
    enabled: !!selectedRouteId,
  });

  // Eligible orders for the Add Stops modal
  const { data: eligibleOrders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ["/api/delivery-orders/eligible"],
    enabled: showAddStops,
    queryFn: async () => {
      const res = await fetch("/api/delivery-orders/eligible", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch eligible orders");
      return res.json();
    },
  });

  // Pharmacies for admin filter (best-effort, won't fail if not admin)
  const { data: pharmacies = [] } = useQuery<any[]>({
    queryKey: ["/api/pharmacies"],
    enabled: showAddStops,
    retry: false,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ routeId, driverId }: { routeId: number; driverId: number }) => {
      const response = await fetch(`/api/routes/${routeId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
        credentials: "include",
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
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to dispatch route");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/routes/${selectedRouteId}`] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (routeId: number) => {
      const response = await fetch(`/api/routes/${routeId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to cancel route");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/routes/${selectedRouteId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders/eligible"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
    },
  });

  const removeStopMutation = useMutation({
    mutationFn: async ({ routeId, stopId }: { routeId: number; stopId: number }) => {
      const response = await fetch(`/api/routes/${routeId}/stops/${stopId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to remove stop");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/routes/${selectedRouteId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries/active"] });
    },
  });

  const addStopsMutation = useMutation({
    mutationFn: async ({ routeId, orderIds }: { routeId: number; orderIds: number[] }) => {
      const response = await fetch(`/api/routes/${routeId}/stops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds }),
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add stops");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/routes/${selectedRouteId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders/eligible"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
      setShowAddStops(false);
      setSelectedOrderIds(new Set());
      setAddStopsSearch("");
      setAddStopsPharmacyFilter("");
      setAddStopsError(null);
      if (data.failed > 0) {
        setAddStopsError(`${data.added} stop${data.added !== 1 ? "s" : ""} added. ${data.failed} could not be added (not geocoded or already routed).`);
      }
    },
    onError: (err: Error) => {
      setAddStopsError(err.message);
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

  // Decide if the Add Stops button should be visible
  const canAddStops = route && ["dispatched", "active", "assigned", "optimized", "pending"].includes(route.status);

  // Filter eligible orders for the modal
  const filteredOrders = eligibleOrders.filter((o: any) => {
    const matchesSearch = !addStopsSearch ||
      o.addressText?.toLowerCase().includes(addStopsSearch.toLowerCase()) ||
      o.customerName?.toLowerCase().includes(addStopsSearch.toLowerCase()) ||
      o.rxNumber?.toLowerCase().includes(addStopsSearch.toLowerCase());
    const matchesPharmacy = !addStopsPharmacyFilter ||
      String(o.pharmacyId) === addStopsPharmacyFilter;
    return matchesSearch && matchesPharmacy;
  });

  const toggleOrder = (id: number) => {
    const next = new Set(selectedOrderIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedOrderIds(next);
  };

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
                        r.status === "active" ? "bg-teal-500/20 text-teal-400" :
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

                {route.driverId && route.status !== "dispatched" && route.status !== "active" && (
                  <Button
                    onClick={() => dispatchMutation.mutate(selectedRouteId)}
                    disabled={dispatchMutation.isPending}
                    className="w-full bg-green-500 hover:bg-green-600"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Dispatch to Driver
                  </Button>
                )}

                {(route.status === "dispatched" || route.status === "active") && route.driverId && (
                  <Button
                    onClick={() => onOpenDriverView(route.driverId)}
                    className="w-full bg-blue-500 hover:bg-blue-600"
                  >
                    <Navigation className="mr-2 h-4 w-4" />
                    Open Driver View
                  </Button>
                )}

                {/* Add Stops button — shown for any non-terminal route */}
                {canAddStops && (
                  <Button
                    onClick={() => {
                      setShowAddStops(true);
                      setAddStopsError(null);
                      setSelectedOrderIds(new Set());
                      setAddStopsSearch("");
                    }}
                    variant="outline"
                    className="w-full border-teal-600 text-teal-400 hover:bg-teal-500/10"
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Stops to Route
                  </Button>
                )}

                {["pending", "optimized", "assigned", "dispatched", "active"].includes(route.status) && (
                  <Button
                    onClick={() => {
                      if (confirm("Cancel this route? All pending deliveries will return to the eligible pool and can be re-routed immediately.")) {
                        cancelMutation.mutate(selectedRouteId!);
                      }
                    }}
                    disabled={cancelMutation.isPending}
                    variant="destructive"
                    className="w-full"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    {cancelMutation.isPending ? "Cancelling..." : "Cancel Route"}
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
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Clock className="h-5 w-5 text-slate-500" />
                          {route && !['completed', 'cancelled'].includes(route.status) && (
                            <button
                              onClick={() => {
                                if (confirm(`Remove this stop from the route?`)) {
                                  removeStopMutation.mutate({ routeId: selectedRouteId!, stopId: stop.id });
                                }
                              }}
                              className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                              title="Remove stop from route"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Add Stops Modal ───────────────────────────────────────────────── */}
      {showAddStops && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div>
                <h3 className="text-white font-semibold text-lg">Add Stops to Route</h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  Select route-eligible orders to append to <span className="text-white">{route?.name}</span>
                </p>
              </div>
              <button
                onClick={() => { setShowAddStops(false); setAddStopsError(null); }}
                className="text-slate-400 hover:text-white p-1"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {/* Filters */}
            <div className="px-5 py-3 border-b border-slate-700 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search address, customer, or RX…"
                  value={addStopsSearch}
                  onChange={(e) => setAddStopsSearch(e.target.value)}
                  className="pl-9 bg-slate-900/60 border-slate-600 text-white placeholder:text-slate-500 h-8 text-sm"
                />
              </div>
              {(pharmacies as any[]).length > 0 && (
                <select
                  value={addStopsPharmacyFilter}
                  onChange={(e) => setAddStopsPharmacyFilter(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-600 text-white rounded-md px-3 py-1.5 text-sm"
                >
                  <option value="">All Pharmacies</option>
                  {(pharmacies as any[]).map((p: any) => (
                    <option key={p.id} value={String(p.id)}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Order list */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 min-h-0">
              {ordersLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                  {eligibleOrders.length === 0
                    ? "No route-eligible orders available."
                    : "No orders match your search."}
                </div>
              ) : (
                filteredOrders.map((order: any) => {
                  const selected = selectedOrderIds.has(order.id);
                  return (
                    <label
                      key={order.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selected
                          ? "bg-teal-500/10 border-teal-500/40"
                          : "bg-slate-700/30 border-slate-600/50 hover:border-slate-500"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleOrder(order.id)}
                        className="mt-1 w-4 h-4 accent-teal-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {order.addressText}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {order.customerName && (
                            <span className="text-slate-400 text-xs">{order.customerName}</span>
                          )}
                          <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            {order.rxNumber}
                          </span>
                          {!order.lat || !order.lng ? (
                            <span className="text-xs text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                              No coords
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-700 space-y-3">
              {addStopsError && (
                <div className="flex items-start gap-2 text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{addStopsError}</span>
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setShowAddStops(false); setAddStopsError(null); }}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedOrderIds.size === 0) return;
                    addStopsMutation.mutate({
                      routeId: selectedRouteId!,
                      orderIds: Array.from(selectedOrderIds),
                    });
                  }}
                  disabled={selectedOrderIds.size === 0 || addStopsMutation.isPending}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {addStopsMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Adding…</>
                  ) : (
                    <><PlusCircle className="h-4 w-4 mr-2" />Add {selectedOrderIds.size > 0 ? `${selectedOrderIds.size} Stop${selectedOrderIds.size !== 1 ? "s" : ""}` : "Stops"}</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
