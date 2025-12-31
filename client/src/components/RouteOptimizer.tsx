import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Route, MapPin, Navigation, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

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
  const queryClient = useQueryClient();

  const { data: batchData, isLoading: batchLoading } = useQuery({
    queryKey: [`/api/batches/${selectedBatchId}`],
    enabled: !!selectedBatchId,
  });

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
      } else {
        console.error('Geocoding failed:', data);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleOptimize = () => {
    if (!selectedBatchId) return;

    optimizeMutation.mutate({
      batchId: selectedBatchId,
      startLat,
      startLng,
      startAddress: startAddress.trim() || "Starting Point",
      routeName: routeName.trim() || `Route ${new Date().toLocaleTimeString()}`,
    });
  };

  const deliveries = (batchData as any)?.deliveries || [];
  const geocodedCount = deliveries.filter((d: any) => d.lat && d.lng).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Optimize Routes</h2>
        <p className="text-slate-400">
          Select a batch and set your starting point to generate an optimized delivery route.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Route className="h-5 w-5 text-blue-400" />
              Route Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-300">Select Batch</Label>
              <Select
                value={selectedBatchId?.toString() || ""}
                onValueChange={(value) => onSelectBatch(parseInt(value))}
              >
                <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                  <SelectValue placeholder="Choose a batch..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {batches.map((batch: any) => (
                    <SelectItem
                      key={batch.id}
                      value={batch.id.toString()}
                      className="text-white hover:bg-slate-700"
                    >
                      {batch.name} ({batch.totalDeliveries} addresses)
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

            <Button
              onClick={handleOptimize}
              disabled={!selectedBatchId || geocodedCount === 0 || optimizeMutation.isPending}
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
                  Generate Optimized Route
                </>
              )}
            </Button>

            {optimizeMutation.isSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-400 mb-2">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Route Optimized!</span>
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

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-400" />
              Batch Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {batchLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            ) : selectedBatchId && batchData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <p className="text-slate-500 text-sm">Total Addresses</p>
                    <p className="text-2xl font-bold text-white">{deliveries.length}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <p className="text-slate-500 text-sm">Geocoded</p>
                    <p className="text-2xl font-bold text-green-400">{geocodedCount}</p>
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto space-y-2">
                  {deliveries.map((delivery: any, index: number) => (
                    <div
                      key={delivery.id}
                      className="flex items-start gap-3 bg-slate-900/30 rounded-lg p-3"
                    >
                      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        delivery.lat && delivery.lng ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{delivery.addressText}</p>
                        <div className="flex gap-2">
                          {delivery.customerName && (
                            <p className="text-slate-500 text-xs">{delivery.customerName}</p>
                          )}
                          {delivery.rxNumber && (
                            <p className="text-blue-400 text-xs font-mono">RX: {delivery.rxNumber}</p>
                          )}
                        </div>
                      </div>
                      {delivery.lat && delivery.lng ? (
                        <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                Select a batch to see details
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
