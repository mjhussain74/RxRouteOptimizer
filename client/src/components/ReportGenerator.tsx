import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Calendar, CheckCircle, Clock, Truck, Pill, Package, Image, PenTool, Eye, X, Building2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
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

interface RouteReportData {
  route: {
    id: number;
    name: string;
    status: string;
    startAddress: string;
    estimatedDistance: number;
    estimatedDuration: number;
    createdAt: string;
    dispatchedAt: string | null;
    completedAt: string | null;
  };
  driver: {
    id: number;
    name: string;
    phone: string;
  } | null;
  summary: {
    totalStops: number;
    completedStops: number;
    pendingStops: number;
    cancelledStops: number;
    stopsWithProof: number;
    totalPrescriptions: number;
    verifiedPrescriptions: number;
  };
  stops: Array<{
    id: number;
    sequence: number;
    status: string;
    priority: string;
    packageScanned: boolean;
    actualArrival: string | null;
    delivery: {
      id: number;
      deliveryIdentifier: string | null;
      addressText: string;
      customerName: string | null;
      customerPhone: string | null;
    } | null;
    prescriptions: Array<{
      id: number;
      rxNumber: string;
      patientName: string | null;
      verified: boolean;
    }>;
    proof: {
      hasSignature: boolean;
      hasPhoto: boolean;
      signatureData: string | null;
      photoData: string | null;
      notes: string | null;
      timestamp: string;
      barcode: string | null;
    } | null;
  }>;
}

interface OrderWithProof {
  id: number;
  deliveryIdentifier: string | null;
  addressText: string;
  customerName: string | null;
  customerPhone: string | null;
  status: string;
  batchId: number | null;
  createdAt: string;
  prescriptions: Prescription[];
  proof: {
    hasSignature: boolean;
    hasPhoto: boolean;
    signatureData: string | null;
    photoData: string | null;
    notes: string | null;
    barcode: string | null;
    timestamp: string;
  } | null;
  route: {
    routeId: number;
    routeName: string;
    routeStatus: string;
    driverName: string | null;
    completedAt: string | null;
  } | null;
}

interface ReportGeneratorProps {
  pharmacyId?: number;
  isAdmin?: boolean;
}

