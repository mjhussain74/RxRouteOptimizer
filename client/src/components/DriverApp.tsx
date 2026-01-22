import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Navigation,
  MapPin,
  CheckCircle,
  Clock,
  Phone,
  FileText,
  ChevronRight,
  Loader2,
  ExternalLink,
  RefreshCw,
  Camera,
  RotateCcw,
  Send,
  X,
  BarChart3,
  AlertTriangle,
  Package,
  Scan,
  Play,
  Cloud,
  CloudOff,
  Upload,
  History,
} from "lucide-react";
import { saveProofLocally, getProofByStopId } from "../lib/localProofStorage";
import { 
  startAutoSync, 
  stopAutoSync, 
  subscribeSyncStatus, 
  forceSyncNow,
  SyncStatus 
} from "../lib/proofSyncService";
import { Html5QrcodeScanner, Html5Qrcode } from "html5-qrcode";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { io, Socket } from "socket.io-client";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const createNumberedIcon = (number: number, color: string) => {
  return L.divIcon({
    className: "custom-div-icon",
    html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">${number}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const currentLocationIcon = L.divIcon({
  className: "custom-div-icon",
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
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const [isLocating, setIsLocating] = useState(false);
  const [showProofModal, setShowProofModal] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [proofNotes, setProofNotes] = useState("");
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showDeliveryReport, setShowDeliveryReport] = useState(false);
  const [showDeliveryHistory, setShowDeliveryHistory] = useState(false);
  const [showRouteActivation, setShowRouteActivation] = useState(false);
  const [activationScanningStopId, setActivationScanningStopId] = useState<number | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    lastSyncTime: null,
    lastError: null,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: driver, isLoading: driverLoading } = useQuery({
    queryKey: [`/api/drivers/${driverId}`],
    enabled: !!driverId,
  });

  const {
    data: driverRoutes = [],
    isLoading: routesLoading,
    refetch: refetchRoutes,
  } = useQuery({
    queryKey: [`/api/drivers/${driverId}/routes`],
    enabled: !!driverId,
  });

  const activeRoute = (driverRoutes as any[]).find(
    (r: any) => r.status === "dispatched" || r.status === "active",
  );

  const { data: routeData, refetch: refetchRoute } = useQuery({
    queryKey: [`/api/routes/${activeRoute?.id}`],
    enabled: !!activeRoute?.id,
  });

  const { data: deliveryHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: [`/api/drivers/${driverId}/delivery-history`],
    enabled: !!driverId && showDeliveryHistory,
  });

  useEffect(() => {
    startAutoSync(30000);
    const unsubscribe = subscribeSyncStatus(setSyncStatus);
    
    return () => {
      stopAutoSync();
      unsubscribe();
    };
  }, []);

  const completeStopMutation = useMutation({
    mutationFn: async ({
      routeId,
      stopId,
    }: {
      routeId: number;
      stopId: number;
    }) => {
      const response = await fetch(
        `/api/routes/${routeId}/stops/${stopId}/complete`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("Failed to complete stop");
      return response.json();
    },
    onSuccess: () => {
      refetchRoute();
    },
  });

  const submitProofMutation = useMutation({
    mutationFn: async ({
      routeId,
      stopId,
    }: {
      routeId: number;
      stopId: number;
    }) => {
      // Barcode verification - check against delivery ID, prescriptions array, or legacy rxNumber
      if (scannedBarcode) {
        const trimmedBarcode = scannedBarcode.trim().toLowerCase();
        const delivery = currentStop?.delivery;
        
        // Check if barcode matches delivery ID, any prescription, or legacy rxNumber
        let barcodeValid = false;
        
        // Check against delivery identifier (actual or fallback DEL{id})
        if (delivery?.deliveryIdentifier) {
          barcodeValid = delivery.deliveryIdentifier.toLowerCase() === trimmedBarcode;
        }
        // Also check fallback format DEL{id} for deliveries without identifiers
        if (!barcodeValid && delivery?.id) {
          const fallbackId = `del${delivery.id}`;
          barcodeValid = fallbackId === trimmedBarcode;
        }
        
        // If not matched, check prescriptions
        if (!barcodeValid && delivery?.prescriptions && delivery.prescriptions.length > 0) {
          barcodeValid = delivery.prescriptions.some(
            (rx: any) => rx.rxNumber?.toLowerCase() === trimmedBarcode
          );
        }
        
        // If still not matched, check legacy rxNumber
        if (!barcodeValid && delivery?.rxNumber) {
          barcodeValid = delivery.rxNumber.trim().toLowerCase() === trimmedBarcode;
        }
        
        if (!barcodeValid && delivery) {
          throw new Error("Scanned barcode does not match delivery ID or any prescription number");
        }
      }

      console.log("📦 Saving proof locally first:", { 
        routeId, 
        stopId, 
        hasSignature: !!signature, 
        hasPicture: !!picture,
        signatureLength: signature?.length || 0,
        pictureLength: picture?.length || 0,
        notes: proofNotes,
        barcode: scannedBarcode
      });

      // Save proof locally first (local-first approach)
      const localProof = await saveProofLocally({
        routeId,
        stopId,
        signature,
        picture,
        notes: proofNotes,
        barcode: scannedBarcode,
      });
      
      console.log("📦 Proof saved locally:", localProof.id);

      // Mark stop as complete on the server immediately (without proof images)
      const response = await fetch(
        `/api/routes/${routeId}/stops/${stopId}/complete-local`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            localProofId: localProof.id,
            notes: proofNotes,
            barcode: scannedBarcode,
          }),
          credentials: "include",
        },
      );
      
      console.log("📥 Complete-local response status:", response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("❌ Complete-local failed:", errorData);
        throw new Error(errorData.error || "Failed to mark delivery complete");
      }
      
      return { ...await response.json(), localProofId: localProof.id };
    },
    onSuccess: async (data) => {
      console.log("✅ Delivery marked complete, proof saved locally", data);
      console.log("📤 Proof will upload in background...");
      
      setSignature(null);
      setPicture(null);
      setProofNotes("");
      setScannedBarcode(null);
      setShowProofModal(false);
      
      // Refetch route data immediately
      await refetchRoute();
      
      // Trigger sync to upload proofs in background
      forceSyncNow();
    },
    onError: (error) => {
      console.error("❌ Proof submission error:", error);
    },
  });

  const skipDeliveryMutation = useMutation({
    mutationFn: async ({
      routeId,
      stopId,
    }: {
      routeId: number;
      stopId: number;
    }) => {
      console.log("📝 Submitting skip delivery for stop:", stopId);
      const response = await fetch(
        `/api/routes/${routeId}/stops/${stopId}/proof`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signature: null,
            picture: null,
            notes: proofNotes || "Skipped - no signature/photo available",
          }),
          credentials: "include",
        },
      );
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
      await new Promise((resolve) => setTimeout(resolve, 500));
      await refetchRoute();
    },
    onError: (error) => {
      console.error("❌ Skip delivery error:", error);
    },
  });

  const scanPackageMutation = useMutation({
    mutationFn: async ({ routeId, stopId }: { routeId: number; stopId: number }) => {
      const response = await fetch(`/api/routes/${routeId}/stops/${stopId}/scan`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to scan package");
      return response.json();
    },
    onSuccess: () => {
      refetchRoute();
      setActivationScanningStopId(null);
    },
  });

  const activateRouteMutation = useMutation({
    mutationFn: async (routeId: number) => {
      const response = await fetch(`/api/routes/${routeId}/activate`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to activate route");
      }
      return response.json();
    },
    onSuccess: () => {
      refetchRoute();
      refetchRoutes();
      setShowRouteActivation(false);
    },
  });

  const setUrgentPriorityMutation = useMutation({
    mutationFn: async ({ routeId, stopId }: { routeId: number; stopId: number }) => {
      const response = await fetch(`/api/routes/${routeId}/stops/${stopId}/urgent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to set priority");
      }
      return response.json();
    },
    onSuccess: () => {
      refetchRoute();
    },
    onError: (error: Error) => {
      console.error("Failed to set urgent priority:", error.message);
    },
  });

  const cancelDeliveryMutation = useMutation({
    mutationFn: async ({ routeId, stopId, reason }: { routeId: number; stopId: number; reason: string }) => {
      const response = await fetch(`/api/routes/${routeId}/stops/${stopId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to cancel delivery");
      }
      return response.json();
    },
    onSuccess: async () => {
      console.log("❌ Delivery cancelled");
      setCancelReason("");
      setShowCancelModal(false);
      setShowProofModal(false);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await refetchRoute();
    },
    onError: (error: Error) => {
      console.error("Failed to cancel delivery:", error.message);
    },
  });

  useEffect(() => {
    if (!showProofModal) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Wait until modal + layout are visible
    requestAnimationFrame(() => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) return;

      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;

      // 🔑 Reset transform before scaling (important!)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, rect.width, rect.height);
    });

    let drawing = false;

    const getPos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const start = (e: PointerEvent) => {
      e.preventDefault();
      drawing = true;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const move = (e: PointerEvent) => {
      if (!drawing) return;
      e.preventDefault();
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const end = () => {
      if (!drawing) return;
      drawing = false;
      setSignature(canvas.toDataURL("image/png"));
    };

    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    return () => {
      canvas.removeEventListener("pointerdown", start);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", end);
    };
  }, [showProofModal]);

  const capturePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPicture(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleScanBarcode = () => {
    setIsScanning(true);
    setScannedBarcode(null);

    // Using Html5Qrcode directly instead of the Scanner UI for more control
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode("reader");
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            setScannedBarcode(decodedText);
            setIsScanning(false);
            html5QrCode
              .stop()
              .catch((err) => console.error("Stop failed", err));
          },
          (errorMessage) => {
            // Scanning...
          },
        );
      } catch (err) {
        console.error("Camera access failed:", err);
        // Fallback or alert user
        alert(
          "Could not access camera. Please ensure you have granted permission and are using HTTPS.",
        );
        setIsScanning(false);
      }
    }, 300);
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
      { enableHighAccuracy: true },
    );
  }, [driverId, socket]);

  useEffect(() => {
    updateLocation();
    const interval = setInterval(updateLocation, 30000);
    return () => clearInterval(interval);
  }, [updateLocation]);

  const route = (routeData as any)?.route;
  const stops = (routeData as any)?.stops || [];
  const pendingStops = stops.filter((s: any) => s.status !== "completed" && s.status !== "cancelled");
  const completedStops = stops.filter((s: any) => s.status === "completed" || s.status === "cancelled");

  const currentStop = pendingStops[selectedStopIndex] || pendingStops[0];

  const mapCenter: [number, number] = currentLocation
    ? [currentLocation.lat, currentLocation.lng]
    : currentStop?.delivery?.lat && currentStop?.delivery?.lng
      ? [currentStop.delivery.lat, currentStop.delivery.lng]
      : [40.7128, -74.006];

  const openInMaps = (lat: number, lng: number, address: string) => {
    // Always use Google Maps HTTPS URL for consistent behavior across all platforms
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    );
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
            <Button
              onClick={onBack}
              variant="outline"
              className="border-slate-600"
            >
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
          <div className="flex gap-2 items-center">
            {(syncStatus.pendingCount > 0 || syncStatus.failedCount > 0) && (
              <button
                onClick={() => forceSyncNow()}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  syncStatus.failedCount > 0 
                    ? 'bg-red-500/20 text-red-400' 
                    : syncStatus.isSyncing 
                      ? 'bg-blue-500/20 text-blue-400' 
                      : 'bg-yellow-500/20 text-yellow-400'
                }`}
                title={`${syncStatus.pendingCount} pending, ${syncStatus.failedCount} failed`}
              >
                {syncStatus.isSyncing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : syncStatus.isOnline ? (
                  <Upload className="h-3 w-3" />
                ) : (
                  <CloudOff className="h-3 w-3" />
                )}
                <span>{syncStatus.pendingCount + syncStatus.failedCount}</span>
              </button>
            )}
            <button
              onClick={() => setShowDeliveryReport(true)}
              className="text-slate-400 hover:text-white transition-colors"
              title="Current Route Report"
            >
              <BarChart3 className="h-5 w-5" />
            </button>
            <button
              onClick={() => setShowDeliveryHistory(true)}
              className="text-slate-400 hover:text-white transition-colors"
              title="Delivery History"
            >
              <History className="h-5 w-5" />
            </button>
            <button
              onClick={() => {
                refetchRoutes();
                refetchRoute();
              }}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {!activeRoute ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="bg-slate-800/50 border-slate-700 max-w-md w-full">
            <CardContent className="py-8 text-center">
              <Clock className="h-12 w-12 mx-auto text-yellow-400 mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">
                Waiting for Route
              </h2>
              <p className="text-slate-400 mb-4">
                Your dispatcher will send you a route when ready. Pull down to
                refresh.
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
                attribution="&copy; OpenStreetMap"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapCenter center={mapCenter} />

              {currentLocation && (
                <Marker
                  position={[currentLocation.lat, currentLocation.lng]}
                  icon={currentLocationIcon}
                >
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
                    icon={createNumberedIcon(
                      completedStops.length + index + 1,
                      color,
                    )}
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
                    style={{
                      width: `${(completedStops.length / stops.length) * 100}%`,
                    }}
                  />
                </div>

                {route?.estimatedDuration && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-slate-900/50 rounded-lg p-3">
                      <p className="text-slate-500">Est. Total Time</p>
                      <p className="text-white font-bold text-lg">
                        {Math.floor(route.estimatedDuration / 60)}h{" "}
                        {route.estimatedDuration % 60}m
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
                    <p className="text-white font-medium">
                      {currentStop.delivery?.addressText}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {currentStop.delivery?.customerName && (
                        <p className="text-slate-400 text-sm">
                          {currentStop.delivery.customerName}
                        </p>
                      )}
                      {currentStop.delivery?.deliveryIdentifier && (
                        <span className="text-blue-400 text-sm font-medium">
                          {currentStop.delivery.deliveryIdentifier}
                        </span>
                      )}
                    </div>
                    {/* Show prescriptions */}
                    {currentStop.delivery?.prescriptions && currentStop.delivery.prescriptions.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-slate-500 text-xs font-medium">Prescriptions:</p>
                        <div className="flex flex-wrap gap-1">
                          {currentStop.delivery.prescriptions.map((rx: any) => (
                            <span
                              key={rx.id}
                              className="inline-flex items-center px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-mono"
                            >
                              {rx.rxNumber}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : currentStop.delivery?.rxNumber ? (
                      <p className="text-blue-400 text-sm font-mono mt-1">
                        RX: {currentStop.delivery.rxNumber}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    {currentStop.delivery?.customerPhone && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(
                            `tel:${currentStop.delivery.customerPhone}`,
                          )
                        }
                        className="flex-1 border-slate-600"
                      >
                        <Phone className="mr-2 h-4 w-4" />
                        Call
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        if (currentStop.delivery?.lat && currentStop.delivery?.lng) {
                          openInMaps(
                            currentStop.delivery.lat,
                            currentStop.delivery.lng,
                            currentStop.delivery.addressText,
                          );
                        } else {
                          // Fallback to address-based navigation
                          const address = encodeURIComponent(currentStop.delivery?.addressText || '');
                          window.open(`https://www.google.com/maps/search/?api=1&query=${address}`, '_blank');
                        }
                      }}
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
                      <p className="text-white text-sm">
                        {currentStop.delivery.notes}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setShowProofModal(true);
                        setScannedBarcode(null); // Reset scanned barcode when opening modal
                        setIsScanning(false);
                      }}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3"
                    >
                      <CheckCircle className="mr-2 h-5 w-5" />
                      Complete
                    </Button>
                    <Button
                      onClick={() => setShowCancelModal(true)}
                      variant="outline"
                      className="border-red-500 text-red-400 hover:bg-red-500/10 py-3"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Can't Deliver
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {pendingStops.length > 1 && (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-sm">
                    Upcoming Stops
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                  {pendingStops.slice(1).map((stop: any, index: number) => (
                    <div
                      key={stop.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/30"
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        stop.priority === "urgent" 
                          ? "bg-red-500/20 text-red-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}>
                        {stop.priority === "urgent" ? "!" : completedStops.length + index + 2}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">
                          {stop.delivery?.addressText}
                        </p>
                        {stop.priority === "urgent" && (
                          <span className="text-xs text-red-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Urgent
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setUrgentPriorityMutation.mutate({
                          routeId: activeRoute.id,
                          stopId: stop.id
                        })}
                        disabled={stop.priority === "urgent" || setUrgentPriorityMutation.isPending}
                        className={`h-7 px-2 ${
                          stop.priority === "urgent"
                            ? "text-slate-500"
                            : "text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                        }`}
                        title="Mark as urgent (deliver first)"
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
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
                      <p className="text-slate-300 text-sm truncate">
                        {stop.delivery?.addressText}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {pendingStops.length === 0 && completedStops.length > 0 && (
              <Card className="bg-green-500/10 border-green-500/30">
                <CardContent className="py-8 text-center">
                  <CheckCircle className="h-16 w-16 mx-auto text-green-400 mb-4" />
                  <h2 className="text-xl font-bold text-white mb-2">
                    Route Complete!
                  </h2>
                  <p className="text-slate-400">
                    You've completed all {completedStops.length} deliveries.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {showDeliveryReport && activeRoute && (
            <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4">
              <Card className="bg-slate-800 border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Delivery Report
                  </CardTitle>
                  <button
                    onClick={() => setShowDeliveryReport(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-slate-700/50 rounded">
                    <p className="text-slate-400 text-xs">Route</p>
                    <p className="text-white font-semibold">{activeRoute.name}</p>
                    <p className="text-slate-400 text-xs mt-1">
                      Started: {activeRoute.createdAt ? new Date(activeRoute.createdAt).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-700/50 rounded text-center">
                      <p className="text-2xl font-bold text-white">{(routeData as any)?.stops?.length || 0}</p>
                      <p className="text-slate-400 text-xs">Total</p>
                    </div>
                    <div className="p-3 bg-green-500/10 rounded border border-green-500/30 text-center">
                      <p className="text-2xl font-bold text-green-400">{completedStops.length}</p>
                      <p className="text-green-400 text-xs">Completed</p>
                    </div>
                    <div className="p-3 bg-yellow-500/10 rounded border border-yellow-500/30 text-center">
                      <p className="text-2xl font-bold text-yellow-400">{pendingStops.length}</p>
                      <p className="text-yellow-400 text-xs">Pending</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-600 pt-4">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      Completed Deliveries ({completedStops.length})
                    </h3>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {completedStops.map((stop: any, idx: number) => (
                        <div
                          key={stop.id}
                          className="p-3 bg-slate-700/30 rounded border border-slate-600"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-0.5 rounded">
                                  #{idx + 1}
                                </span>
                                <span className="text-xs font-mono text-blue-400">
                                  {stop.delivery?.deliveryIdentifier || `DEL${stop.delivery?.id}`}
                                </span>
                              </div>
                              <p className="text-white text-sm font-medium">
                                {stop.delivery?.customerName || 'Customer'}
                              </p>
                              <p className="text-slate-400 text-xs mt-1">
                                {stop.delivery?.addressText}
                              </p>
                              {stop.delivery?.customerPhone && (
                                <p className="text-slate-500 text-xs mt-1">
                                  Phone: {stop.delivery.customerPhone}
                                </p>
                              )}
                              {stop.delivery?.prescriptions && stop.delivery.prescriptions.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {stop.delivery.prescriptions.map((rx: any, rxIdx: number) => (
                                    <span key={rxIdx} className="bg-slate-600/50 text-slate-300 text-xs px-2 py-0.5 rounded">
                                      Rx: {rx.rxNumber}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {stop.completedAt && (
                                <p className="text-slate-500 text-xs mt-2">
                                  Completed: {new Date(stop.completedAt).toLocaleString()}
                                </p>
                              )}
                            </div>
                            <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                          </div>
                        </div>
                      ))}
                      {completedStops.length === 0 && (
                        <p className="text-slate-500 text-center py-4">No completed deliveries yet</p>
                      )}
                    </div>
                  </div>

                  {pendingStops.length > 0 && (
                    <div className="border-t border-slate-600 pt-4">
                      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-yellow-400" />
                        Pending Deliveries ({pendingStops.length})
                      </h3>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {pendingStops.map((stop: any, idx: number) => (
                          <div
                            key={stop.id}
                            className="p-2 bg-slate-700/20 rounded border border-slate-700 flex items-center gap-2"
                          >
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                              stop.priority === "urgent" 
                                ? "bg-red-500/20 text-red-400" 
                                : "bg-yellow-500/20 text-yellow-400"
                            }`}>
                              {stop.priority === "urgent" ? "URGENT" : `#${completedStops.length + idx + 1}`}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm truncate">{stop.delivery?.customerName || 'Customer'}</p>
                              <p className="text-slate-500 text-xs truncate">{stop.delivery?.addressText}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={() => setShowDeliveryReport(false)}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    Close
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {showDeliveryHistory && (
            <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4">
              <Card className="bg-slate-800 border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Delivery History
                  </CardTitle>
                  <button
                    onClick={() => setShowDeliveryHistory(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                    </div>
                  ) : (deliveryHistory as any[]).length === 0 ? (
                    <div className="text-center py-8">
                      <History className="h-12 w-12 mx-auto text-slate-500 mb-3" />
                      <p className="text-slate-400">No delivery history yet</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="p-3 bg-slate-700/50 rounded text-center">
                          <p className="text-2xl font-bold text-white">
                            {(deliveryHistory as any[]).length}
                          </p>
                          <p className="text-slate-400 text-xs">Total Routes</p>
                        </div>
                        <div className="p-3 bg-green-500/10 rounded border border-green-500/30 text-center">
                          <p className="text-2xl font-bold text-green-400">
                            {(deliveryHistory as any[]).reduce((acc, r) => acc + (r.completedCount || 0), 0)}
                          </p>
                          <p className="text-green-400 text-xs">Total Deliveries</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {(deliveryHistory as any[]).map((route: any) => (
                          <div key={route.id} className="border border-slate-600 rounded-lg overflow-hidden">
                            <div className="bg-slate-700/50 p-3 flex items-center justify-between">
                              <div>
                                <p className="text-white font-semibold">{route.name}</p>
                                <p className="text-slate-400 text-xs">
                                  {route.createdAt ? new Date(route.createdAt).toLocaleDateString() : 'N/A'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-1 rounded ${
                                  route.status === 'completed' 
                                    ? 'bg-green-500/20 text-green-400'
                                    : route.status === 'active' || route.status === 'dispatched'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-slate-500/20 text-slate-400'
                                }`}>
                                  {route.status}
                                </span>
                                <span className="text-sm text-white">
                                  {route.completedCount || 0}/{route.totalCount || 0}
                                </span>
                              </div>
                            </div>
                            
                            {route.stops && route.stops.length > 0 && (
                              <div className="p-3 space-y-2 max-h-48 overflow-y-auto bg-slate-800/50">
                                {route.stops.filter((s: any) => s.status === 'completed').map((stop: any, idx: number) => (
                                  <div
                                    key={stop.id}
                                    className="flex items-start gap-2 p-2 bg-slate-700/30 rounded"
                                  >
                                    <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-mono text-blue-400">
                                          {stop.delivery?.deliveryIdentifier || `DEL${stop.delivery?.id}`}
                                        </span>
                                      </div>
                                      <p className="text-white text-sm">
                                        {stop.delivery?.customerName || 'Customer'}
                                      </p>
                                      <p className="text-slate-400 text-xs truncate">
                                        {stop.delivery?.addressText}
                                      </p>
                                      {stop.completedAt && (
                                        <p className="text-slate-500 text-xs mt-1">
                                          {new Date(stop.completedAt).toLocaleString()}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {route.stops.filter((s: any) => s.status === 'completed').length === 0 && (
                                  <p className="text-slate-500 text-xs text-center py-2">No completed deliveries</p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <Button
                    onClick={() => setShowDeliveryHistory(false)}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    Close
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {showProofModal && currentStop && (
            <div
              className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4"
              style={{ overscrollBehavior: "none", touchAction: "none" }}
            >
              <Card className="bg-slate-800 border-slate-700 max-w-md w-full max-h-[90vh] overflow-y-auto">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-white text-lg">
                    Proof of Delivery
                  </CardTitle>
                  <button
                    onClick={() => setShowProofModal(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-blue-500/20">
                      <div className="flex flex-col gap-1 mb-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-slate-300">
                            Scan Delivery Label
                          </Label>
                          <span className="text-xs font-mono text-green-400">
                            {currentStop?.delivery?.deliveryIdentifier || `DEL${currentStop?.delivery?.id || 'N/A'}`}
                          </span>
                        </div>
                        {(currentStop?.delivery?.prescriptions?.length > 0 || currentStop?.delivery?.rxNumber) && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">or Rx Number</span>
                            <span className="text-xs font-mono text-blue-400">
                              {currentStop?.delivery?.prescriptions && currentStop.delivery.prescriptions.length > 0 
                                ? currentStop.delivery.prescriptions.map((rx: any) => rx.rxNumber).join(", ")
                                : currentStop?.delivery?.rxNumber || "N/A"}
                            </span>
                          </div>
                        )}
                      </div>

                      {isScanning ? (
                        <div className="flex flex-col items-center gap-3 py-4 bg-black/40 rounded-lg border border-dashed border-slate-600">
                          <div
                            id="reader"
                            className="w-full max-w-[300px] overflow-hidden rounded-lg"
                          ></div>
                          <p className="text-xs text-slate-400">
                            Position barcode within the frame
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsScanning(false)}
                            className="text-slate-500"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : scannedBarcode ? (
                        <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-400" />
                            <span className="text-white font-mono">
                              {scannedBarcode}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setScannedBarcode(null)}
                            className="text-slate-400"
                          >
                            Rescan
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-blue-400"
                          onClick={handleScanBarcode}
                        >
                          <Camera className="mr-2 h-4 w-4" />
                          Scan Barcode
                        </Button>
                      )}

                    </div>

                    <div>
                      <label className="text-white text-sm font-medium block mb-2">
                        Customer Signature
                      </label>
                      <canvas
                        ref={canvasRef}
                        className="w-full h-32 border-2 border-slate-600 rounded bg-slate-900"
                        style={{
                          touchAction: "none",
                          WebkitUserSelect: "none",
                          userSelect: "none",
                          display: "block",
                        }}
                      />
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const ctx = canvasRef.current?.getContext("2d");
                            if (ctx && canvasRef.current) {
                              ctx.fillStyle = "#111827";
                              ctx.fillRect(
                                0,
                                0,
                                canvasRef.current.width,
                                canvasRef.current.height,
                              );
                              setSignature(null);
                            }
                          }}
                          className="flex-1 border-slate-600"
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Clear
                        </Button>
                        {signature && (
                          <span className="flex-1 text-green-400 text-sm">
                            ✓ Captured
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-white text-sm font-medium block mb-2">
                        Photo of Item
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={capturePhoto}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full border-slate-600"
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        Take Photo
                      </Button>
                      {picture && (
                        <div className="mt-2 text-green-400 text-sm">
                          ✓ Photo captured
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-white text-sm font-medium block mb-2">
                        Notes
                      </label>
                      <input
                        type="text"
                        value={proofNotes}
                        onChange={(e) => setProofNotes(e.target.value)}
                        placeholder="Optional notes..."
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white text-sm"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      {submitProofMutation.isError && (
                        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                          {submitProofMutation.error instanceof Error
                            ? submitProofMutation.error.message
                            : "Failed to submit proof"}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowProofModal(false)}
                          className="flex-1 border-slate-600"
                        >
                          Close
                        </Button>
                        <Button
                          onClick={() =>
                            submitProofMutation.mutate({
                              routeId: activeRoute.id,
                              stopId: currentStop.id,
                            })
                          }
                          disabled={
                            (!signature &&
                              !picture &&
                              !proofNotes &&
                              !scannedBarcode) ||
                            submitProofMutation.isPending
                          }
                          className="flex-1 bg-green-500 hover:bg-green-600"
                        >
                          {submitProofMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Submit Proof
                        </Button>
                      </div>

                      <div className="border-t border-slate-600 pt-3">
                        <p className="text-slate-400 text-xs mb-2">
                          No signature/photo available?
                        </p>
                        <div className="flex gap-2">
                          <Button
                            onClick={() =>
                              skipDeliveryMutation.mutate({
                                routeId: activeRoute.id,
                                stopId: currentStop.id,
                              })
                            }
                            disabled={skipDeliveryMutation.isPending}
                            variant="outline"
                            className="flex-1 border-orange-500 text-orange-400 hover:bg-orange-500/10"
                          >
                            {skipDeliveryMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <CheckCircle className="h-4 w-4 mr-2" />
                            )}
                            Mark as Delivered
                          </Button>
                          <Button
                            onClick={() => setShowCancelModal(true)}
                            variant="outline"
                            className="flex-1 border-red-500 text-red-400 hover:bg-red-500/10"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Can't Deliver
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {showCancelModal && currentStop && (
            <div
              className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4"
              style={{ overscrollBehavior: "none", touchAction: "none" }}
            >
              <Card className="bg-slate-800 border-slate-700 max-w-md w-full">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <X className="h-5 w-5 text-red-400" />
                    Can't Deliver
                  </CardTitle>
                  <button
                    onClick={() => {
                      setShowCancelModal(false);
                      setCancelReason("");
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-white text-sm font-medium">
                      {currentStop.delivery?.customerName}
                    </p>
                    <p className="text-slate-400 text-xs">
                      {currentStop.delivery?.addressText}
                    </p>
                  </div>

                  <div>
                    <label className="text-white text-sm font-medium block mb-2">
                      Reason for cancellation *
                    </label>
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="e.g., Customer not home, wrong address, refused delivery..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white text-sm min-h-[80px]"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCancelModal(false);
                        setCancelReason("");
                      }}
                      className="flex-1 border-slate-600"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() =>
                        cancelDeliveryMutation.mutate({
                          routeId: activeRoute.id,
                          stopId: currentStop.id,
                          reason: cancelReason,
                        })
                      }
                      disabled={!cancelReason.trim() || cancelDeliveryMutation.isPending}
                      className="flex-1 bg-red-500 hover:bg-red-600"
                    >
                      {cancelDeliveryMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <X className="h-4 w-4 mr-2" />
                      )}
                      Cancel Delivery
                    </Button>
                  </div>

                  {cancelDeliveryMutation.isError && (
                    <p className="text-red-400 text-xs text-center">
                      {cancelDeliveryMutation.error instanceof Error
                        ? cancelDeliveryMutation.error.message
                        : "Failed to cancel delivery"}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
