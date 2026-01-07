import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Calendar, Filter, ChevronDown, CheckCircle, Clock, Truck } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import jsPDF from "jspdf";

interface ReportGeneratorProps {
  pharmacyId?: number;
}

export default function ReportGenerator({ pharmacyId }: ReportGeneratorProps) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  const { data: batches = [] } = useQuery<any[]>({
    queryKey: ["/api/batches"],
  });

  const { data: routes = [] } = useQuery<any[]>({
    queryKey: ["/api/routes"],
  });

  const { data: drivers = [] } = useQuery<any[]>({
    queryKey: ["/api/drivers"],
  });

  const completedRoutes = routes.filter((r) => r.status === "completed" || r.completedAt);
  const activeRoutes = routes.filter((r) => r.status === "dispatched" || r.status === "active");
  const totalDeliveries = batches.reduce((acc: number, b: any) => acc + (b.totalDeliveries || 0), 0);

  const generatePDFReport = () => {
    const doc = new jsPDF();
    const now = new Date();
    
    doc.setFontSize(20);
    doc.text("Delivery Report", 20, 20);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 20, 30);
    
    if (dateFrom || dateTo) {
      doc.text(`Date Range: ${dateFrom || "Start"} to ${dateTo || "Present"}`, 20, 36);
    }
    
    doc.setFontSize(14);
    doc.text("Summary", 20, 50);
    
    doc.setFontSize(11);
    let y = 60;
    doc.text(`Total Batches: ${batches.length}`, 20, y);
    y += 8;
    doc.text(`Total Deliveries: ${totalDeliveries}`, 20, y);
    y += 8;
    doc.text(`Completed Routes: ${completedRoutes.length}`, 20, y);
    y += 8;
    doc.text(`Active Routes: ${activeRoutes.length}`, 20, y);
    y += 8;
    doc.text(`Active Drivers: ${drivers.filter((d: any) => d.status !== "available").length}`, 20, y);
    
    y += 20;
    doc.setFontSize(14);
    doc.text("Route Details", 20, y);
    y += 10;
    
    doc.setFontSize(9);
    routes.slice(0, 15).forEach((route: any, index: number) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      const driver = drivers.find((d: any) => d.id === route.driverId);
      const status = route.completedAt ? "Completed" : route.status;
      doc.text(
        `${index + 1}. ${route.name} - Driver: ${driver?.name || "Unassigned"} - Status: ${status}`,
        20,
        y
      );
      y += 6;
    });
    
    doc.save(`delivery-report-${now.toISOString().split("T")[0]}.pdf`);
  };

  const generateCSVReport = () => {
    const headers = ["Route Name", "Driver", "Status", "Distance (km)", "Duration (min)", "Created At", "Dispatched At", "Completed At"];
    
    const rows = routes.map((route: any) => {
      const driver = drivers.find((d: any) => d.id === route.driverId);
      return [
        route.name,
        driver?.name || "Unassigned",
        route.status,
        route.estimatedDistance?.toFixed(2) || "0",
        route.estimatedDuration || "0",
        route.createdAt ? new Date(route.createdAt).toLocaleDateString() : "",
        route.dispatchedAt ? new Date(route.dispatchedAt).toLocaleDateString() : "",
        route.completedAt ? new Date(route.completedAt).toLocaleDateString() : "",
      ];
    });
    
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `delivery-report-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Delivery Reports</h2>
          <p className="text-slate-400">Generate and export delivery reports</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={generateCSVReport}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button
            onClick={generatePDFReport}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Truck className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">Total Deliveries</p>
                <p className="text-2xl font-bold text-white">{totalDeliveries}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">Completed Routes</p>
                <p className="text-2xl font-bold text-white">{completedRoutes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">Active Routes</p>
                <p className="text-2xl font-bold text-white">{activeRoutes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <FileText className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">Total Batches</p>
                <p className="text-2xl font-bold text-white">{batches.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="border-b border-slate-700">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Recent Deliveries</CardTitle>
            <div className="flex gap-4">
              <div>
                <Label className="text-slate-400 text-xs">From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white w-36 h-8"
                />
              </div>
              <div>
                <Label className="text-slate-400 text-xs">To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white w-36 h-8"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Route</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Distance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {routes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No routes found
                    </td>
                  </tr>
                ) : (
                  routes.slice(0, 10).map((route: any) => {
                    const driver = drivers.find((d: any) => d.id === route.driverId);
                    return (
                      <tr key={route.id} className="hover:bg-slate-700/30">
                        <td className="px-4 py-3 text-sm text-white">{route.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {driver?.name || "Unassigned"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded ${
                            route.completedAt || route.status === "completed"
                              ? "bg-green-500/20 text-green-400"
                              : route.status === "dispatched"
                              ? "bg-blue-500/20 text-blue-400"
                              : route.status === "assigned"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-slate-500/20 text-slate-400"
                          }`}>
                            {route.completedAt ? "Completed" : route.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {route.estimatedDistance?.toFixed(1) || 0} km
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">
                          {route.createdAt ? new Date(route.createdAt).toLocaleDateString() : "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