export default function ReportGenerator({ pharmacyId, isAdmin }: ReportGeneratorProps) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<number | null>(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [reportType, setReportType] = useState<"orders" | "routes" | "route-details" | "deliveries" | "prescriptions">("orders");
  const [proofDialog, setProofDialog] = useState<{ open: boolean; type: 'signature' | 'photo'; data: string | null }>({ open: false, type: 'signature', data: null });

  const { data: batches = [] } = useQuery<any[]>({
    queryKey: ["/api/batches"],
  });

  const { data: routes = [] } = useQuery<any[]>({
    queryKey: ["/api/routes"],
  });

  const { data: drivers = [] } = useQuery<any[]>({
    queryKey: ["/api/drivers"],
    enabled: isAdmin === true,
  });

  const { data: pharmacies = [] } = useQuery<any[]>({
    queryKey: ["/api/pharmacies"],
    enabled: isAdmin === true,
  });

  const { data: ordersData = [] } = useQuery<OrderWithProof[]>({
    queryKey: ["/api/reports/orders", selectedBatchId, orderStatusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedBatchId) params.append("batchId", selectedBatchId.toString());
      if (orderStatusFilter !== "all") params.append("status", orderStatusFilter);
      const res = await fetch(`/api/reports/orders?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });

  const { data: selectedBatchData } = useQuery<BatchWithDeliveries>({
    queryKey: ["/api/batches", selectedBatchId],
    enabled: !!selectedBatchId,
  });

  const { data: routeReportData } = useQuery<RouteReportData>({
    queryKey: [`/api/routes/${selectedRouteId}/report`],
    enabled: !!selectedRouteId && reportType === "route-details",
  });

  const getDriverName = (driverId: number | null) => {
    if (!driverId) return "Unassigned";
    if (isAdmin && drivers.length > 0) {
      const driver = drivers.find((d: any) => d.id === driverId);
      return driver?.name || `Driver #${driverId}`;
    }
    return `Driver #${driverId}`;
  };

  useEffect(() => {
    setSelectedRouteId(null);
    setSelectedBatchId(null);
  }, [selectedPharmacyId]);

  const filteredBatches = selectedPharmacyId
    ? batches.filter((b: any) => b.pharmacyId === selectedPharmacyId)
    : batches;

  const filteredBatchIds = new Set(filteredBatches.map((b: any) => b.id));
  const filteredRoutes = selectedPharmacyId
    ? routes.filter((r: any) => r.batchId && filteredBatchIds.has(r.batchId))
    : routes;

  const completedRoutes = filteredRoutes.filter((r) => r.status === "complete" || r.status === "completed" || r.completedAt);
  const activeRoutes = filteredRoutes.filter((r) => r.status === "dispatched" || r.status === "active");
  const totalDeliveries = filteredBatches.reduce((acc: number, b: any) => acc + (b.totalDeliveries || 0), 0);
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
    doc.text(`Total Batches: ${filteredBatches.length}`, 20, y);
    y += 8;
    doc.text(`Total Deliveries: ${totalDeliveries}`, 20, y);
    y += 8;
    doc.text(`Completed Routes: ${completedRoutes.length}`, 20, y);
    y += 8;
    doc.text(`Active Routes: ${activeRoutes.length}`, 20, y);

    if (reportType === "routes") {
      y += 20;
      doc.setFontSize(14);
      doc.text("Route Details", 20, y);
      y += 10;
      
      doc.setFontSize(9);
      filteredRoutes.slice(0, 15).forEach((route: any, index: number) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const driverName = getDriverName(route.driverId);
        const status = route.completedAt ? "Completed" : route.status;
        doc.text(
          `${index + 1}. ${route.name} - Driver: ${driverName} - Status: ${status}`,
          20,
          y
        );
        y += 6;
      });
    } else if (reportType === "route-details" && routeReportData) {
      y += 20;
      doc.setFontSize(14);
      doc.text(`Route: ${routeReportData.route.name}`, 20, y);
      y += 8;
      doc.setFontSize(10);
      doc.text(`Driver: ${routeReportData.driver?.name || "Unassigned"}`, 20, y);
      y += 6;
      doc.text(`Status: ${routeReportData.route.status}`, 20, y);
      y += 6;
      doc.text(`Completed: ${routeReportData.summary.completedStops}/${routeReportData.summary.totalStops} stops`, 20, y);
      y += 6;
      doc.text(`Proof Collected: ${routeReportData.summary.stopsWithProof}/${routeReportData.summary.totalStops}`, 20, y);
      y += 6;
      doc.text(`Rx Verified: ${routeReportData.summary.verifiedPrescriptions}/${routeReportData.summary.totalPrescriptions}`, 20, y);
      y += 15;
      
      doc.setFontSize(12);
      doc.text("Stop Details", 20, y);
      y += 10;
      
      doc.setFontSize(8);
      routeReportData.stops.forEach((stop, index: number) => {
        if (y > 260) {
          doc.addPage();
          y = 20;
        }
        const rxList = stop.prescriptions.map(p => `${p.rxNumber}${p.verified ? ' [V]' : ''}`).join(", ");
        const proofStatus = stop.proof ? `Sig:${stop.proof.hasSignature ? 'Y' : 'N'} Photo:${stop.proof.hasPhoto ? 'Y' : 'N'}` : "No Proof";
        
        doc.text(`${index + 1}. ${stop.delivery?.deliveryIdentifier || `Stop-${stop.id}`} - ${stop.status.toUpperCase()}`, 20, y);
        y += 5;
        doc.text(`   Address: ${stop.delivery?.addressText || "N/A"}`, 20, y);
        y += 5;
        doc.text(`   Customer: ${stop.delivery?.customerName || "N/A"} | ${proofStatus}`, 20, y);
        y += 5;
        if (rxList) {
          doc.text(`   Rx: ${rxList}`, 20, y);
          y += 5;
        }
        if (stop.proof?.timestamp) {
          doc.text(`   Completed: ${new Date(stop.proof.timestamp).toLocaleString()}`, 20, y);
          y += 5;
        }
        y += 3;
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
        doc.text(`${index + 1}. ${delivery.deliveryIdentifier || `DEL${delivery.id}`}`, 20, y);
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
          `${index + 1}. Rx: ${prescription.rxNumber} | Patient: ${prescription.patientName || "N/A"} | Delivery: ${delivery?.deliveryIdentifier || `DEL${prescription.deliveryId}`}`,
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
      
      const rows = filteredRoutes.map((route: any) => {
        return [
          route.name,
          getDriverName(route.driverId),
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
    } else if (reportType === "route-details" && routeReportData) {
      const headers = ["Sequence", "Delivery ID", "Address", "Customer", "Phone", "Status", "Rx Numbers", "Rx Verified", "Has Signature", "Has Photo", "Completed At", "Notes"];
      
      const rows = routeReportData.stops.map((stop) => {
        const rxNumbers = stop.prescriptions.map(p => p.rxNumber).join("; ");
        const verifiedCount = stop.prescriptions.filter(p => p.verified).length;
        return [
          stop.sequence,
          stop.delivery?.deliveryIdentifier || `Stop-${stop.id}`,
          stop.delivery?.addressText || "",
          stop.delivery?.customerName || "",
          stop.delivery?.customerPhone || "",
          stop.status,
          rxNumbers,
          `${verifiedCount}/${stop.prescriptions.length}`,
          stop.proof?.hasSignature ? "Yes" : "No",
          stop.proof?.hasPhoto ? "Yes" : "No",
          stop.proof?.timestamp ? new Date(stop.proof.timestamp).toLocaleString() : "",
          stop.proof?.notes || "",
        ];
      });
      
      csvContent = [
        `Route: ${routeReportData.route.name}`,
        `Driver: ${routeReportData.driver?.name || "Unassigned"}`,
        `Status: ${routeReportData.route.status}`,
        "",
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");
    } else if (reportType === "deliveries" && selectedBatchData) {
      const headers = ["Delivery ID", "Address", "City", "State", "Zip", "Customer Name", "Customer Phone", "Status", "Rx Count", "Rx Numbers", "Created At"];
      
      const rows = selectedBatchData.deliveries.map((delivery) => {
        const rxNumbers = delivery.prescriptions?.map(p => p.rxNumber).join("; ") || "";
        return [
          delivery.deliveryIdentifier || `DEL${delivery.id}`,
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
          delivery?.deliveryIdentifier || `DEL${prescription.deliveryId}`,
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

  const openProofDialog = (type: 'signature' | 'photo', data: string | null) => {
    setProofDialog({ open: true, type, data });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Delivery Reports</h2>
          <p className="text-slate-400">Generate and export delivery reports with proof of delivery</p>
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
                <p className="text-2xl font-bold text-white">{filteredBatches.length}</p>
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
            
            <div className="flex flex-wrap items-center gap-4">
              {isAdmin && (
                <div>
                  <Label className="text-slate-400 text-xs">Pharmacy</Label>
                  <select
                    value={selectedPharmacyId || ""}
                    onChange={(e) => setSelectedPharmacyId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-48 h-9 px-3 bg-slate-700 border border-slate-600 text-white rounded-md text-sm"
                  >
                    <option value="">All Pharmacies</option>
                    {pharmacies.map((pharmacy: any) => (
                      <option key={pharmacy.id} value={pharmacy.id}>
                        {pharmacy.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {reportType === "route-details" && (
                <div>
                  <Label className="text-slate-400 text-xs">Select Route</Label>
                  <select
                    value={selectedRouteId || ""}
                    onChange={(e) => setSelectedRouteId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-64 h-9 px-3 bg-slate-700 border border-slate-600 text-white rounded-md text-sm"
                  >
                    <option value="">Select a route...</option>
                    {filteredRoutes.map((route: any) => (
                      <option key={route.id} value={route.id}>
                        {route.name} ({route.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(reportType === "deliveries" || reportType === "prescriptions") && (
                <div>
                  <Label className="text-slate-400 text-xs">Select Batch</Label>
                  <select
                    value={selectedBatchId || ""}
                    onChange={(e) => setSelectedBatchId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-64 h-9 px-3 bg-slate-700 border border-slate-600 text-white rounded-md text-sm"
                  >
                    <option value="">Select a batch...</option>
                    {filteredBatches.map((batch: any) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.name} ({batch.totalDeliveries} deliveries)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={reportType} onValueChange={(v) => setReportType(v as any)} className="w-full">
            <TabsList className="w-full bg-slate-700/50 rounded-none border-b border-slate-700">
              <TabsTrigger value="orders" className="flex-1 data-[state=active]:bg-slate-600">
                <Package className="h-4 w-4 mr-2" />
                Orders
              </TabsTrigger>
              <TabsTrigger value="routes" className="flex-1 data-[state=active]:bg-slate-600">
                <Truck className="h-4 w-4 mr-2" />
                Routes
              </TabsTrigger>
              <TabsTrigger value="route-details" className="flex-1 data-[state=active]:bg-slate-600">
                <Eye className="h-4 w-4 mr-2" />
                Route Details
              </TabsTrigger>
              <TabsTrigger value="deliveries" className="flex-1 data-[state=active]:bg-slate-600">
                <FileText className="h-4 w-4 mr-2" />
                Batch Deliveries
              </TabsTrigger>
              <TabsTrigger value="prescriptions" className="flex-1 data-[state=active]:bg-slate-600">
                <Pill className="h-4 w-4 mr-2" />
                Prescriptions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="mt-0">
              <div className="p-4 border-b border-slate-700 flex gap-4 items-center">
                <div>
                  <Label className="text-slate-400 text-xs">Filter by Batch</Label>
                  <select
                    value={selectedBatchId || ""}
                    onChange={(e) => setSelectedBatchId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-48 h-9 px-3 bg-slate-700 border border-slate-600 text-white rounded-md text-sm"
                  >
                    <option value="">All Batches</option>
                    {filteredBatches.map((batch: any) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">Status</Label>
                  <select
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value)}
                    className="w-36 h-9 px-3 bg-slate-700 border border-slate-600 text-white rounded-md text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="geocoded">Geocoded</option>
                    <option value="active">Active</option>
                    <option value="complete">Complete</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="ml-auto text-sm text-slate-400">
                  Showing {ordersData.length} orders
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Order ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Address</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Rx Count</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Route</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Proof</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Completed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {ordersData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                          No orders found
                        </td>
                      </tr>
                    ) : (
                      ordersData.slice(0, 50).map((order) => (
                        <tr key={order.id} className="hover:bg-slate-700/30">
                          <td className="px-4 py-3 text-sm text-white font-mono">
                            {order.deliveryIdentifier || `DEL${order.id}`}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">
                            {order.addressText}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {order.customerName || "N/A"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded ${
                              order.status === "complete"
                                ? "bg-green-500/20 text-green-400"
                                : order.status === "active"
                                ? "bg-blue-500/20 text-blue-400"
                                : order.status === "cancelled"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-slate-500/20 text-slate-400"
                            }`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {order.prescriptions?.length || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400">
                            {order.route ? (
                              <span className="text-blue-400">{order.route.routeName}</span>
                            ) : (
                              <span className="text-slate-500">Not routed</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {order.proof ? (
                              <div className="flex gap-1">
                                {order.proof.hasSignature && (
                                  <button
                                    onClick={() => openProofDialog('signature', order.proof?.signatureData || null)}
                                    className="p-1 bg-green-500/20 rounded hover:bg-green-500/30"
                                    title="View Signature"
                                  >
                                    <PenTool className="h-3 w-3 text-green-400" />
                                  </button>
                                )}
                                {order.proof.hasPhoto && (
                                  <button
                                    onClick={() => openProofDialog('photo', order.proof?.photoData || null)}
                                    className="p-1 bg-blue-500/20 rounded hover:bg-blue-500/30"
                                    title="View Photo"
                                  >
                                    <Image className="h-3 w-3 text-blue-400" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">No proof</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400">
                            {order.route?.completedAt 
                              ? new Date(order.route.completedAt).toLocaleString()
                              : order.proof?.timestamp
                              ? new Date(order.proof.timestamp).toLocaleString()
                              : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
            
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {filteredRoutes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          No routes found
                        </td>
                      </tr>
                    ) : (
                      filteredRoutes.slice(0, 20).map((route: any) => {
                        return (
                          <tr key={route.id} className="hover:bg-slate-700/30">
                            <td className="px-4 py-3 text-sm text-white">{route.name}</td>
                            <td className="px-4 py-3 text-sm text-slate-300">
                              {getDriverName(route.driverId)}
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
                            <td className="px-4 py-3">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedRouteId(route.id);
                                  setReportType("route-details");
                                }}
                                className="text-blue-400 hover:text-blue-300"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Details
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="route-details" className="mt-0">
              {!selectedRouteId ? (
                <div className="px-4 py-12 text-center text-slate-400">
                  Please select a route to view detailed delivery information
                </div>
              ) : !routeReportData ? (
                <div className="px-4 py-12 text-center text-slate-400">
                  Loading route details...
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400">Driver</p>
                      <p className="text-white font-medium">{routeReportData.driver?.name || "Unassigned"}</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400">Stops Completed</p>
                      <p className="text-white font-medium">{routeReportData.summary.completedStops}/{routeReportData.summary.totalStops}</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400">Proof Collected</p>
                      <p className="text-white font-medium">{routeReportData.summary.stopsWithProof}/{routeReportData.summary.totalStops}</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400">Rx Verified</p>
                      <p className="text-white font-medium">{routeReportData.summary.verifiedPrescriptions}/{routeReportData.summary.totalPrescriptions}</p>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-700/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase">#</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase">Delivery</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase">Customer</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase">Rx Numbers</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase">Rx Verified</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase">Signature</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase">Photo</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase">Completed At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {routeReportData.stops.map((stop) => (
                          <tr key={stop.id} className="hover:bg-slate-700/30">
                            <td className="px-3 py-2 text-sm text-slate-400">{stop.sequence}</td>
                            <td className="px-3 py-2">
                              <div className="text-sm text-white font-mono">{stop.delivery?.deliveryIdentifier || `Stop-${stop.id}`}</div>
                              <div className="text-xs text-slate-400 truncate max-w-[200px]">{stop.delivery?.addressText}</div>
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-300">{stop.delivery?.customerName || "N/A"}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-2 py-1 rounded ${
                                stop.status === "complete" || stop.status === "completed"
                                  ? "bg-green-500/20 text-green-400"
                                  : stop.status === "cancelled"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-yellow-500/20 text-yellow-400"
                              }`}>
                                {stop.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-300 font-mono">
                              {stop.prescriptions.map(p => p.rxNumber).join(", ") || "N/A"}
                            </td>
                            <td className="px-3 py-2">
                              {stop.prescriptions.length > 0 ? (
                                <span className={`text-xs px-2 py-1 rounded ${
                                  stop.prescriptions.every(p => p.verified)
                                    ? "bg-green-500/20 text-green-400"
                                    : stop.prescriptions.some(p => p.verified)
                                    ? "bg-yellow-500/20 text-yellow-400"
                                    : "bg-red-500/20 text-red-400"
                                }`}>
                                  {stop.prescriptions.filter(p => p.verified).length}/{stop.prescriptions.length}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-500">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {stop.proof?.hasSignature ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openProofDialog('signature', stop.proof?.signatureData || null)}
                                  className="text-green-400 hover:text-green-300 p-1"
                                >
                                  <PenTool className="h-4 w-4" />
                                </Button>
                              ) : (
                                <X className="h-4 w-4 text-slate-500" />
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {stop.proof?.hasPhoto ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openProofDialog('photo', stop.proof?.photoData || null)}
                                  className="text-blue-400 hover:text-blue-300 p-1"
                                >
                                  <Image className="h-4 w-4" />
                                </Button>
                              ) : (
                                <X className="h-4 w-4 text-slate-500" />
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-400">
                              {stop.proof?.timestamp
                                ? new Date(stop.proof.timestamp).toLocaleString()
                                : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
                            {delivery.deliveryIdentifier || `DEL${delivery.id}`}
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
                              {delivery?.deliveryIdentifier || `DEL${prescription.deliveryId}`}
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

      <Dialog open={proofDialog.open} onOpenChange={(open) => setProofDialog({ ...proofDialog, open })}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              {proofDialog.type === 'signature' ? 'Delivery Signature' : 'Delivery Photo'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-center p-4">
            {proofDialog.data ? (
              <img
                src={proofDialog.data}
                alt={proofDialog.type === 'signature' ? 'Signature' : 'Photo'}
                className="max-w-full max-h-[60vh] rounded-lg border border-slate-600"
              />
            ) : (
              <div className="text-slate-400">No {proofDialog.type} available</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
