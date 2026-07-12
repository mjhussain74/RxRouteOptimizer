import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Upload,
  MapPin,
  Route,
  Users,
  Map,
  FileText,
  LogOut,
  Shield,
} from "lucide-react";
import { Button } from "./ui/button";
import RouteOptimizer from "./RouteOptimizer";
import RouteMap from "./RouteMap";
import DriverManager from "./DriverManager";
import OrderManagement from "./OrderManagement";
import ZoneManager from "./ZoneManager";
import ReportGenerator from "./ReportGenerator";

interface PharmacyAdminDashboardProps {
  onOpenDriverView: (driverId: number) => void;
  onLogout: () => void;
  pharmacyId: number | null;
  pharmacyName?: string;
}

type TabType =
  | "orders"
  | "optimize"
  | "routes"
  | "zones"
  | "drivers"
  | "reports";

export default function PharmacyAdminDashboard({
  onOpenDriverView,
  onLogout,
  pharmacyId,
  pharmacyName,
}: PharmacyAdminDashboardProps) {
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
    { id: "reports" as TabType, label: "Reports", icon: FileText },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Shield className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">
                  {pharmacyName || "Pharmacy"} Dashboard
                </h1>
                <p className="text-xs text-slate-400">Pharmacy Admin</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium text-white">
                  {(routes as any[]).length} Routes
                </div>
                <div className="text-xs text-slate-400">
                  {(drivers as any[]).length} Drivers
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="text-slate-400 hover:text-white"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
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
                    ? "bg-green-500 text-white shadow-lg shadow-green-500/20"
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
            isPharmacyUser={true}
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

        {activeTab === "zones" && <ZoneManager drivers={drivers as any[]} />}

        {activeTab === "drivers" && (
          <DriverManager
            drivers={drivers as any[]}
            onOpenDriverView={onOpenDriverView}
          />
        )}

        {activeTab === "reports" && <ReportGenerator isAdmin={false} />}
      </main>
    </div>
  );
}
