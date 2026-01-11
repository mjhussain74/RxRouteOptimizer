import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Calendar, Filter, ChevronDown, CheckCircle, Clock, Truck, Pill, Package } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import jsPDF from "jspdf";

interface Prescription {
  id: number;
  deliveryId: number;
  rxNumber: string;
  patientName: string | null;
  patientPhone: string | null;
  notes: string | null;
  entryMethod: string;
  createdAt: string;
}

interface DeliveryWithPrescriptions {
  id: number;
  deliveryIdentifier: string | null;
  addressText: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  status: string;
  batchId: number | null;
  createdAt: string;
  prescriptions: Prescription[];
}

interface BatchWithDeliveries {
  batch: {
    id: number;
    name: string;
    status: string;
    totalDeliveries: number;
    createdAt: string;
  };
  deliveries: DeliveryWithPrescriptions[];
  prescriptions: Prescription[];
}

interface ReportGeneratorProps {
  pharmacyId?: number;
}

export default function ReportGenerator({ pharmacyId }: ReportGeneratorProps) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [reportType, setReportType] = useState<"routes" | "deliveries" | "prescriptions">("routes");

  const { data: batches = [] } = useQuery<any[]>({
    queryKey: ["/api/batches"],
  });

  const { data: routes = [] } = useQuery<any[]>({
    queryKey: ["/api/routes"],
  });

  const { data: drivers = [] } = useQuery<any[]>({
    queryKey: ["/api/drivers"],
  });

  const { data: selectedBatchData } = useQuery<BatchWithDeliveries>({
    queryKey: ["/api/batches", selectedBatchId],
    enabled: !!selectedBatchId,
  });

  const completedRoutes = routes.filter((r) => r.status === "complete" || r.status === "completed" || r.completedAt);
  const activeRoutes = routes.filter((r) => r.status === "dispatched" || r.status === "active");
  const totalDeliveries = batches.reduce((acc: number, b: any) => acc + (b.totalDeliveries || 0), 0);
  const totalPrescriptions = selectedBatchData?.prescriptions?.length || 0;

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

    if (reportType === "routes") {
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
    } else if (reportType === "deliveries" && selectedBatchData) {
      y += 20;
      doc.setFontSize(14);
      doc.text(`Delivery Details - ${selectedBatchData.batch.name}`, 20, y);
      y += 10;
      
      doc.setFontSize(9);
      selectedBatchData.deliveries.forEach((delivery, index: number) => {
        if (y > 260) {
          doc.addPage();
          y = 20;
        }
        const rxCount = delivery.prescriptions?.length || 0;
        doc.text(`${index + 1}. ${delivery.deliveryIdentifier || `DEL-${delivery.id}`}`, 20, y);
        y += 5;
        doc.text(`   Address: ${delivery.addressText}`, 20, y);
        y += 5;
        doc.text(`   Customer: ${delivery.customerName || "N/A"} | Status: ${delivery.status} | Rx Count: ${rxCount}`, 20, y);
        y += 5;
        if (rxCount > 0) {
          const rxNumbers = delivery.prescriptions.map(p => p.rxNumber).join(", ");
          doc.text(`   Rx Numbers: ${rxNumbers}`, 20, y);
          y += 5;
        }
        y += 3;
      });
    } else if (reportType === "prescriptions" && selectedBatchData) {
      y += 20;
      doc.setFontSize(14);
      doc.text(`Prescription Details - ${selectedBatchData.batch.name}`, 20, y);
      y += 10;
      
      doc.setFontSize(9);
      selectedBatchData.prescriptions.forEach((prescription, index: number) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const delivery = selectedBatchData.deliveries.find(d => d.id === prescription.deliveryId);
        doc.text(
          `${index + 1}. Rx: ${prescription.rxNumber} | Patient: ${prescription.patientName || "N/A"} | Delivery: ${delivery?.deliveryIdentifier || `DEL-${prescription.deliveryId}`}`,
          20,
          y
        );
        y += 6;
      });
    }
    
    doc.save(`${reportType}-report-${now.toISOString().split("T")[0]}.pdf`);
  };

  const generateCSVReport = () => {
    let csvContent = "";
    const now = new Date();
    
    if (reportType === "routes") {
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
      
      csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");
    } else if (reportType === "deliveries" && selectedBatchData) {
      const headers = ["Delivery ID", "Address", "City", "State", "Zip", "Customer Name", "Customer Phone", "Status", "Rx Count", "Rx Numbers", "Created At"];
      
      const rows = selectedBatchData.deliveries.map((delivery) => {
        const rxNumbers = delivery.prescriptions?.map(p => p.rxNumber).join("; ") || "";
        return [
          delivery.deliveryIdentifier || `DEL-${delivery.id}`,
          delivery.streetAddress || delivery.addressText,
          delivery.city || "",
          delivery.state || "",
          delivery.zipCode || "",
          delivery.customerName || "",
          delivery.customerPhone || "",
          delivery.status,
          delivery.prescriptions?.length || 0,
          rxNumbers,
          delivery.createdAt ? new Date(delivery.createdAt).toLocaleDateString() : "",
        ];
      });
      
      csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");
    } else if (reportType === "prescriptions" && selectedBatchData) {
      const headers = ["Rx Number", "Patient Name", "Patient Phone", "Delivery ID", "Delivery Address", "Entry Method", "Notes", "Created At"];
      
      const rows = selectedBatchData.prescriptions.map((prescription) => {
        const delivery = selectedBatchData.deliveries.find(d => d.id === prescription.deliveryId);
        return [
          prescription.rxNumber,
          prescription.patientName || "",
          prescription.patientPhone || "",
          delivery?.deliveryIdentifier || `DEL-${prescription.deliveryId}`,
          delivery?.addressText || "",
          prescription.entryMethod,
          prescription.notes || "",
          prescription.createdAt ? new Date(prescription.createdAt).toLocaleDateString() : "",
        ];
      });
      
      csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");
    }
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${reportType}-report-${now.toISOString().split("T")[0]}.csv`;
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

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                <Package className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">Total Batches</p>
                <p className="text-2xl font-bold text-white">{batches.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pink-500/20 rounded-lg">
                <Pill className="h-5 w-5 text-pink-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">Prescriptions (Selected)</p>
                <p className="text-2xl font-bold text-white">{totalPrescriptions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="border-b border-slate-700">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white">Report Configuration</CardTitle>
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
            
            <div className="flex items-center gap-4">
              <div>
                <Label className="text-slate-400 text-xs">Select Batch (for delivery/prescription reports)</Label>
                <select
                  value={selectedBatchId || ""}
                  onChange={(e) => setSelectedBatchId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-64 h-9 px-3 bg-slate-700 border border-slate-600 text-white rounded-md text-sm"
                >
                  <option value="">Select a batch...</option>
                  {batches.map((batch: any) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.name} ({batch.totalDeliveries} deliveries)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={reportType} onValueChange={(v) => setReportType(v as any)} className="w-full">
            <TabsList className="w-full bg-slate-700/50 rounded-none border-b border-slate-700">
              <TabsTrigger value="routes" className="flex-1 data-[state=active]:bg-slate-600">
                <Truck className="h-4 w-4 mr-2" />
                Routes
              </TabsTrigger>
              <TabsTrigger value="deliveries" className="flex-1 data-[state=active]:bg-slate-600">
                <Package className="h-4 w-4 mr-2" />
                Deliveries
              </TabsTrigger>
              <TabsTrigger value="prescriptions" className="flex-1 data-[state=active]:bg-slate-600">
                <Pill className="h-4 w-4 mr-2" />
                Prescriptions
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="routes" className="mt-0">
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
                                route.completedAt || route.status === "complete" || route.status === "completed"
                                  ? "bg-green-500/20 text-green-400"
                                  : route.status === "dispatched"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : route.status === "assigned"
                                  ? "bg-yellow-500/20 text-yellow-400"
                                  : "bg-slate-500/20 text-slate-400"
                              }`}>
                                {route.completedAt || route.status === "complete" ? "Complete" : route.status}
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
            </TabsContent>
            
            <TabsContent value="deliveries" className="mt-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Delivery ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Address</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Rx Count</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Rx Numbers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {!selectedBatchId ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          Please select a batch to view deliveries
                        </td>
                      </tr>
                    ) : !selectedBatchData?.deliveries?.length ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          No deliveries found in this batch
                        </td>
                      </tr>
                    ) : (
                      selectedBatchData.deliveries.slice(0, 20).map((delivery) => (
                        <tr key={delivery.id} className="hover:bg-slate-700/30">
                          <td className="px-4 py-3 text-sm text-white font-mono">
                            {delivery.deliveryIdentifier || `DEL-${delivery.id}`}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">
                            {delivery.streetAddress || delivery.addressText}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {delivery.customerName || "N/A"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded ${
                              delivery.status === "complete"
                                ? "bg-green-500/20 text-green-400"
                                : delivery.status === "active"
                                ? "bg-blue-500/20 text-blue-400"
                                : delivery.status === "cancelled"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-slate-500/20 text-slate-400"
                            }`}>
                              {delivery.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {delivery.prescriptions?.length || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400 font-mono max-w-xs truncate">
                            {delivery.prescriptions?.map(p => p.rxNumber).join(", ") || "N/A"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
            
            <TabsContent value="prescriptions" className="mt-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Rx Number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Patient</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Phone</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Delivery ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Entry Method</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {!selectedBatchId ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          Please select a batch to view prescriptions
                        </td>
                      </tr>
                    ) : !selectedBatchData?.prescriptions?.length ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          No prescriptions found in this batch
                        </td>
                      </tr>
                    ) : (
                      selectedBatchData.prescriptions.slice(0, 30).map((prescription) => {
                        const delivery = selectedBatchData.deliveries.find(d => d.id === prescription.deliveryId);
                        return (
                          <tr key={prescription.id} className="hover:bg-slate-700/30">
                            <td className="px-4 py-3 text-sm text-white font-mono">
                              {prescription.rxNumber}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-300">
                              {prescription.patientName || "N/A"}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-300">
                              {prescription.patientPhone || "N/A"}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-400 font-mono">
                              {delivery?.deliveryIdentifier || `DEL-${prescription.deliveryId}`}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded ${
                                prescription.entryMethod === "upload"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : prescription.entryMethod === "scan"
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-purple-500/20 text-purple-400"
                              }`}>
                                {prescription.entryMethod}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-400 max-w-xs truncate">
                              {prescription.notes || "-"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
