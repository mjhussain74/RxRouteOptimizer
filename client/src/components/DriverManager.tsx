import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Plus, Phone, MapPin, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

interface DriverManagerProps {
  drivers: any[];
  onOpenDriverView: (driverId: number) => void;
}

export default function DriverManager({ drivers, onOpenDriverView }: DriverManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  const queryClient = useQueryClient();

  const addDriverMutation = useMutation({
    mutationFn: async (data: { name: string; phone: string }) => {
      const response = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to add driver");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers"] });
      setIsAddDialogOpen(false);
      setNewDriverName("");
      setNewDriverPhone("");
    },
  });

  const handleAddDriver = () => {
    if (!newDriverName.trim()) return;
    addDriverMutation.mutate({
      name: newDriverName.trim(),
      phone: newDriverPhone.trim() || undefined,
    } as any);
  };

  const getDriverAppUrl = (driverId: number) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}?driver=${driverId}`;
  };

  const copyDriverLink = (driverId: number) => {
    const url = getDriverAppUrl(driverId);
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Driver Management</h2>
          <p className="text-slate-400">
            Manage your delivery drivers and access their mobile navigation apps.
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-500 hover:bg-blue-600">
              <Plus className="mr-2 h-4 w-4" />
              Add Driver
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-800 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">Add New Driver</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label className="text-slate-300">Driver Name</Label>
                <Input
                  placeholder="e.g., John Smith"
                  value={newDriverName}
                  onChange={(e) => setNewDriverName(e.target.value)}
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <div>
                <Label className="text-slate-300">Phone Number (optional)</Label>
                <Input
                  placeholder="e.g., 555-0123"
                  value={newDriverPhone}
                  onChange={(e) => setNewDriverPhone(e.target.value)}
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <Button
                onClick={handleAddDriver}
                disabled={!newDriverName.trim() || addDriverMutation.isPending}
                className="w-full bg-blue-500 hover:bg-blue-600"
              >
                {addDriverMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add Driver
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {drivers.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <User className="h-12 w-12 mx-auto text-slate-500 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Drivers Yet</h3>
            <p className="text-slate-400 mb-4">
              Add your first driver to start assigning routes.
            </p>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              className="bg-blue-500 hover:bg-blue-600"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Driver
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drivers.map((driver: any) => (
            <Card key={driver.id} className="bg-slate-800/50 border-slate-700">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <User className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium text-white truncate">{driver.name}</h3>
                    {driver.phone && (
                      <div className="flex items-center gap-1 text-slate-400 text-sm mt-1">
                        <Phone className="h-3 w-3" />
                        {driver.phone}
                      </div>
                    )}
                    <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs ${
                      driver.status === "delivering" ? "bg-green-500/20 text-green-400" :
                      driver.status === "available" ? "bg-blue-500/20 text-blue-400" :
                      "bg-slate-700 text-slate-400"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        driver.status === "delivering" ? "bg-green-400" :
                        driver.status === "available" ? "bg-blue-400" :
                        "bg-slate-400"
                      }`} />
                      {driver.status}
                    </div>
                  </div>
                </div>

                {driver.currentLat && driver.currentLng && (
                  <div className="mt-4 p-3 bg-slate-900/30 rounded-lg">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <MapPin className="h-4 w-4" />
                      <span>Last Location</span>
                    </div>
                    <p className="text-white text-sm mt-1">
                      {driver.currentLat.toFixed(4)}, {driver.currentLng.toFixed(4)}
                    </p>
                    {driver.lastLocationUpdate && (
                      <p className="text-slate-500 text-xs mt-1">
                        Updated {new Date(driver.lastLocationUpdate).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  <Button
                    onClick={() => onOpenDriverView(driver.id)}
                    className="w-full bg-blue-500 hover:bg-blue-600"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Driver App
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => copyDriverLink(driver.id)}
                    className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    Copy Mobile App Link
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Driver Mobile App</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-400">
            The driver app works as a Progressive Web App (PWA) on any smartphone. Drivers can:
          </p>
          <ul className="space-y-2 text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-blue-400">•</span>
              View assigned routes with turn-by-turn navigation
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400">•</span>
              Mark deliveries as complete in real-time
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400">•</span>
              Share live location with dispatchers
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400">•</span>
              Works offline with cached routes
            </li>
          </ul>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-blue-300 text-sm">
              <strong>Tip:</strong> Send drivers their personal app link. They can add it to their home screen for quick access.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
