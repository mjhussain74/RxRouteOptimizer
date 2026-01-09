import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileSpreadsheet,
  Camera,
  Edit,
  Trash2,
  Save,
  X,
  Plus,
  Search,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  AlertTriangle,
  Ban,
  Check,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import * as XLSX from "xlsx";

interface Delivery {
  id: number;
  batchId: number | null;
  pharmacyId: number | null;
  addressText: string;
  lat: number | null;
  lng: number | null;
  customerName: string | null;
  customerPhone: string | null;
  rxNumber: string | null;
  notes: string | null;
  priority: string | null;
  status: string;
  ocrConfidence: number | null;
  ocrVerified: boolean | null;
}

interface EditingDelivery extends Partial<Delivery> {
  id: number;
}

interface OrderManagementProps {
  batchId?: number | null;
  onBatchCreated?: (batchId: number) => void;
  onBatchSelected?: (batchId: number | null) => void;
}

export default function OrderManagement({
  batchId,
  onBatchCreated,
  onBatchSelected,
}: OrderManagementProps) {
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(
    batchId || null,
  );
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [editingDelivery, setEditingDelivery] =
    useState<EditingDelivery | null>(null);
  const [showOcrScanner, setShowOcrScanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddManual, setShowAddManual] = useState(false);
  const [newDelivery, setNewDelivery] = useState({
    addressText: "",
    customerName: "",
    customerPhone: "",
    rxNumber: "",
    notes: "",
  });
  const [confirmAction, setConfirmAction] = useState<{
    type: "complete" | "cancel" | "delete";
    batchId?: number;
    deliveryId?: number;
  } | null>(null);

  const { data: batches = [] } = useQuery<any[]>({
    queryKey: ["/api/batches"],
  });

  const activeBatchId = selectedBatchId || batchId;

  const { data: batchData } = useQuery({
    queryKey: [`/api/batches/${activeBatchId}`],
    enabled: !!activeBatchId,
  });

  const deliveries: Delivery[] = (batchData as any)?.deliveries || [];

  const handleBatchChange = (newBatchId: number | null) => {
    setSelectedBatchId(newBatchId);
    if (onBatchSelected) {
      onBatchSelected(newBatchId);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", `Upload ${new Date().toLocaleString()}`);

      const response = await fetch("/api/batches/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      if (onBatchCreated) {
        onBatchCreated(data.batch.id);
      }
      setIsUploading(false);
      setUploadProgress("");
    },
    onError: (error) => {
      console.error("Upload error:", error);
      setIsUploading(false);
      setUploadProgress("Upload failed. Please try again.");
    },
  });

  const updateDeliveryMutation = useMutation({
    mutationFn: async (delivery: EditingDelivery) => {
      const response = await fetch(`/api/deliveries/${delivery.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(delivery),
      });
      if (!response.ok) throw new Error("Update failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/batches/${activeBatchId}`],
      });
      setEditingDelivery(null);
    },
  });

  const deleteDeliveryMutation = useMutation({
    mutationFn: async (deliveryId: number) => {
      const response = await fetch(`/api/deliveries/${deliveryId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Delete failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/batches/${activeBatchId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
    },
  });

  const addDeliveryMutation = useMutation({
    mutationFn: async (delivery: typeof newDelivery) => {
      const response = await fetch(`/api/deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...delivery,
          batchId: activeBatchId,
          status: "pending",
          priority: "normal",
        }),
      });
      if (!response.ok) throw new Error("Failed to add order");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/batches/${activeBatchId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      setShowAddManual(false);
      setNewDelivery({
        addressText: "",
        customerName: "",
        customerPhone: "",
        rxNumber: "",
        notes: "",
      });
    },
  });

  const setPriorityMutation = useMutation({
    mutationFn: async ({
      deliveryId,
      priority,
    }: {
      deliveryId: number;
      priority: string;
    }) => {
      const response = await fetch(`/api/deliveries/${deliveryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (!response.ok) throw new Error("Failed to update priority");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/batches/${activeBatchId}`],
      });
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({
      deliveryId,
      status,
    }: {
      deliveryId: number;
      status: string;
    }) => {
      const response = await fetch(`/api/deliveries/${deliveryId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/batches/${activeBatchId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
    },
  });

  const setBatchStatusMutation = useMutation({
    mutationFn: async ({
      batchId,
      status,
    }: {
      batchId: number;
      status: string;
    }) => {
      const response = await fetch(`/api/batches/${batchId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update batch status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/batches/${activeBatchId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
    },
  });

  const handleFileUpload = useCallback(
    async (file: File) => {
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        setIsUploading(true);
        setUploadProgress("Processing Excel file...");

        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: "array" });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_csv(worksheet);

            const blob = new Blob([jsonData], { type: "text/csv" });
            const csvFile = new File(
              [blob],
              file.name.replace(/\.xlsx?$/, ".csv"),
              { type: "text/csv" },
            );

            uploadMutation.mutate(csvFile);
          } catch (error) {
            console.error("Excel parsing error:", error);
            setIsUploading(false);
            setUploadProgress("Failed to parse Excel file");
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (fileName.endsWith(".csv")) {
        setIsUploading(true);
        setUploadProgress("Uploading CSV file...");
        uploadMutation.mutate(file);
      } else {
        setUploadProgress(
          "Please upload a CSV or Excel file (.csv, .xlsx, .xls)",
        );
      }
    },
    [uploadMutation],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const filteredDeliveries = deliveries.filter((d) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      d.addressText?.toLowerCase().includes(query) ||
      d.customerName?.toLowerCase().includes(query) ||
      d.rxNumber?.toLowerCase().includes(query) ||
      d.customerPhone?.includes(query)
    );
  });

  const handleSaveEdit = () => {
    if (editingDelivery) {
      updateDeliveryMutation.mutate(editingDelivery);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Order Management</h2>
          <p className="text-slate-400">
            Upload orders via CSV/Excel or scan prescriptions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowOcrScanner(true)}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <Camera className="h-4 w-4 mr-2" />
            Scan RX Label
          </Button>
          <Button
            onClick={() => setShowAddManual(true)}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={!activeBatchId}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Order
          </Button>
        </div>
      </div>

      {(batches as any[]).length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Label className="text-slate-300 whitespace-nowrap">
                Select Batch:
              </Label>
              <select
                value={activeBatchId || ""}
                onChange={(e) =>
                  handleBatchChange(
                    e.target.value ? parseInt(e.target.value) : null,
                  )
                }
                className="flex-1 bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2"
              >
                <option value="">
                  -- Select a batch to view/edit orders --
                </option>
                {(batches as any[])
                  .filter(
                    (batch: any) =>
                      batch.status !== "complete" &&
                      batch.status !== "cancelled",
                  )
                  .map((batch: any) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.name} ({batch.totalDeliveries || 0} deliveries) -{" "}
                      {new Date(batch.createdAt).toLocaleDateString()}
                    </option>
                  ))}
              </select>
              {activeBatchId &&
                (() => {
                  const selectedBatch = (batches as any[]).find(
                    (b: any) => b.id === activeBatchId,
                  );
                  const batchStatus = selectedBatch?.status;
                  if (
                    batchStatus === "complete" ||
                    batchStatus === "cancelled"
                  ) {
                    return (
                      <span
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                          batchStatus === "complete"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {batchStatus === "complete" ? "Completed" : "Cancelled"}
                      </span>
                    );
                  }
                  return (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          setConfirmAction({
                            type: "complete",
                            batchId: activeBatchId,
                          })
                        }
                        disabled={setBatchStatusMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Complete Order
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setConfirmAction({
                            type: "cancel",
                            batchId: activeBatchId,
                          })
                        }
                        disabled={setBatchStatusMutation.isPending}
                        className="border-orange-500 text-orange-400 hover:bg-orange-500/10"
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Cancel Order
                      </Button>
                    </div>
                  );
                })()}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6">
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              isDragging
                ? "border-blue-500 bg-blue-500/10"
                : "border-slate-600 hover:border-slate-500"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />

            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-slate-700/50 rounded-full">
                <FileSpreadsheet className="h-12 w-12 text-blue-400" />
              </div>

              {isUploading ? (
                <div className="space-y-2">
                  <div className="animate-pulse text-blue-400 font-medium">
                    {uploadProgress || "Processing..."}
                  </div>
                  <div className="w-48 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 animate-pulse"
                      style={{ width: "60%" }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-lg font-medium text-white">
                      Drop your CSV or Excel file here
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                      or click to browse
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Supports .csv, .xlsx, .xls files with address,
                    customer_name, customer_phone, rx_number, notes columns
                  </p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {deliveries.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="border-b border-slate-700">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white">
                Uploaded Orders ({deliveries.length})
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search orders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-700 border-slate-600 text-white w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Priority
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      RX #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Notes
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredDeliveries.map((delivery) => (
                    <tr
                      key={delivery.id}
                      className={`hover:bg-slate-700/30 ${delivery.priority === "urgent" ? "bg-red-500/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setPriorityMutation.mutate({
                              deliveryId: delivery.id,
                              priority:
                                delivery.priority === "urgent"
                                  ? "normal"
                                  : "urgent",
                            })
                          }
                          disabled={setPriorityMutation.isPending}
                          className={`h-8 px-2 ${
                            delivery.priority === "urgent"
                              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                              : "bg-slate-600/50 text-slate-400 hover:bg-slate-600"
                          }`}
                          title={
                            delivery.priority === "urgent"
                              ? "Click to set Normal priority"
                              : "Click to set Urgent priority"
                          }
                        >
                          {delivery.priority === "urgent" ? (
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Urgent
                            </span>
                          ) : (
                            "Normal"
                          )}
                        </Button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {delivery.status === "complete" ? (
                            <CheckCircle className="h-4 w-4 text-green-400" />
                          ) : delivery.status === "cancelled" ? (
                            <Ban className="h-4 w-4 text-red-400" />
                          ) : delivery.lat && delivery.lng ? (
                            <CheckCircle className="h-4 w-4 text-blue-400" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-400" />
                          )}
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              delivery.status === "complete"
                                ? "bg-green-500/20 text-green-400"
                                : delivery.status === "cancelled"
                                  ? "bg-red-500/20 text-red-400"
                                  : delivery.status === "active"
                                    ? "bg-blue-500/20 text-blue-400"
                                    : delivery.status === "geocoded"
                                      ? "bg-emerald-500/20 text-emerald-400"
                                      : "bg-yellow-500/20 text-yellow-400"
                            }`}
                          >
                            {delivery.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-white font-mono">
                        {editingDelivery?.id === delivery.id ? (
                          <Input
                            value={editingDelivery.rxNumber || ""}
                            onChange={(e) =>
                              setEditingDelivery({
                                ...editingDelivery,
                                rxNumber: e.target.value,
                              })
                            }
                            className="h-8 bg-slate-700 border-slate-600 text-white"
                          />
                        ) : (
                          delivery.rxNumber || "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        {editingDelivery?.id === delivery.id ? (
                          <Input
                            value={editingDelivery.customerName || ""}
                            onChange={(e) =>
                              setEditingDelivery({
                                ...editingDelivery,
                                customerName: e.target.value,
                              })
                            }
                            className="h-8 bg-slate-700 border-slate-600 text-white"
                          />
                        ) : (
                          delivery.customerName || "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">
                        {editingDelivery?.id === delivery.id ? (
                          <Input
                            value={editingDelivery.addressText || ""}
                            onChange={(e) =>
                              setEditingDelivery({
                                ...editingDelivery,
                                addressText: e.target.value,
                              })
                            }
                            className="h-8 bg-slate-700 border-slate-600 text-white"
                          />
                        ) : (
                          delivery.addressText
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {editingDelivery?.id === delivery.id ? (
                          <Input
                            value={editingDelivery.customerPhone || ""}
                            onChange={(e) =>
                              setEditingDelivery({
                                ...editingDelivery,
                                customerPhone: e.target.value,
                              })
                            }
                            className="h-8 bg-slate-700 border-slate-600 text-white"
                          />
                        ) : (
                          delivery.customerPhone || "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400 max-w-xs truncate">
                        {editingDelivery?.id === delivery.id ? (
                          <Input
                            value={editingDelivery.notes || ""}
                            onChange={(e) =>
                              setEditingDelivery({
                                ...editingDelivery,
                                notes: e.target.value,
                              })
                            }
                            className="h-8 bg-slate-700 border-slate-600 text-white"
                          />
                        ) : (
                          delivery.notes || "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingDelivery?.id === delivery.id ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleSaveEdit}
                                className="h-8 w-8 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingDelivery(null)}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : delivery.status === "complete" ||
                            delivery.status === "cancelled" ? (
                            <span className="text-xs text-slate-500">
                              {delivery.status === "complete"
                                ? "Completed"
                                : "Cancelled"}
                            </span>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  if (confirm("Mark this order as complete?")) {
                                    setStatusMutation.mutate({
                                      deliveryId: delivery.id,
                                      status: "complete",
                                    });
                                  }
                                }}
                                className="h-8 w-8 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                title="Mark as Complete"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingDelivery(delivery)}
                                className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  if (confirm("Cancel this order?")) {
                                    setStatusMutation.mutate({
                                      deliveryId: delivery.id,
                                      status: "cancelled",
                                    });
                                  }
                                }}
                                className="h-8 w-8 p-0 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                                title="Cancel Order"
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  if (
                                    confirm("Delete this order permanently?")
                                  ) {
                                    deleteDeliveryMutation.mutate(delivery.id);
                                  }
                                }}
                                className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showAddManual} onOpenChange={setShowAddManual}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Add New Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Delivery Address *</Label>
              <Input
                value={newDelivery.addressText}
                onChange={(e) =>
                  setNewDelivery({
                    ...newDelivery,
                    addressText: e.target.value,
                  })
                }
                placeholder="123 Main St, City, State ZIP"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Customer Name</Label>
                <Input
                  value={newDelivery.customerName}
                  onChange={(e) =>
                    setNewDelivery({
                      ...newDelivery,
                      customerName: e.target.value,
                    })
                  }
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">
                  RX Number <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={newDelivery.rxNumber}
                  onChange={(e) =>
                    setNewDelivery({ ...newDelivery, rxNumber: e.target.value })
                  }
                  placeholder="Required"
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </div>
            <div>
              <Label className="text-slate-300">Phone Number</Label>
              <Input
                value={newDelivery.customerPhone}
                onChange={(e) =>
                  setNewDelivery({
                    ...newDelivery,
                    customerPhone: e.target.value,
                  })
                }
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300">Notes</Label>
              <Input
                value={newDelivery.notes}
                onChange={(e) =>
                  setNewDelivery({ ...newDelivery, notes: e.target.value })
                }
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <Button
              onClick={() => addDeliveryMutation.mutate(newDelivery)}
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={
                !newDelivery.addressText ||
                !newDelivery.rxNumber ||
                addDeliveryMutation.isPending
              }
            >
              {addDeliveryMutation.isPending ? "Adding..." : "Add Order"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showOcrScanner} onOpenChange={setShowOcrScanner}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Scan RX Label</DialogTitle>
          </DialogHeader>
          <OcrScanner
            onComplete={(data) => {
              setNewDelivery({
                addressText: data.address || "",
                customerName: data.patientName || "",
                customerPhone: "",
                rxNumber: data.rxNumber || "",
                notes: "",
              });
              setShowOcrScanner(false);
              setShowAddManual(true);
            }}
            onCancel={() => setShowOcrScanner(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {confirmAction?.type === "complete"
                ? "Complete Order Batch?"
                : confirmAction?.type === "cancel"
                  ? "Cancel Order Batch?"
                  : "Delete Delivery?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {confirmAction?.type === "complete"
                ? "This will mark the entire order batch as complete. All pending deliveries in this batch will be marked complete."
                : confirmAction?.type === "cancel"
                  ? "This will cancel the entire order batch. All pending deliveries in this batch will be cancelled."
                  : "This will permanently delete this delivery. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">
              Go Back
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (
                  confirmAction?.type === "complete" &&
                  confirmAction.batchId
                ) {
                  setBatchStatusMutation.mutate({
                    batchId: confirmAction.batchId,
                    status: "complete",
                  });
                } else if (
                  confirmAction?.type === "cancel" &&
                  confirmAction.batchId
                ) {
                  setBatchStatusMutation.mutate({
                    batchId: confirmAction.batchId,
                    status: "cancelled",
                  });
                } else if (
                  confirmAction?.type === "delete" &&
                  confirmAction.deliveryId
                ) {
                  deleteDeliveryMutation.mutate(confirmAction.deliveryId);
                }
                setConfirmAction(null);
              }}
              className={
                confirmAction?.type === "complete"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }
            >
              {confirmAction?.type === "complete"
                ? "Complete Batch"
                : confirmAction?.type === "cancel"
                  ? "Cancel Batch"
                  : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface OcrScannerProps {
  onComplete: (data: {
    rxNumber?: string;
    patientName?: string;
    address?: string;
  }) => void;
  onCancel: () => void;
}

function OcrScanner({ onComplete, onCancel }: OcrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState("");
  const [debugText, setDebugText] = useState("");

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch {
      setError("Unable to access camera.");
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  // OCR IMPROVEMENT: image preprocessing
  const preprocess = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      const bw = gray > 145 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = bw;
    }
    ctx.putImageData(img, 0, 0);
  };

  const captureAndProcess = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsProcessing(true);
    setError("");

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;

    // High-DPI capture
    const scale = 3;
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    ctx.scale(scale, scale);
    ctx.drawImage(video, 0, 0);

    preprocess(ctx, canvas.width, canvas.height);

    try {
      const Tesseract = await import("tesseract.js");
      const worker = await Tesseract.createWorker("eng");

      await worker.setParameters({
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#-/:,. ",
        preserve_interword_spaces: "1",
      });

      const result = await worker.recognize(canvas);
      await worker.terminate();

      const ocrData = result.data as any;
      const text = ocrData.text;
      setDebugText(text);

      // Filter high-confidence words if available
      const words = ocrData.words?.filter((w: any) => w.confidence > 70) || [];
      const cleanText = words.length > 0 
        ? words.map((w: any) => w.text).join(" ")
        : text;

      const rxMatch =
        cleanText.match(/RX\s*#?\s*(\d{6,})/i) ||
        cleanText.match(/\b(\d{7,})\b/);

      let patientName = "";
      const lines = ocrData.lines || text.split('\n').map((t: string) => ({ text: t }));
      for (const line of lines.map((l: any) => l.text.trim())) {
        if (/^(Patient|Name|PT)/i.test(line)) {
          patientName = line.replace(/^(Patient|Name|PT)[:\s]*/i, "").trim();
          break;
        }
      }

      let address = "";
      const addrLine = lines.find((l: any) =>
        /\d+\s+.*(Street|St|Avenue|Ave|Road|Rd|Blvd|Drive|Dr|Lane|Ln)/i.test(
          l.text,
        ),
      );
      if (addrLine) address = addrLine.text.trim();

      onComplete({
        rxNumber: rxMatch?.[1] || "",
        patientName,
        address,
      });
    } catch {
      setError("OCR failed. Please retry with better lighting.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <div className="text-red-500">{error}</div>}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cameraActive ? "block w-full rounded" : "hidden"}
      />

      <canvas ref={canvasRef} className="hidden" />

      {!cameraActive && (
        <Button onClick={startCamera}>
          <Camera className="mr-2 h-4 w-4" />
          Start Camera
        </Button>
      )}

      {debugText && (
        <pre className="bg-slate-800 text-xs p-2 max-h-32 overflow-y-auto text-white">
          {debugText}
        </pre>
      )}

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => {
            stopCamera();
            onCancel();
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={captureAndProcess}
          disabled={!cameraActive || isProcessing}
        >
          {isProcessing ? "Processing…" : "Capture & Process"}
        </Button>
      </div>
    </div>
  );
}
