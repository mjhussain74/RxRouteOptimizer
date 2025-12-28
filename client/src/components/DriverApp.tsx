import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  ArrowLeft, Navigation, MapPin, CheckCircle, Clock, Phone, 
  FileText, ChevronRight, Loader2, ExternalLink, RefreshCw, Camera, RotateCcw, Send, X
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { io, Socket } from "socket.io-client";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createNumberedIcon = (number: number, color: string) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">${number}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const currentLocationIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 4px solid white; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3), 0 2px 6px rgba(0,0,0,0.4);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

interface MapCenterProps {
  center: [number, number];
}

function MapCenter({ center }: MapCenterProps) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 14);
  }, [center, map]);
  return null;
}

interface DriverAppProps {
  driverId: number | null;
  onBack: () => void;
}

export default function DriverApp({ driverId, onBack }: DriverAppProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const [isLocating, setIsLocating] = useState(false);
  const [showProofModal, setShowProofModal] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [proofNotes, setProofNotes] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: driver, isLoading: driverLoading } = useQuery({
    queryKey: [`/api/drivers/${driverId}`],
    enabled: !!driverId,
  });

  const { data: driverRoutes = [], isLoading: routesLoading, refetch: refetchRoutes } = useQuery({
    queryKey: [`/api/drivers/${driverId}/routes`],
    enabled: !!driverId,
  });

  const activeRoute = (driverRoutes as any[]).find((r: any) => r.status === "dispatched");

  const { data: routeData, refetch: refetchRoute } = useQuery({
    queryKey: [`/api/routes/${activeRoute?.id}`],
    enabled: !!activeRoute?.id,
  });

  const completeStopMutation = useMutation({
    mutationFn: async ({ routeId, stopId }: { routeId: number; stopId: number }) => {
      const response = await fetch(`/api/routes/${routeId}/stops/${stopId}/complete`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to complete stop");
      return response.json();
    },
    onSuccess: () => {
      refetchRoute();
    },
  });

  const submitProofMutation = useMutation({
    mutationFn: async ({ routeId, stopId }: { routeId: number; stopId: number }) => {
      const response = await fetch(`/api/routes/${routeId}/stops/${stopId}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, picture, notes: proofNotes }),
      });
      if (!response.ok) throw new Error("Failed to submit proof");
      return response.json();
    },
    onSuccess: async () => {
      console.log("✅ Proof submitted successfully");
      setSignature(null);
      setPicture(null);
      setProofNotes("");
      setShowProofModal(false);
      // Wait a moment for the backend to process, then refetch route
      await new Promise(resolve => setTimeout(resolve, 500));
      await refetchRoute();
    },
    onError: (error) => {
      console.error("❌ Proof submission error:", error);
    }
  });

  const skipDeliveryMutation = useMutation({
    mutationFn: async ({ routeId, stopId }: { routeId: number; stopId: number }) => {
      console.log("📝 Submitting skip delivery for stop:", stopId);
      const response = await fetch(`/api/routes/${routeId}/stops/${stopId}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: null, picture: null, notes: proofNotes || "Skipped - no signature/photo available" }),
      });
      if (!response.ok) throw new Error("Failed to skip delivery");
      return response.json();
    },
    onSuccess: async () => {
      console.log("✅ Delivery marked as completed (skip)");
      setSignature(null);
      setPicture(null);
      setProofNotes("");
      setShowProofModal(false);
      // Wait a moment for the backend to process, then refetch route
      await new Promise(resolve => setTimeout(resolve, 500));
      await refetchRoute();
    },
    onError: (error) => {
      console.error("❌ Skip delivery error:", error);
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Set proper dimensions and scaling
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    
    // Clear canvas with dark background
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, rect.width, rect.height);
    
    let isDrawing = false;
    
    const getCoordinates = (e: any) => {
      const rect = canvas.getBoundingClientRect();
      let clientX = e.clientX;
      let clientY = e.clientY;
      
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
      
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };
    
    const handleStart = (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      isDrawing = true;
      const coords = getCoordinates(e);
      console.log("✏️ Signature start:", coords);
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    };
    
    const handleMove = (e: any) => {
      if (!isDrawing) return;
      e.preventDefault();
      e.stopPropagation();
      const coords = getCoordinates(e);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    };
    
    const handleEnd = (e: any) => {
      if (!isDrawing) return;
      e.preventDefault();
      e.stopPropagation();
      isDrawing = false;
      const signatureData = canvas.toDataURL();
      console.log("✅ Signature captured:", signatureData.substring(0, 50) + "...");
      setSignature(signatureData);
    };
    
    // Mouse events
    canvas.addEventListener("mousedown", handleStart, { passive: false });
    canvas.addEventListener("mousemove", handleMove, { passive: false });
    canvas.addEventListener("mouseup", handleEnd, { passive: false });
    canvas.addEventListener("mouseout", handleEnd, { passive: false });
    
    // Touch events
    canvas.addEventListener("touchstart", handleStart, { passive: false });
    canvas.addEventListener("touchmove", handleMove, { passive: false });
    canvas.addEventListener("touchend", handleEnd, { passive: false });
    
    // Cleanup
    return () => {
      canvas.removeEventListener("mousedown", handleStart);
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("mouseup", handleEnd);
      canvas.removeEventListener("mouseout", handleEnd);
      canvas.removeEventListener("touchstart", handleStart);
      canvas.removeEventListener("touchmove", handleMove);
      canvas.removeEventListener("touchend", handleEnd);
    };
  }, []);

  const capturePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPicture(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const newSocket = io({
      path: "/socket.io",
    });

    newSocket.on("connect", () => {
      console.log("Driver connected to socket");
      if (driverId) {
        newSocket.emit("register_driver", driverId);
      }
    });

    newSocket.on("route_dispatched", (data: any) => {
      console.log("Route dispatched:", data);
      refetchRoutes();
    });

    newSocket.on("stop_status_update", (data: any) => {
      console.log("Stop status updated:", data);
      refetchRoute();
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [driverId, refetchRoutes, refetchRoute]);

  const updateLocation = useCallback(() => {
    if (!navigator.geolocation || !driverId) return;

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        setCurrentLocation({ lat, lng });
        
        fetch(`/api/drivers/${driverId}/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng }),
        });

        if (socket) {
          socket.emit("driver_location", { driverId, lat, lng });
        }
        setIsLocating(false);
      },
      (error) => {
        console.error("Location error:", error);
        setIsLocating(false);
      },
      { enableHighAccuracy: true }
    );
  }, [driverId, socket]);

  useEffect(() => {
    updateLocation();
    const interval = setInterval(updateLocation, 30000);
    return () => clearInterval(interval);
  }, [updateLocation]);

  const route = (routeData as any)?.route;
  const stops = (routeData as any)?.stops || [];
  const pendingStops = stops.filter((s: any) => s.status !== "completed");
  const completedStops = stops.filter((s: any) => s.status === "completed");

  const currentStop = pendingStops[selectedStopIndex] || pendingStops[0];

  const mapCenter: [number, number] = currentLocation
    ? [currentLocation.lat, currentLocation.lng]
    : currentStop?.delivery?.lat && currentStop?.delivery?.lng
    ? [currentStop.delivery.lat, currentStop.delivery.lng]
    : [40.7128, -74.006];

  const openInMaps = (lat: number, lng: number, address: string) => {
    // Always use Google Maps HTTPS URL for consistent behavior across all platforms
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  };

  if (!driverId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="bg-slate-800/50 border-slate-700 max-w-md w-full">
          <CardContent className="py-8 text-center">
            <Navigation className="h-12 w-12 mx-auto text-slate-500 mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Driver App</h2>
            <p className="text-slate-400 mb-4">
              Please access this page from the link provided by your dispatcher.
            </p>
            <Button onClick={onBack} variant="outline" className="border-slate-600">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (driverLoading || routesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="text-center">
            <h1 className="text-lg font-bold text-white">
              {(driver as any)?.name || "Driver"}
            </h1>
            <p className="text-xs text-slate-400">
              {activeRoute ? `Route: ${route?.name}` : "No active route"}
            </p>
          </div>
          <button
            onClick={() => { refetchRoutes(); refetchRoute(); }}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </header>

      {!activeRoute ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="bg-slate-800/50 border-slate-700 max-w-md w-full">
            <CardContent className="py-8 text-center">
              <Clock className="h-12 w-12 mx-auto text-yellow-400 mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Waiting for Route</h2>
              <p className="text-slate-400 mb-4">
                Your dispatcher will send you a route when ready. Pull down to refresh.
              </p>
              <Button
                onClick={() => refetchRoutes()}
                variant="outline"
                className="border-slate-600"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Check for Routes
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="h-56 relative">
            <MapContainer
              center={mapCenter}
              zoom={14}
              style={{ height: "100%", width: "100%" }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapCenter center={mapCenter} />

              {currentLocation && (
                <Marker position={[currentLocation.lat, currentLocation.lng]} icon={currentLocationIcon}>
                  <Popup>Your Location</Popup>
                </Marker>
              )}

              {pendingStops.map((stop: any, index: number) => {
                if (!stop.delivery?.lat || !stop.delivery?.lng) return null;
                const color = index === 0 ? "#22c55e" : "#3b82f6";
                return (
                  <Marker
                    key={stop.id}
                    position={[stop.delivery.lat, stop.delivery.lng]}
                    icon={createNumberedIcon(completedStops.length + index + 1, color)}
                  >
                    <Popup>{stop.delivery.addressText}</Popup>
                  </Marker>
                );
              })}
            </MapContainer>

            <div className="absolute bottom-4 right-4 z-[1000]">
              <Button
                size="sm"
                onClick={updateLocation}
                disabled={isLocating}
                className="bg-blue-500 hover:bg-blue-600 shadow-lg"
              >
                {isLocating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Navigation className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-24">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-lg">Progress</CardTitle>
                  <span className="text-blue-400 font-bold">
                    {completedStops.length}/{stops.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="w-full bg-slate-700 rounded-full h-2.5">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full transition-all"
                    style={{ width: `${(completedStops.length / stops.length) * 100}%` }}
                  />
                </div>
                
                {route?.estimatedDuration && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-slate-900/50 rounded-lg p-3">
                      <p className="text-slate-500">Est. Total Time</p>
                      <p className="text-white font-bold text-lg">
                        {Math.floor(route.estimatedDuration / 60)}h {route.estimatedDuration % 60}m
                      </p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3">
                      <p className="text-slate-500">Distance</p>
                      <p className="text-white font-bold text-lg">
                        {route.estimatedDistance?.toFixed(1) || 0} km
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {currentStop && (
              <Card className="bg-green-500/10 border-green-500/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold">
                      {completedStops.length + 1}
                    </div>
                    <CardTitle className="text-green-400">Next Stop</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-white font-medium">{currentStop.delivery?.addressText}</p>
                    {currentStop.delivery?.customerName && (
                      <p className="text-slate-400 text-sm mt-1">
                        {currentStop.delivery.customerName}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {currentStop.delivery?.customerPhone && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`tel:${currentStop.delivery.customerPhone}`)}
                        className="flex-1 border-slate-600"
                      >
                        <Phone className="mr-2 h-4 w-4" />
                        Call
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => openInMaps(
                        currentStop.delivery.lat,
                        currentStop.delivery.lng,
                        currentStop.delivery.addressText
                      )}
                      className="flex-1 bg-blue-500 hover:bg-blue-600"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Navigate
                    </Button>
                  </div>

                  {currentStop.delivery?.notes && (
                    <div className="bg-slate-900/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                        <FileText className="h-4 w-4" />
                        Notes
                      </div>
                      <p className="text-white text-sm">{currentStop.delivery.notes}</p>
                    </div>
                  )}

                  <Button
                    onClick={() => setShowProofModal(true)}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3"
                  >
                    <CheckCircle className="mr-2 h-5 w-5" />
                    Get Signature & Photo
                  </Button>
                </CardContent>
              </Card>
            )}

            {pendingStops.length > 1 && (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-sm">Upcoming Stops</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pendingStops.slice(1, 4).map((stop: any, index: number) => (
                    <div
                      key={stop.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/30"
                    >
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-bold">
                        {completedStops.length + index + 2}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{stop.delivery?.addressText}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    </div>
                  ))}
                  {pendingStops.length > 4 && (
                    <p className="text-slate-500 text-xs text-center">
                      +{pendingStops.length - 4} more stops
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {completedStops.length > 0 && (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    Completed ({completedStops.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {completedStops.slice(-3).map((stop: any, index: number) => (
                    <div
                      key={stop.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-green-500/10"
                    >
                      <CheckCircle className="h-5 w-5 text-green-400" />
                      <p className="text-slate-300 text-sm truncate">{stop.delivery?.addressText}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {pendingStops.length === 0 && completedStops.length > 0 && (
              <Card className="bg-green-500/10 border-green-500/30">
                <CardContent className="py-8 text-center">
                  <CheckCircle className="h-16 w-16 mx-auto text-green-400 mb-4" />
                  <h2 className="text-xl font-bold text-white mb-2">Route Complete!</h2>
                  <p className="text-slate-400">
                    You've completed all {completedStops.length} deliveries.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {showProofModal && currentStop && (
            <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 overflow-hidden" style={{ overscrollBehavior: 'none' }}>
              <Card className="bg-slate-800 border-slate-700 max-w-md w-full max-h-[90vh] overflow-y-auto">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-white">Delivery Proof</CardTitle>
                  <button onClick={() => setShowProofModal(false)} className="text-slate-400 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-white text-sm font-medium block mb-2">Customer Signature</label>
                    <div className="relative w-full bg-slate-900 rounded border-2 border-slate-600" style={{ height: "120px" }}>
                      <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full rounded cursor-crosshair"
                        style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none", display: "block" } as any}
                      />
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={() => { const ctx = canvasRef.current?.getContext("2d"); if (ctx && canvasRef.current) { ctx.fillStyle = "#111827"; ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height); setSignature(null); } }} className="flex-1 border-slate-600"><RotateCcw className="h-4 w-4 mr-1" />Clear</Button>
                      {signature && <span className="flex-1 text-green-400 text-sm">✓ Captured</span>}
                    </div>
                  </div>

                  <div>
                    <label className="text-white text-sm font-medium block mb-2">Photo of Item</label>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={capturePhoto} className="hidden" />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full border-slate-600"><Camera className="mr-2 h-4 w-4" />Take Photo</Button>
                    {picture && <div className="mt-2 text-green-400 text-sm">✓ Photo captured</div>}
                  </div>

                  <div>
                    <label className="text-white text-sm font-medium block mb-2">Notes</label>
                    <input type="text" value={proofNotes} onChange={(e) => setProofNotes(e.target.value)} placeholder="Optional notes..." className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white text-sm" />
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setShowProofModal(false)} className="flex-1 border-slate-600">Close</Button>
                      <Button 
                        onClick={() => submitProofMutation.mutate({ routeId: activeRoute.id, stopId: currentStop.id })} 
                        disabled={(!signature && !picture) || submitProofMutation.isPending}
                        className="flex-1 bg-green-500 hover:bg-green-600"
                      >
                        {submitProofMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                        Submit Proof
                      </Button>
                    </div>
                    
                    <div className="border-t border-slate-600 pt-3">
                      <p className="text-slate-400 text-xs mb-2">No signature/photo available?</p>
                      <Button 
                        onClick={() => skipDeliveryMutation.mutate({ routeId: activeRoute.id, stopId: currentStop.id })} 
                        disabled={skipDeliveryMutation.isPending}
                        variant="outline"
                        className="w-full border-orange-500 text-orange-400 hover:bg-orange-500/10"
                      >
                        {skipDeliveryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                        Mark as Delivered
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
