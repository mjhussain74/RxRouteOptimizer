import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Route, MapPin, Navigation, Loader2, CheckCircle, AlertCircle, AlertTriangle, Search, X, QrCode, ScanLine, Check } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { Html5Qrcode } from "html5-qrcode";

interface DeliveryZone {
  id: number;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  color: string | null;
  isActive: boolean;
}

interface Delivery {
  id: number;
  batchId: number;
  addressText: string;
  lat: number | null;
  lng: number | null;
  customerName: string | null;
  customerPhone: string | null;
  rxNumber: string | null;
  priority: string | null;
  status: string;
  zoneId: number | null;
}

interface RouteOptimizerProps {
  selectedBatchId: number | null;
  batches: any[];
  onSelectBatch: (batchId: number) => void;
  onRouteCreated: (routeId: number) => void;
}

export default function RouteOptimizer({
  selectedBatchId,
  batches,
  onSelectBatch,
  onRouteCreated,
}: RouteOptimizerProps) {
  const [startAddress, setStartAddress] = useState("");
  const [startLat, setStartLat] = useState<number>(40.7128);
  const [startLng, setStartLng] = useState<number>(-74.006);
  const [routeName, setRouteName] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [scannedRxNumbers, setScannedRxNumbers] = useState<Set<string>>(new Set());
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [manualRxInput, setManualRxInput] = useState("");
  const [lastScannedRx, setLastScannedRx] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const queryClient = useQueryClient();

  const { data: zones = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/zones"],
  });

  const { data: activeDeliveries = [], isLoading: deliveriesLoading } = useQuery<Delivery[]>({
    queryKey: ["/api/deliveries/active", selectedZoneId],
    queryFn: async () => {
      const url = selectedZoneId 
        ? `/api/deliveries/active?zoneId=${selectedZoneId}`
        : "/api/deliveries/active";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch deliveries");
      return res.json();
    },
  });

  const filteredDeliveries = useMemo(() => {
    if (!searchQuery.trim()) return activeDeliveries;
    const query = searchQuery.toLowerCase();
    return activeDeliveries.filter(d => 
      d.addressText?.toLowerCase().includes(query) ||
      d.customerName?.toLowerCase().includes(query) ||
      d.rxNumber?.toLowerCase().includes(query)
    );
  }, [activeDeliveries, searchQuery]);

  const urgentCount = useMemo(() => {
    return Array.from(selectedDeliveryIds).filter(id => {
      const delivery = activeDeliveries.find(d => d.id === id);
      return delivery?.priority === "urgent";
    }).length;
  }, [selectedDeliveryIds, activeDeliveries]);

  // Auto-select orders when their RX is scanned
  useEffect(() => {
    if (lastScannedRx) {
      const matchingDelivery = activeDeliveries.find(
        d => d.rxNumber?.toLowerCase() === lastScannedRx.toLowerCase()
      );
      if (matchingDelivery) {
        setSelectedDeliveryIds(prev => new Set([...prev, matchingDelivery.id]));
        setScanError(null);
      } else {
        setScanError(`RX ${lastScannedRx} not found in active orders`);
      }
      setLastScannedRx(null);
    }
  }, [lastScannedRx, activeDeliveries]);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const startScanner = async () => {
    setScanError(null);
    setIsScannerActive(true);
    
    // Use setTimeout to ensure DOM element is ready (same approach as DriverApp)
    setTimeout(async () => {
      try {
        const html5Qrcode = new Html5Qrcode("rx-scanner");
        scannerRef.current = html5Qrcode;
        
        await html5Qrcode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 100 } },
          (decodedText) => {
            // Add to scanned set and trigger auto-select
            const rxNumber = decodedText.trim();
            setScannedRxNumbers(prev => new Set([...prev, rxNumber]));
            setLastScannedRx(rxNumber);
          },
          () => {} // Ignore scan failures
        );
      } catch (err) {
        console.error("Scanner error:", err);
        setScanError("Could not start camera. Please check permissions.");
        setIsScannerActive(false);
      }
    }, 300);
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop();
      scannerRef.current = null;
    }
    setIsScannerActive(false);
  };

  const handleManualRxAdd = () => {
    if (!manualRxInput.trim()) return;
    const rxNumber = manualRxInput.trim();
    setScannedRxNumbers(prev => new Set([...prev, rxNumber]));
    setLastScannedRx(rxNumber);
    setManualRxInput("");
  };

  const optimizeMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/routes/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error("Failed to optimize route");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries/active"] });
      setSelectedDeliveryIds(new Set());
      onRouteCreated(data.route.id);
    },
  });

  const handleGeocodeStart = async () => {
    if (!startAddress.trim()) return;
    
    setIsGeocoding(true);
    try {
      const response = await fetch(
        `/api/geocode?address=${encodeURIComponent(startAddress)}`,
        { method: "GET" }
      );
      const data = await response.json();
      if (data && data.lat !== undefined && data.lng !== undefined) {
        setStartLat(data.lat);
        setStartLng(data.lng);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleOptimize = () => {
    if (selectedDeliveryIds.size === 0) return;

    optimizeMutation.mutate({
      deliveryIds: Array.from(selectedDeliveryIds),
      zoneId: selectedZoneId,
      startLat,
      startLng,
      startAddress: startAddress.trim() || "Starting Point",
      routeName: routeName.trim() || `Route ${new Date().toLocaleTimeString()}`,
    });
  };

  const toggleDeliverySelection = (id: number) => {
    const newSet = new Set(selectedDeliveryIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedDeliveryIds(newSet);
  };

  const selectAllVisible = () => {
    const newSet = new Set(selectedDeliveryIds);
    filteredDeliveries
      .filter(d => d.rxNumber && scannedRxNumbers.has(d.rxNumber))
      .forEach(d => newSet.add(d.id));
    setSelectedDeliveryIds(newSet);
  };

  const isDeliveryScanned = (delivery: Delivery) => {
    return delivery.rxNumber ? scannedRxNumbers.has(delivery.rxNumber) : false;
  };

  const clearSelection = () => {
    setSelectedDeliveryIds(new Set());
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Create Route</h2>
        <p className="text-slate-400">
          Select orders from active deliveries and generate an optimized route.
        </p>
      </div>

      <Card className="bg-slate-800/50 border-slate-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-green-400" />
            Scan RX Barcodes to Add Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400 text-sm mb-4">
            Scan the RX barcode on each package to add it to the route. Only scanned orders will be included.
          </p>
          
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div id="rx-scanner" className={`w-full h-48 bg-slate-900 rounded-lg overflow-hidden ${!isScannerActive ? 'flex items-center justify-center' : ''}`}>
                {!isScannerActive && (
                  <div className="text-center">
                    <QrCode className="h-12 w-12 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">Camera inactive</p>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2 mt-3">
                {!isScannerActive ? (
                  <Button onClick={startScanner} className="flex-1 bg-green-600 hover:bg-green-700">
                    <ScanLine className="h-4 w-4 mr-2" />
                    Start Scanner
                  </Button>
                ) : (
                  <Button onClick={stopScanner} variant="outline" className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700">
                    <X className="h-4 w-4 mr-2" />
                    Stop Scanner
                  </Button>
                )}
              </div>
            </div>
            
            <div>
              <Label className="text-slate-300">Or enter RX number manually:</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Enter RX number..."
                  value={manualRxInput}
                  onChange={(e) => setManualRxInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManualRxAdd()}
                  className="bg-slate-900/50 border-slate-600 text-white"
                />
                <Button onClick={handleManualRxAdd} disabled={!manualRxInput.trim()} className="bg-blue-600 hover:bg-blue-700">
                  Add
                </Button>
              </div>
              
              {scanError && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {scanError}
                </div>
              )}
              
              <div className="mt-4">
                <p className="text-slate-400 text-xs mb-2">Scanned RX Numbers ({scannedRxNumbers.size}):</p>
                {scannedRxNumbers.size === 0 ? (
                  <p className="text-slate-500 text-sm">No packages scanned yet</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    {Array.from(scannedRxNumbers).map((rx) => (
                      <span key={rx} className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-mono group">
                        <Check className="h-3 w-3" />
                        {rx}
                        <button 
                          onClick={() => {
                            setScannedRxNumbers(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(rx);
                              return newSet;
                            });
                            // Also deselect any delivery with this RX
                            const delivery = activeDeliveries.find(d => d.rxNumber === rx);
                            if (delivery) {
                              setSelectedDeliveryIds(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(delivery.id);
                                return newSet;
                              });
                            }
                          }}
                          className="ml-1 opacity-50 hover:opacity-100 text-red-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="bg-slate-800/50 border-slate-700 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Route className="h-5 w-5 text-blue-400" />
              Route Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-300">Filter by Zone (optional)</Label>
              <Select
                value={selectedZoneId?.toString() || "all"}
                onValueChange={(value) => {
                  setSelectedZoneId(value === "all" ? null : parseInt(value));
                  setSelectedDeliveryIds(new Set());
                }}
              >
                <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                  <SelectValue placeholder="All zones" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white hover:bg-slate-700">
                    All Zones
                  </SelectItem>
                  {zones.map((zone) => (
                    <SelectItem
                      key={zone.id}
                      value={zone.id.toString()}
                      className="text-white hover:bg-slate-700"
                    >
                      {zone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-300">Route Name (optional)</Label>
              <Input
                placeholder="e.g., Morning Route"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            <div>
              <Label className="text-slate-300">Starting Address</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., 123 Warehouse St, New York, NY"
                  value={startAddress}
                  onChange={(e) => setStartAddress(e.target.value)}
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                />
                <Button
                  variant="outline"
                  onClick={handleGeocodeStart}
                  disabled={!startAddress || isGeocoding}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  {isGeocoding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Navigation className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-slate-500 text-xs mt-1">
                Coordinates: {startLat.toFixed(4)}, {startLng.toFixed(4)}
              </p>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Selected Orders</span>
                <span className="text-white font-bold">{selectedDeliveryIds.size}</span>
              </div>
              {urgentCount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Urgent
                  </span>
                  <span className="text-red-400 font-bold">{urgentCount}</span>
                </div>
              )}
            </div>

            <Button
              onClick={handleOptimize}
              disabled={selectedDeliveryIds.size === 0 || optimizeMutation.isPending}
              className="w-full bg-blue-500 hover:bg-blue-600"
            >
              {optimizeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Optimizing...
                </>
              ) : (
                <>
                  <Route className="mr-2 h-4 w-4" />
                  Generate Route ({selectedDeliveryIds.size} orders)
                </>
              )}
            </Button>

            {optimizeMutation.isSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-400 mb-2">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Route Created!</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Total Distance</p>
                    <p className="text-white font-medium">
                      {optimizeMutation.data.totalDistance.toFixed(1)} km
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Est. Duration</p>
                    <p className="text-white font-medium">
                      {Math.floor(optimizeMutation.data.estimatedDuration / 60)}h {optimizeMutation.data.estimatedDuration % 60}m
                    </p>
                  </div>
                </div>
              </div>
            )}

            {optimizeMutation.isError && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                Failed to optimize route. Please try again.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-blue-400" />
                Active Orders ({activeDeliveries.length})
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllVisible}
                  disabled={scannedRxNumbers.size === 0}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Select All Scanned
                </Button>
                {selectedDeliveryIds.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearSelection}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear ({selectedDeliveryIds.size})
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by address, customer, or RX number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
            </div>

            {deliveriesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            ) : filteredDeliveries.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                {activeDeliveries.length === 0 
                  ? "No active orders available. Orders that are complete or cancelled are excluded."
                  : "No orders match your search."}
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto space-y-2">
                {filteredDeliveries.map((delivery) => {
                  const isScanned = isDeliveryScanned(delivery);
                  return (
                    <div
                      key={delivery.id}
                      onClick={() => isScanned && toggleDeliverySelection(delivery.id)}
                      className={`flex items-start gap-3 rounded-lg p-3 transition-colors ${
                        !isScanned 
                          ? "bg-slate-900/20 opacity-50 cursor-not-allowed border border-slate-700/50"
                          : selectedDeliveryIds.has(delivery.id)
                          ? "bg-blue-500/20 border border-blue-500/50 cursor-pointer"
                          : "bg-slate-900/30 hover:bg-slate-900/50 border border-transparent cursor-pointer"
                      } ${delivery.priority === "urgent" ? "border-l-4 border-l-red-500" : ""}`}
                    >
                      <Checkbox
                        checked={selectedDeliveryIds.has(delivery.id)}
                        onCheckedChange={() => isScanned && toggleDeliverySelection(delivery.id)}
                        disabled={!isScanned}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white text-sm truncate">{delivery.addressText}</p>
                          {delivery.priority === "urgent" && (
                            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Urgent
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 mt-1">
                          {delivery.customerName && (
                            <p className="text-slate-500 text-xs">{delivery.customerName}</p>
                          )}
                          {delivery.rxNumber && (
                            <p className={`text-xs font-mono ${isScanned ? 'text-green-400' : 'text-slate-500'}`}>
                              RX: {delivery.rxNumber}
                              {isScanned && <Check className="h-3 w-3 inline ml-1" />}
                            </p>
                          )}
                        </div>
                      </div>
                      {isScanned ? (
                        <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                      ) : (
                        <QrCode className="h-4 w-4 text-slate-500 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
