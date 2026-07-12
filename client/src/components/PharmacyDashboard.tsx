import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload, FileText, Building2, LogOut } from "lucide-react";
import { Button } from "./ui/button";
import OrderManagement from "./OrderManagement";
import ReportGenerator from "./ReportGenerator";

interface PharmacyDashboardProps {
  onLogout: () => void;
  pharmacyId: number | null;
  pharmacyName?: string;
}

type TabType = "orders" | "reports";

export default function PharmacyDashboard({
  onLogout,
  pharmacyId,
  pharmacyName,
}: PharmacyDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>("orders");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  const { data: batches = [] } = useQuery({
    queryKey: ["/api/batches", pharmacyId ? `pharmacy=${pharmacyId}` : ""],
  });

  const tabs = [
    { id: "orders" as TabType, label: "Orders", icon: Upload },
    { id: "reports" as TabType, label: "Reports", icon: FileText },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Building2 className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">
                  {pharmacyName || "Pharmacy Dashboard"}
                </h1>
                <p className="text-xs text-slate-400">
                  Delivery Management System
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium text-white">
                  {(batches as any[]).length} Batches
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
            pharmacyId={pharmacyId}
            isPharmacyUser={true}
            onBatchCreated={(batchId) => {
              setSelectedBatchId(batchId);
            }}
          />
        )}

        {activeTab === "reports" && (
          <ReportGenerator
            pharmacyId={pharmacyId || undefined}
            isAdmin={false}
          />
        )}
      </main>
    </div>
  );
}
