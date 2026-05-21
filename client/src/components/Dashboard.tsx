import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, MapPin, Truck, Route, Users, ChevronRight, Clock, Navigation, Building2, Map, FileText, BarChart3 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import BatchUpload from "./BatchUpload";
import RouteOptimizer from "./RouteOptimizer";
import RouteMap from "./RouteMap";
import DriverManager from "./DriverManager";
import OrderManagement from "./OrderManagement";
import ZoneManager from "./ZoneManager";
import ReportGenerator from "./ReportGenerator";
import AddressAnalytics from "./AddressAnalytics";

interface DashboardProps {
  onOpenDriverView: (driverId: number) => void;
}

type TabType = "orders" | "optimize" | "routes" | "drivers" | "zones" | "reports" | "analytics";

export default function Dashboard({ onOpenDriverView }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>("orders");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);

  const { data: batches = [] } = useQuery({
    queryKey: ["/api/batches"],
  });

  const { data: routes = [] } = useQuery({
    queryKey: ["/api/routes"],
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["/api/drivers"],
  });

  const tabs = [
    { id: "orders" as TabType, label: "Orders", icon: Upload },
    { id: "optimize" as TabType, label: "Optimize Routes", icon: Route },
    { id: "routes" as TabType, label: "View Routes", icon: MapPin },
    { id: "zones" as TabType, label: "Delivery Zones", icon: Map },
    { id: "drivers" as TabType, label: "Drivers", icon: Users },
    { id: "analytics" as TabType, label: "Address Analytics", icon: BarChart3 },
    { id: "reports" as TabType, label: "Reports", icon: FileText },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Truck className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">RxRouteOptimizer</h1>
                <p className="text-xs text-slate-400">Delivery Management System</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium text-white">
                  {(batches as any[]).length} Batches
                </div>
                <div className="text-xs text-slate-400">
                  {(routes as any[]).length} Routes Active
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-slate-800/30 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 py-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "orders" && (
          <OrderManagement
            batchId={selectedBatchId}
            onBatchCreated={(batchId) => {
              setSelectedBatchId(batchId);
              setActiveTab("optimize");
            }}
          />
        )}

        {activeTab === "optimize" && (
          <RouteOptimizer
            selectedBatchId={selectedBatchId}
            batches={batches as any[]}
            onSelectBatch={setSelectedBatchId}
            onRouteCreated={(routeId) => {
              setSelectedRouteId(routeId);
              setActiveTab("routes");
            }}
          />
        )}

        {activeTab === "routes" && (
          <RouteMap
            routes={routes as any[]}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            drivers={drivers as any[]}
            onOpenDriverView={onOpenDriverView}
          />
        )}

        {activeTab === "zones" && (
          <ZoneManager drivers={drivers as any[]} />
        )}

        {activeTab === "drivers" && (
          <DriverManager
            drivers={drivers as any[]}
            onOpenDriverView={onOpenDriverView}
          />
        )}

        {activeTab === "analytics" && <AddressAnalytics />}

        {activeTab === "reports" && (
          <ReportGenerator />
        )}
      </main>
    </div>
  );
}
