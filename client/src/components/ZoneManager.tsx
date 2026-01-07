import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Circle, useMapEvents, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Plus, Trash2, Edit, Save, X, Users, MapPin } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

interface DeliveryZone {
  id: number;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  color: string | null;
  isActive: boolean;
}

interface Driver {
  id: number;
  name: string;
  phone: string | null;
  status: string;
}

interface DriverZone {
  id: number;
  driverId: number;
  zoneId: number;
}

interface ZoneManagerProps {
  drivers: Driver[];
}

const zoneColors = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"
];

function ZoneCreator({ onZoneCreated }: { onZoneCreated: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onZoneCreated(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function ZoneManager({ drivers }: ZoneManagerProps) {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [showAssignDriver, setShowAssignDriver] = useState<number | null>(null);
  const [newZone, setNewZone] = useState({
    name: "",
    centerLat: 40.7128,
    centerLng: -74.0060,
    radiusMeters: 5000,
    color: "#3B82F6",
  });
  const [mapCenter] = useState<[number, number]>([40.7128, -74.0060]);

  const { data: zones = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/zones"],
  });

  const createZoneMutation = useMutation({
    mutationFn: async (zone: typeof newZone) => {
      const response = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zone),
      });
      if (!response.ok) throw new Error("Failed to create zone");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      setIsCreating(false);
      setNewZone({
        name: "",
        centerLat: 40.7128,
        centerLng: -74.0060,
        radiusMeters: 5000,
        color: zoneColors[zones.length % zoneColors.length],
      });
    },
  });

  const updateZoneMutation = useMutation({
    mutationFn: async (zone: DeliveryZone) => {
      const response = await fetch(`/api/zones/${zone.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zone),
      });
      if (!response.ok) throw new Error("Failed to update zone");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      setEditingZone(null);
    },
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (zoneId: number) => {
      const response = await fetch(`/api/zones/${zoneId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete zone");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
    },
  });

  const assignDriverMutation = useMutation({
    mutationFn: async ({ driverId, zoneId }: { driverId: number; zoneId: number }) => {
      const response = await fetch(`/api/drivers/${driverId}/zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneId }),
      });
      if (!response.ok) throw new Error("Failed to assign driver");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers"] });
      setShowAssignDriver(null);
    },
  });

  const handleMapClick = (lat: number, lng: number) => {
    if (isCreating) {
      setNewZone((prev) => ({ ...prev, centerLat: lat, centerLng: lng }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Delivery Zones</h2>
          <p className="text-slate-400">Define geo-fenced areas for driver assignments</p>
        </div>
        <Button
          onClick={() => {
            setIsCreating(true);
            setNewZone({
              name: `Zone ${zones.length + 1}`,
              centerLat: 40.7128,
              centerLng: -74.0060,
              radiusMeters: 5000,
              color: zoneColors[zones.length % zoneColors.length],
            });
          }}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Zone
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0 overflow-hidden rounded-lg">
              <div className="h-[500px]">
                <MapContainer
                  center={mapCenter}
                  zoom={11}
                  className="h-full w-full"
                  style={{ background: "#1e293b" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  />
                  
                  {isCreating && <ZoneCreator onZoneCreated={handleMapClick} />}
                  
                  {zones.map((zone) => (
                    <Circle
                      key={zone.id}
                      center={[zone.centerLat, zone.centerLng]}
                      radius={zone.radiusMeters}
                      pathOptions={{
                        color: zone.color || "#3B82F6",
                        fillColor: zone.color || "#3B82F6",
                        fillOpacity: 0.2,
                        weight: 2,
                      }}
                    >
                      <Popup>
                        <div className="text-center">
                          <strong>{zone.name}</strong>
                          <br />
                          <span className="text-sm text-gray-600">
                            Radius: {(zone.radiusMeters / 1000).toFixed(1)} km
                          </span>
                        </div>
                      </Popup>
                    </Circle>
                  ))}
                  
                  {isCreating && (
                    <Circle
                      center={[newZone.centerLat, newZone.centerLng]}
                      radius={newZone.radiusMeters}
                      pathOptions={{
                        color: newZone.color,
                        fillColor: newZone.color,
                        fillOpacity: 0.3,
                        weight: 2,
                        dashArray: "5, 5",
                      }}
                    />
                  )}
                </MapContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {isCreating && (
            <Card className="bg-blue-500/10 border-blue-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">New Zone</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-slate-300">Zone Name</Label>
                  <Input
                    value={newZone.name}
                    onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">Radius (km)</Label>
                  <Input
                    type="number"
                    value={newZone.radiusMeters / 1000}
                    onChange={(e) => setNewZone({ ...newZone, radiusMeters: parseFloat(e.target.value) * 1000 })}
                    className="bg-slate-700 border-slate-600 text-white"
                    min={0.5}
                    step={0.5}
                  />
                </div>
                <div>
                  <Label className="text-slate-300">Color</Label>
                  <div className="flex gap-2 mt-1">
                    {zoneColors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewZone({ ...newZone, color })}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          newZone.color === color ? "border-white scale-110" : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Click on the map to set the zone center
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => createZoneMutation.mutate(newZone)}
                    disabled={!newZone.name}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Zone
                  </Button>
                  <Button
                    onClick={() => setIsCreating(false)}
                    variant="outline"
                    className="border-slate-600 text-slate-300"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-lg">Zones ({zones.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {zones.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">
                  No zones created yet
                </p>
              ) : (
                zones.map((zone) => (
                  <div
                    key={zone.id}
                    className="p-3 bg-slate-700/50 rounded-lg border border-slate-600"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: zone.color || "#3B82F6" }}
                        />
                        <span className="font-medium text-white">{zone.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowAssignDriver(zone.id)}
                          className="h-7 w-7 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                        >
                          <Users className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingZone(zone)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-300 hover:bg-slate-600"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Delete zone "${zone.name}"?`)) {
                              deleteZoneMutation.mutate(zone.id);
                            }
                          }}
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">
                      <MapPin className="h-3 w-3 inline mr-1" />
                      {zone.centerLat.toFixed(4)}, {zone.centerLng.toFixed(4)} • {(zone.radiusMeters / 1000).toFixed(1)} km
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={editingZone !== null} onOpenChange={() => setEditingZone(null)}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Zone</DialogTitle>
          </DialogHeader>
          {editingZone && (
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300">Zone Name</Label>
                <Input
                  value={editingZone.name}
                  onChange={(e) => setEditingZone({ ...editingZone, name: e.target.value })}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Radius (km)</Label>
                <Input
                  type="number"
                  value={editingZone.radiusMeters / 1000}
                  onChange={(e) => setEditingZone({ ...editingZone, radiusMeters: parseFloat(e.target.value) * 1000 })}
                  className="bg-slate-700 border-slate-600 text-white"
                  min={0.5}
                  step={0.5}
                />
              </div>
              <div>
                <Label className="text-slate-300">Color</Label>
                <div className="flex gap-2 mt-1">
                  {zoneColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setEditingZone({ ...editingZone, color })}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        editingZone.color === color ? "border-white scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <Button
                onClick={() => updateZoneMutation.mutate(editingZone)}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAssignDriver !== null} onOpenChange={() => setShowAssignDriver(null)}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Assign Drivers to Zone</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {drivers.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No drivers available</p>
            ) : (
              drivers.map((driver) => (
                <button
                  key={driver.id}
                  onClick={() => {
                    if (showAssignDriver) {
                      assignDriverMutation.mutate({ driverId: driver.id, zoneId: showAssignDriver });
                    }
                  }}
                  className="w-full p-3 flex items-center justify-between bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Users className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-white">{driver.name}</p>
                      <p className="text-xs text-slate-400">{driver.phone || "No phone"}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    driver.status === "available" 
                      ? "bg-green-500/20 text-green-400"
                      : "bg-yellow-500/20 text-yellow-400"
                  }`}>
                    {driver.status}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
