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

interface DeliveryOrder {
  id: number;
  rxNumber: string;
  pharmacyId: number;
  batchId: number | null;
  fillDate: string | null;
  deliveryStatus: string;
  routeId: number | null;
  addressText: string;
  normalizedAddressHash: string | null;
  lat: number | null;
  lng: number | null;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  priority: string | null;
  uploadCount: number;
  lastSeenAt: string;
  scannedAt: string | null;
  createdAt: string;
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
  const [endAddress, setEndAddress] = useState("");
  const [endLat, setEndLat] = useState<number | null>(null);
  const [endLng, setEndLng] = useState<number | null>(null);
  const [routeName, setRouteName] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isGeocodingEnd, setIsGeocodingEnd] = useState(false);
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

  const { data: eligibleOrders = [], isLoading: deliveriesLoading } = useQuery<DeliveryOrder[]>({
    queryKey: ["/api/delivery-orders/eligible"],
    queryFn: async () => {
      const res = await fetch("/api/delivery-orders/eligible", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch eligible orders");
      return res.json();
    },
  });

  // Group orders by address for visual consolidation
  interface AddressGroup {
    address: string;
    customerName: string | null;
    orders: DeliveryOrder[];
    hasUrgent: boolean;
    totalUploads: number;
  }

  const addressGroups = useMemo(() => {
    const groups = new Map<string, AddressGroup>();
    for (const order of eligibleOrders) {
      const key = order.normalizedAddressHash || order.addressText?.toLowerCase().trim() || `order-${order.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          address: order.addressText,
          customerName: order.customerName,
          orders: [],
          hasUrgent: false,
          totalUploads: 0,
        });
      }
      const group = groups.get(key)!;
      group.orders.push(order);
      if (order.priority === "urgent") group.hasUrgent = true;
      group.totalUploads += order.uploadCount;
    }
    return Array.from(groups.values());
  }, [eligibleOrders]);

  const filteredGroups = useMemo(() => {
    let groups = addressGroups;

    if (selectedZoneId) {
      const zone = zones.find(z => z.id === selectedZoneId);
      if (zone) {
        groups = groups.filter(g => {
          const order = g.orders[0];
          if (!order?.lat || !order?.lng) return false;
          const R = 6371000;
          const dLat = (order.lat - zone.centerLat) * Math.PI / 180;
          const dLng = (order.lng - zone.centerLng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(zone.centerLat * Math.PI / 180) * Math.cos(order.lat * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
          const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return distance <= zone.radiusMeters;
        });
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      groups = groups.filter(g => (
        g.address?.toLowerCase().includes(query) ||
        g.customerName?.toLowerCase().includes(query) ||
        g.orders.some(o => o.rxNumber?.toLowerCase().includes(query))
      ));
    }

    return groups;
  }, [addressGroups, searchQuery, selectedZoneId, zones]);

  const urgentCount = useMemo(() => {
    return Array.from(selectedDeliveryIds).filter(id => {
      const order = eligibleOrders.find(d => d.id === id);
      return order?.priority === "urgent";
    }).length;
  }, [selectedDeliveryIds, eligibleOrders]);

  useEffect(() => {
    if (lastScannedRx) {
      const matchingOrder = eligibleOrders.find(d =>
        d.rxNumber?.toLowerCase() === lastScannedRx.toLowerCase()
      );
      
      if (matchingOrder) {
        setSelectedDeliveryIds(prev => new Set([...prev, matchingOrder.id]));
        setScanError(null);
      } else {
        setScanError(`RX ${lastScannedRx} not found in eligible orders`);
      }
      setLastScannedRx(null);
    }
  }, [lastScannedRx, eligibleOrders]);

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
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to optimize route");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders/eligible"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
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
        { method: "GET", credentials: "include" }
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

  const handleGeocodeEnd = async () => {
    if (!endAddress.trim()) return;
    
    setIsGeocodingEnd(true);
    try {
      const response = await fetch(
        `/api/geocode?address=${encodeURIComponent(endAddress)}`,
        { method: "GET", credentials: "include" }
      );
      const data = await response.json();
      if (data && data.lat !== undefined && data.lng !== undefined) {
        setEndLat(data.lat);
        setEndLng(data.lng);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsGeocodingEnd(false);
    }
  };

  const handleOptimize = () => {
    if (selectedDeliveryIds.size === 0) return;

    const payload: any = {
      orderIds: Array.from(selectedDeliveryIds),
      zoneId: selectedZoneId,
      startLat,
      startLng,
      startAddress: startAddress.trim() || "Starting Point",
      routeName: routeName.trim() || `Route ${new Date().toLocaleTimeString()}`,
    };

    if (endAddress.trim() && endLat !== null && endLng !== null) {
      payload.endLat = endLat;
      payload.endLng = endLng;
      payload.endAddress = endAddress.trim();
    }

    optimizeMutation.mutate(payload);
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
    filteredGroups.forEach(g => g.orders.forEach(o => newSet.add(o.id)));
    setSelectedDeliveryIds(newSet);
  };

  const toggleGroupSelection = (group: AddressGroup) => {
    const groupIds = group.orders.map(o => o.id);
    const allSelected = groupIds.every(id => selectedDeliveryIds.has(id));
    const newSet = new Set(selectedDeliveryIds);
    if (allSelected) {
      groupIds.forEach(id => newSet.delete(id));
    } else {
      groupIds.forEach(id => newSet.add(id));
    }
    setSelectedDeliveryIds(newSet);
  };

  const isGroupSelected = (group: AddressGroup) => {
    return group.orders.every(o => selectedDeliveryIds.has(o.id));
  };

  const isGroupPartiallySelected = (group: AddressGroup) => {
    return group.orders.some(o => selectedDeliveryIds.has(o.id)) && !isGroupSelected(group);
  };

  const isOrderScanned = (order: DeliveryOrder) => {
    return scannedRxNumbers.has(order.rxNumber);
  };

  const getAllRxNumbers = (order: DeliveryOrder): string[] => {
    return [order.rxNumber];
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

      {/* Temporarily commented out - Scan RX Barcodes section
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
      */}

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

            <div>
              <Label className="text-slate-300">Route End Address (optional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., 456 Return St, New York, NY"
                  value={endAddress}
                  onChange={(e) => setEndAddress(e.target.value)}
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                />
                <Button
                  variant="outline"
                  onClick={handleGeocodeEnd}
                  disabled={!endAddress || isGeocodingEnd}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  {isGeocodingEnd ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Navigation className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {endLat !== null && endLng !== null && (
                <p className="text-slate-500 text-xs mt-1">
                  End coordinates: {endLat.toFixed(4)}, {endLng.toFixed(4)}
                </p>
              )}
              <p className="text-slate-500 text-xs mt-1">
                Last delivery will be optimized to end at this location
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
                Route-Eligible Orders ({eligibleOrders.length} RXs, {addressGroups.length} stops)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllVisible}
                  disabled={filteredGroups.length === 0}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Select All
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
            ) : filteredGroups.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                {eligibleOrders.length === 0 
                  ? "No route-eligible orders. Scan barcodes in Orders tab to make them eligible."
                  : "No orders match your search."}
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto space-y-2">
                {filteredGroups.map((group) => {
                  const selected = isGroupSelected(group);
                  const partial = isGroupPartiallySelected(group);
                  const groupKey = group.orders[0]?.normalizedAddressHash || group.address || `group-${group.orders[0]?.id}`;
                  return (
                    <div
                      key={groupKey}
                      onClick={() => toggleGroupSelection(group)}
                      className={`flex items-start gap-3 rounded-lg p-3 transition-colors cursor-pointer ${
                        selected
                          ? "bg-blue-500/20 border border-blue-500/50"
                          : partial
                            ? "bg-blue-500/10 border border-blue-500/30"
                            : "bg-slate-900/30 hover:bg-slate-900/50 border border-transparent"
                      } ${group.hasUrgent ? "border-l-4 border-l-red-500" : ""}`}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleGroupSelection(group)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white text-sm truncate">{group.address}</p>
                          {group.orders.length > 1 && (
                            <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-medium">
                              {group.orders.length} RXs
                            </span>
                          )}
                          {group.hasUrgent && (
                            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Urgent
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {group.customerName && (
                            <p className="text-slate-500 text-xs">{group.customerName}</p>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {group.orders.map(o => (
                              <span key={o.id} className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                                {o.rxNumber}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
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
