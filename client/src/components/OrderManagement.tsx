import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileSpreadsheet,
  Search,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  AlertTriangle,
  Ban,
  Check,
  Download,
  Printer,
  Eye,
  Plus,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
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
import JsBarcode from "jsbarcode";

interface DeliveryOrder {
  id: number;
  rxNumber: string;
  pharmacyId: number;
  batchId: number | null;
  fillDate: string | null;
  deliveryIdentifier: string | null;
  deliveryStatus: string;
  routeId: number | null;
  addressText: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
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

interface OrderManagementProps {
  batchId?: number | null;
  pharmacyId?: number | null;
  onBatchCreated?: (batchId: number) => void;
  onBatchSelected?: (batchId: number | null) => void;
}

const STATUS_COLORS: Record<
  string,
  { bg: string; text: string; icon: React.ReactNode }
> = {
  IMPORTED: {
    bg: "bg-yellow-500/20",
    text: "text-yellow-400",
    icon: <AlertCircle className="h-4 w-4 text-yellow-400" />,
  },
  ROUTE_ELIGIBLE: {
    bg: "bg-green-500/20",
    text: "text-green-400",
    icon: <CheckCircle className="h-4 w-4 text-green-400" />,
  },
  ROUTED: {
    bg: "bg-blue-500/20",
    text: "text-blue-400",
    icon: <CheckCircle className="h-4 w-4 text-blue-400" />,
  },
  DELIVERED: {
    bg: "bg-purple-500/20",
    text: "text-purple-400",
    icon: <CheckCircle className="h-4 w-4 text-purple-400" />,
  },
  CANCELLED: {
    bg: "bg-red-500/20",
    text: "text-red-400",
    icon: <Ban className="h-4 w-4 text-red-400" />,
  },
};

export default function OrderManagement({
  batchId,
  pharmacyId,
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
  const [uploadResult, setUploadResult] = useState<{
    newOrderCount: number;
    updatedOrderCount: number;
    totalRows: number;
    skippedCount: number;
    skippedReasons: string[];
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scanMessage, setScanMessage] = useState<{
    text: string;
    type: "success" | "warning" | "error";
  } | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "complete" | "cancel";
    batchId?: number;
  } | null>(null);
  const [showAddOrderDialog, setShowAddOrderDialog] = useState(false);
  const [addressGroupDialog, setAddressGroupDialog] = useState<{
    scannedOrder: DeliveryOrder;
    groupedOrders: DeliveryOrder[];
    address: string;
    customerName: string | null;
    selectedIds: Set<number>;
  } | null>(null);
  const [newOrderRx, setNewOrderRx] = useState("");
  const [newOrderAddress, setNewOrderAddress] = useState("");
  const [newOrderCustomerName, setNewOrderCustomerName] = useState("");
  const [newOrderCustomerPhone, setNewOrderCustomerPhone] = useState("");
  const [newOrderNotes, setNewOrderNotes] = useState("");
  // Inline error shown inside the Add Missing Prescription dialog itself
  // so it doesn't bleed into the shared scan message banner
  const [createOrderError, setCreateOrderError] = useState<string | null>(null);
  // Tracks the auto-clear timeout for scanMessage so we can cancel it
  // when a new message arrives — prevents old timeouts wiping newer messages
  const scanMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const { data: batches = [] } = useQuery<any[]>({
    queryKey: ["/api/batches"],
  });

  const activeBatchId = selectedBatchId || batchId;

  const { data: orders = [] } = useQuery<DeliveryOrder[]>({
    queryKey: activeBatchId
      ? [`/api/delivery-orders/by-batch/${activeBatchId}`]
      : ["/api/delivery-orders"],
    enabled: true,
  });

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
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      if (activeBatchId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/delivery-orders/by-batch/${activeBatchId}`],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
      if (onBatchCreated && data.batch) {
        onBatchCreated(data.batch.id);
      }
      if (data.batch) {
        setSelectedBatchId(data.batch.id);
      }
      setUploadResult({
        newOrderCount: data.newOrderCount || 0,
        updatedOrderCount: data.updatedOrderCount || 0,
        totalRows: data.totalRows || 0,
        skippedCount: data.skippedCount || 0,
        skippedReasons: data.skippedReasons || [],
      });
      setIsUploading(false);
      setUploadProgress("");
    },
    onError: (error) => {
      console.error("Upload error:", error);
      setIsUploading(false);
      setUploadProgress("Upload failed. Please try again.");
    },
  });

  const lastScannedBarcodeRef = useRef<string>("");

  const scanBarcodeMutation = useMutation({
    mutationFn: async (barcode: string) => {
      lastScannedBarcodeRef.current = barcode;
      const response = await fetch("/api/delivery-orders/scan-barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode }),
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response
          .json()
          .catch(() => ({ error: "Scan failed" }));
        throw new Error(err.error || "Scan failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.requiresConfirmation) {
        setAddressGroupDialog({
          scannedOrder: data.scannedOrder,
          groupedOrders: data.groupedOrders,
          address: data.address,
          customerName: data.customerName,
          selectedIds: new Set(
            data.groupedOrders.map((o: DeliveryOrder) => o.id),
          ),
        });
        return;
      }

      if (activeBatchId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/delivery-orders/by-batch/${activeBatchId}`],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });

      if (data.alreadyProcessed) {
        setScanMessageWithTimer({
          text: data.message || "Already scanned",
          type: "warning",
        });
      } else {
        setScanMessageWithTimer({
          text: data.message || "Scanned successfully - marked ROUTE_ELIGIBLE",
          type: "success",
        });
      }
    },
    onError: (error: Error) => {
      const scannedRx = lastScannedBarcodeRef.current.replace(/[^0-9]+$/, "");
      setNewOrderRx(scannedRx);
      setCreateOrderError(null);
      // Clear the "no order found" error banner before opening the dialog
      // so it doesn't show behind/after the dialog and confuse the user
      setScanMessageWithTimer(null);
      setShowAddOrderDialog(true);
    },
  });

  const confirmGroupMutation = useMutation({
    mutationFn: async ({
      barcode,
      orderIds,
    }: {
      barcode: string;
      orderIds: number[];
    }) => {
      const response = await fetch("/api/delivery-orders/scan-barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode, confirmOrderIds: orderIds }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to confirm orders");
      return response.json();
    },
    onSuccess: (data) => {
      setAddressGroupDialog(null);
      if (activeBatchId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/delivery-orders/by-batch/${activeBatchId}`],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
      setScanMessageWithTimer({
        text:
          data.message ||
          `${data.updatedCount} prescription(s) marked as route-eligible`,
        type: "success",
      });
    },
    onError: () => {
      setScanMessageWithTimer({
        text: "Failed to confirm delivery group",
        type: "error",
      });
    },
  });

  const resetNewOrderForm = () => {
    setNewOrderRx("");
    setNewOrderAddress("");
    setNewOrderCustomerName("");
    setNewOrderCustomerPhone("");
    setNewOrderNotes("");
    setCreateOrderError(null);
  };

  // Always cancel any pending auto-clear before setting a new scan message,
  // so old timeouts don't overwrite newer messages or clear success toasts early
  const setScanMessageWithTimer = (
    msg: { text: string; type: "success" | "warning" | "error" } | null,
    durationMs = 5000,
  ) => {
    if (scanMessageTimerRef.current) clearTimeout(scanMessageTimerRef.current);
    setScanMessage(msg);
    if (msg) {
      scanMessageTimerRef.current = setTimeout(() => {
        setScanMessage(null);
        scanMessageTimerRef.current = null;
      }, durationMs);
    }
  };

  const createOrderMutation = useMutation({
    mutationFn: async (data: {
      rxNumber: string;
      addressText: string;
      customerName: string;
      customerPhone: string;
      notes: string;
    }) => {
      const response = await fetch("/api/delivery-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response
          .json()
          .catch(() => ({ error: "Failed to create order" }));
        throw new Error(err.error || "Failed to create order");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (activeBatchId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/delivery-orders/by-batch/${activeBatchId}`],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
      setShowAddOrderDialog(false);
      resetNewOrderForm();
      // Clear any lingering scan error banner before showing success
      const msg = data.geocodeWarning
        ? `Order created for RX ${data.rxNumber} — address needs correction before routing`
        : `Order created for RX ${data.rxNumber} — marked as ROUTE_ELIGIBLE`;
      setScanMessageWithTimer(
        { text: msg, type: data.geocodeWarning ? "warning" : "success" },
        6000,
      );
    },
    onError: (error: Error) => {
      // Show error inside the dialog itself rather than the shared banner —
      // this prevents it from being overwritten by the scan error timeout
      setCreateOrderError(error.message);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      orderId,
      status,
    }: {
      orderId: number;
      status: string;
    }) => {
      const response = await fetch(`/api/delivery-orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onSuccess: () => {
      if (activeBatchId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/delivery-orders/by-batch/${activeBatchId}`],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
    },
  });

  const markScanMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const response = await fetch(`/api/delivery-orders/${orderId}/scan`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to mark as scanned");
      return response.json();
    },
    onSuccess: () => {
      if (activeBatchId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/delivery-orders/by-batch/${activeBatchId}`],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const response = await fetch(`/api/delivery-orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to cancel order");
      return response.json();
    },
    onSuccess: () => {
      if (activeBatchId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/delivery-orders/by-batch/${activeBatchId}`],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/delivery-orders/eligible"],
      });
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
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to update batch status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      if (activeBatchId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/delivery-orders/by-batch/${activeBatchId}`],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/delivery-orders/eligible"],
      });
    },
  });

  const handleFileUpload = useCallback(
    async (file: File) => {
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        setIsUploading(true);
        setUploadProgress("Processing Excel file...");
        setUploadResult(null);

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
        setUploadResult(null);
        uploadMutation.mutate(file);
      } else {
        setUploadProgress(
          "Please upload a CSV or Excel file (.csv, .xlsx, .xls)",
        );
      }
    },
    [uploadMutation],
  );

  const canPrintLabel = (order: DeliveryOrder) => {
    return (
      order.deliveryIdentifier &&
      (order.deliveryStatus === "ROUTE_ELIGIBLE" ||
        order.deliveryStatus === "ROUTED" ||
        order.deliveryStatus === "DELIVERED")
    );
  };

  const printDeliveryLabel = (
    order: DeliveryOrder,
    pharmacyName: string = "RX Delivery Pharmacy",
  ) => {
    if (!canPrintLabel(order)) return;
    const today = new Date().toLocaleDateString();
    const labelId =
      order.deliveryIdentifier || order.rxNumber || `ORD-${order.id}`;

    const canvas = document.createElement("canvas");
    try {
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext("2d");
      const logicalWidth = 400;
      const logicalHeight = 120;
      canvas.width = logicalWidth * dpr;
      canvas.height = logicalHeight * dpr;
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      JsBarcode(canvas, labelId, {
        format: "CODE128",
        width: 3,
        height: 80,
        displayValue: false,
        margin: 20,
        background: "#ffffff",
        lineColor: "#000000",
        flat: true,
      });
    } catch (err) {
      console.error("Barcode generation error:", err);
    }
    const barcodeDataUrl = canvas.toDataURL("image/png");

    const labelHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Delivery Label - ${labelId}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @media print {
            @page { size: 62mm 50mm; margin: 0; }
            html, body { width: 62mm; min-width: 62mm; max-width: 62mm; margin: 0; padding: 0; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { display: block; }
          }
          body { font-family: Arial, sans-serif; }
          .label { width: 58mm; height: 50mm; padding-left: 3.4mm; box-sizing: border-box; overflow: hidden; }
          .label-container { width: 62mm; height: 50mm; padding-left: 4mm; overflow: hidden; }
          .header-row { border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 2px; overflow: hidden; }
          .pharmacy-name { font-size: 8px; font-weight: bold; float: left; }
          .date { font-size: 7px; color: #666; float: right; }
          .delivery-id { font-size: 10px; font-weight: bold; text-align: center; background: #f0f0f0; padding: 2px 3px; border-radius: 2px; margin-bottom: 2px; clear: both; }
          .barcode-container { text-align: center; margin-bottom: 2mm; }
          .barcode-container img { width: 100%; height: 8mm; object-fit: contain; }
          .field { margin-bottom: 2px; }
          .field-label { font-size: 6px; color: #666; text-transform: uppercase; }
          .field-value { font-size: 8px; font-weight: 500; line-height: 1.1; }
          .address { font-size: 8px; line-height: 1.1; }
          .phone-box { font-size: 9px; font-weight: bold; background: #e8f0f8; padding: 2px; border-radius: 2px; text-align: center; border: 1px solid #ccc; margin-top: 2px; }
          .phone-box .field-label { font-size: 6px; display: block; }
        </style>
      </head>
      <body>
        <div class="label-container">
          <div class="header-row">
            <div class="pharmacy-name">${pharmacyName}</div>
            <div class="date">${today}</div>
          </div>
          <div class="delivery-id">${labelId}</div>
          <div class="barcode-container">
            <img src="${barcodeDataUrl}" alt="Barcode: ${labelId}" />
          </div>
          <div class="field">
            <div class="field-label">Deliver To</div>
            <div class="field-value address">${order.addressText}</div>
          </div>
          <div class="field">
            <div class="field-label">Customer</div>
            <div class="field-value">${order.customerName || "N/A"}</div>
          </div>
          ${order.notes ? `<div class="field"><div class="field-label">Notes</div><div class="field-value">${order.notes}</div></div>` : ""}
          <div class="phone-box">
            <div class="field-label">PHONE</div>
            ${order.customerPhone || "N/A"}
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=500,height=600");
    if (printWindow) {
      printWindow.document.write(labelHtml);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

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

  const handleBarcodeScan = useCallback(
    (barcode: string) => {
      const trimmed = barcode.trim();
      if (!trimmed) return;
      scanBarcodeMutation.mutate(trimmed);
    },
    [scanBarcodeMutation],
  );

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      o.rxNumber?.toLowerCase().includes(query) ||
      o.addressText?.toLowerCase().includes(query) ||
      o.customerName?.toLowerCase().includes(query) ||
      o.customerPhone?.includes(query) ||
      o.deliveryStatus?.toLowerCase().includes(query)
    );
  });

  const eligibleForRouting = orders.filter(
    (o) => o.deliveryStatus === "ROUTE_ELIGIBLE",
  );

  const printableOrders = orders.filter(canPrintLabel);

  const printAllLabels = () => {
    if (printableOrders.length === 0) return;

    const selectedBatch = (batches as any[]).find(
      (b: any) => b.id === activeBatchId,
    );
    const pharmacyName =
      selectedBatch?.name?.split(" - ")[0] || "RX Delivery Pharmacy";
    const today = new Date().toLocaleDateString();

    const labelsHtml = printableOrders
      .map((order) => {
        const labelId =
          order.deliveryIdentifier || order.rxNumber || `ORD-${order.id}`;

        const canvas = document.createElement("canvas");
        try {
          const dpr = window.devicePixelRatio || 1;
          const ctx = canvas.getContext("2d");
          const logicalWidth = 400;
          const logicalHeight = 120;
          canvas.width = logicalWidth * dpr;
          canvas.height = logicalHeight * dpr;
          if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          JsBarcode(canvas, labelId, {
            format: "CODE128",
            width: 3,
            height: 80,
            displayValue: false,
            margin: 20,
            background: "#ffffff",
            lineColor: "#000000",
            flat: true,
          });
        } catch (err) {
          console.error("Barcode generation error:", err);
        }
        const barcodeDataUrl = canvas.toDataURL("image/png");

        return `
        <div class="label-container">
          <div class="header-row">
            <div class="pharmacy-name">${pharmacyName}</div>
            <div class="date">${today}</div>
          </div>
          <div class="delivery-id">${labelId}</div>
          <div class="barcode-container">
            <img src="${barcodeDataUrl}" alt="Barcode: ${labelId}" />
          </div>
          <div class="field">
            <div class="field-label">Deliver To</div>
            <div class="field-value address">${order.addressText}</div>
          </div>
          <div class="field">
            <div class="field-label">Customer</div>
            <div class="field-value">${order.customerName || "N/A"}</div>
          </div>
          ${order.notes ? `<div class="field"><div class="field-label">Notes</div><div class="field-value">${order.notes}</div></div>` : ""}
          <div class="phone-box">
            <div class="field-label">PHONE</div>
            ${order.customerPhone || "N/A"}
          </div>
        </div>
      `;
      })
      .join("");

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Delivery Labels - ${selectedBatch?.name || "Batch"}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @media print {
            @page { size: 62mm 50mm; margin: 0; }
            html, body { width: 62mm; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: Arial, sans-serif; }
          .label-container { width: 62mm; height: 50mm; padding: 2mm; overflow: hidden; page-break-after: always; page-break-inside: avoid; }
          .label-container:last-child { page-break-after: auto; }
          .header-row { border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 2px; overflow: hidden; }
          .pharmacy-name { font-size: 8px; font-weight: bold; float: left; }
          .date { font-size: 7px; color: #666; float: right; }
          .delivery-id { font-size: 10px; font-weight: bold; text-align: center; background: #f0f0f0; padding: 2px 3px; border-radius: 2px; margin-bottom: 2px; clear: both; }
          .barcode-container { text-align: center; margin-bottom: 2mm; }
          .barcode-container img { width: 100%; height: 8mm; object-fit: contain; }
          .field { margin-bottom: 2px; }
          .field-label { font-size: 6px; color: #666; text-transform: uppercase; }
          .field-value { font-size: 8px; font-weight: 500; line-height: 1.1; }
          .address { font-size: 8px; line-height: 1.1; }
          .phone-box { font-size: 9px; font-weight: bold; background: #e8f0f8; padding: 2px; border-radius: 2px; text-align: center; border: 1px solid #ccc; margin-top: 2px; }
          .phone-box .field-label { font-size: 6px; display: block; }
        </style>
      </head>
      <body>
        ${labelsHtml}
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=500,height=600");
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    }
  };

  const getStatusStyle = (status: string) => {
    const style = STATUS_COLORS[status] || STATUS_COLORS.IMPORTED;
    return style;
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
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <Input
              ref={barcodeInputRef}
              type="text"
              autoComplete="off"
              placeholder="Scan RX with USB scanner or type + Enter"
              className="w-64 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const value = (e.target as HTMLInputElement).value.trim();
                  if (value) {
                    handleBarcodeScan(value);
                    (e.target as HTMLInputElement).value = "";
                  }
                  e.preventDefault();
                }
              }}
            />
            <Button
              onClick={() => barcodeInputRef.current?.focus()}
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              title="Focus scan field then scan prescription barcode with USB scanner"
            >
              <Search className="h-4 w-4 mr-1" />
              Scan RX
            </Button>
          </div>
        </div>
      </div>

      {scanMessage && (
        <div
          className={`p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
            scanMessage.type === "success"
              ? "bg-green-500/20 text-green-400 border border-green-500/30"
              : scanMessage.type === "warning"
                ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                : "bg-red-500/20 text-red-400 border border-red-500/30"
          }`}
        >
          {scanMessage.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : scanMessage.type === "warning" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {scanMessage.text}
        </div>
      )}

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
                <option value="">-- Select a batch to view orders --</option>
                {(batches as any[])
                  .filter(
                    (batch: any) =>
                      batch.status !== "complete" &&
                      batch.status !== "cancelled",
                  )
                  .map((batch: any) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.name} ({batch.totalDeliveries || 0} orders) -{" "}
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
                        Complete Batch
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
                        Cancel Batch
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={printAllLabels}
                        disabled={printableOrders.length === 0}
                        className="border-blue-500 text-blue-400 hover:bg-blue-500/10"
                      >
                        <Printer className="h-4 w-4 mr-1" />
                        Print Labels ({printableOrders.length})
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

          {uploadResult && (
            <div className="mt-4 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
              <h4 className="text-white font-medium mb-2">Upload Results</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">Total Rows:</span>{" "}
                  <span className="text-white font-medium">
                    {uploadResult.totalRows}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">New Orders:</span>{" "}
                  <span className="text-green-400 font-medium">
                    {uploadResult.newOrderCount}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Updated:</span>{" "}
                  <span className="text-blue-400 font-medium">
                    {uploadResult.updatedOrderCount}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Skipped:</span>{" "}
                  <span className="text-yellow-400 font-medium">
                    {uploadResult.skippedCount}
                  </span>
                </div>
              </div>
              {uploadResult.skippedReasons &&
                uploadResult.skippedReasons.length > 0 && (
                  <div className="mt-2 text-xs text-yellow-400">
                    {uploadResult.skippedReasons.map((reason, i) => (
                      <p key={i}>• {reason}</p>
                    ))}
                  </div>
                )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setUploadResult(null)}
                className="mt-2 text-slate-400 hover:text-white"
              >
                Dismiss
              </Button>
            </div>
          )}

          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                const csvContent = `address,customer_name,customer_phone,rx_number,notes
"123 Main Street, New York, NY 10001",John Smith,555-0101,RX-001,Leave at front door
"123 Main Street, New York, NY 10001",John Smith,555-0101,RX-002,Leave at front door
"456 Oak Avenue, Brooklyn, NY 11201",Jane Doe,555-0202,RX-003,Ring doorbell
"456 Oak Avenue, Brooklyn, NY 11201",Jane Doe,555-0202,RX-004,Ring doorbell
"456 Oak Avenue, Brooklyn, NY 11201",Jane Doe,555-0202,RX-005,Ring doorbell
"789 Pine Road, Queens, NY 11375",Bob Johnson,555-0303,RX-006,Call on arrival
"321 Elm Street, Bronx, NY 10451",Alice Williams,555-0404,RX-007,Signature required
"321 Elm Street, Bronx, NY 10451",Alice Williams,555-0404,RX-008,Signature required`;
                const blob = new Blob([csvContent], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "sample-orders.csv";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="text-slate-400 hover:text-white border-slate-600"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Sample CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {filteredOrders.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="border-b border-slate-700">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white">
                Delivery Orders ({orders.length})
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
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      RX Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Fill Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Uploads
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Last Seen
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredOrders.map((order) => {
                    const statusStyle = getStatusStyle(order.deliveryStatus);
                    return (
                      <tr
                        key={order.id}
                        className={`hover:bg-slate-700/30 ${order.priority === "urgent" ? "bg-red-500/5" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {statusStyle.icon}
                            <span
                              className={`text-xs px-2 py-1 rounded ${statusStyle.bg} ${statusStyle.text}`}
                            >
                              {order.deliveryStatus}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono">
                          <span className="text-blue-400 font-medium">
                            {order.rxNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-white">
                          {order.customerName || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {order.customerPhone || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">
                          {order.addressText}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">
                          {order.fillDate
                            ? new Date(order.fillDate).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {order.uploadCount > 1 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs font-medium">
                              <Eye className="h-3 w-3" />
                              Seen {order.uploadCount}x
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">1x</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">
                          {order.lastSeenAt
                            ? new Date(order.lastSeenAt).toLocaleString()
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {order.deliveryStatus === "IMPORTED" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  markScanMutation.mutate(order.id)
                                }
                                disabled={markScanMutation.isPending}
                                className="h-8 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                title="Mark Routing Eligible"
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                <span className="text-xs">Route Ready</span>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const batch = (batches as any[]).find(
                                  (b: any) => b.id === order.batchId,
                                );
                                const pharmacyName =
                                  batch?.name?.split(" - ")[0] ||
                                  "RX Delivery Pharmacy";
                                printDeliveryLabel(order, pharmacyName);
                              }}
                              disabled={!canPrintLabel(order)}
                              className={`h-8 w-8 p-0 ${canPrintLabel(order) ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10" : "text-slate-600 cursor-not-allowed"}`}
                              title={
                                canPrintLabel(order)
                                  ? "Print Label"
                                  : "Scan barcode first to enable label printing"
                              }
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            {order.deliveryStatus !== "DELIVERED" &&
                              order.deliveryStatus !== "CANCELLED" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Cancel order ${order.rxNumber}? This cannot be undone.`,
                                      )
                                    ) {
                                      cancelOrderMutation.mutate(order.id);
                                    }
                                  }}
                                  disabled={cancelOrderMutation.isPending}
                                  className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  title="Cancel Order"
                                >
                                  <Ban className="h-4 w-4" />
                                </Button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {orders.length === 0 && activeBatchId && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-8 text-center">
            <p className="text-slate-400">
              No delivery orders in this batch yet.
            </p>
            <p className="text-slate-500 text-sm mt-1">
              Upload a CSV/Excel file to create orders.
            </p>
          </CardContent>
        </Card>
      )}

      {showAddOrderDialog && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAddOrderDialog(false)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-1">
              Add Missing Prescription
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              This RX was not found in the system. Create a new order for it.
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-slate-300">RX Number</Label>
                <Input
                  value={newOrderRx}
                  onChange={(e) => setNewOrderRx(e.target.value)}
                  className="bg-slate-900/50 border-slate-600 text-white"
                  placeholder="Enter RX number"
                />
              </div>
              <div>
                <Label className="text-slate-300">Address</Label>
                <Input
                  value={newOrderAddress}
                  onChange={(e) => setNewOrderAddress(e.target.value)}
                  className="bg-slate-900/50 border-slate-600 text-white"
                  placeholder="Full delivery address"
                />
              </div>
              <div>
                <Label className="text-slate-300">Customer Name</Label>
                <Input
                  value={newOrderCustomerName}
                  onChange={(e) => setNewOrderCustomerName(e.target.value)}
                  className="bg-slate-900/50 border-slate-600 text-white"
                  placeholder="Customer name"
                />
              </div>
              <div>
                <Label className="text-slate-300">Phone</Label>
                <Input
                  value={newOrderCustomerPhone}
                  onChange={(e) => setNewOrderCustomerPhone(e.target.value)}
                  className="bg-slate-900/50 border-slate-600 text-white"
                  placeholder="Phone number"
                />
              </div>
              <div>
                <Label className="text-slate-300">Notes</Label>
                <Input
                  value={newOrderNotes}
                  onChange={(e) => setNewOrderNotes(e.target.value)}
                  className="bg-slate-900/50 border-slate-600 text-white"
                  placeholder="Delivery notes (optional)"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddOrderDialog(false);
                  resetNewOrderForm();
                }}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!newOrderRx.trim() || !newOrderAddress.trim()) return;
                  setCreateOrderError(null);
                  createOrderMutation.mutate({
                    rxNumber: newOrderRx.trim(),
                    addressText: newOrderAddress.trim(),
                    customerName: newOrderCustomerName.trim(),
                    customerPhone: newOrderCustomerPhone.trim(),
                    notes: newOrderNotes.trim(),
                  });
                }}
                disabled={
                  !newOrderRx.trim() ||
                  !newOrderAddress.trim() ||
                  createOrderMutation.isPending
                }
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                {createOrderMutation.isPending ? "Creating..." : "Create Order"}
              </Button>
            </div>
            {createOrderError && (
              <div className="mt-3 flex items-start gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{createOrderError}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {confirmAction?.type === "complete"
                ? "Complete Batch?"
                : "Cancel Batch?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {confirmAction?.type === "complete"
                ? "This will mark the entire batch as complete."
                : "This will cancel the entire batch."}
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
                : "Cancel Batch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Address Group Confirmation Dialog */}
      {addressGroupDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="p-5 border-b border-slate-700">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Multiple Prescriptions Found
                </h3>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Address card */}
              <div className="bg-slate-700/50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">
                  Address
                </p>
                <p className="text-white font-medium">
                  {addressGroupDialog.address}
                </p>
                {addressGroupDialog.customerName && (
                  <p className="text-slate-300 text-sm">
                    {addressGroupDialog.customerName}
                  </p>
                )}
              </div>

              {/* Count message */}
              <p className="text-slate-300 text-sm">
                <span className="text-white font-semibold">
                  {addressGroupDialog.groupedOrders.length} prescription
                  {addressGroupDialog.groupedOrders.length !== 1 ? "s" : ""}
                </span>{" "}
                found for this address. Select which ones to include in this
                delivery:
              </p>

              {/* RX checklist */}
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {addressGroupDialog.groupedOrders.map((order) => {
                  const isSelected = addressGroupDialog.selectedIds.has(
                    order.id,
                  );
                  const isScanned =
                    order.id === addressGroupDialog.scannedOrder.id;
                  return (
                    <label
                      key={order.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-500/10 border-blue-500/40"
                          : "bg-slate-700/30 border-slate-600/50 hover:border-slate-500"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isScanned}
                        onChange={() => {
                          const next = new Set(addressGroupDialog.selectedIds);
                          if (isSelected) next.delete(order.id);
                          else next.add(order.id);
                          setAddressGroupDialog({
                            ...addressGroupDialog,
                            selectedIds: next,
                          });
                        }}
                        className="w-4 h-4 accent-blue-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm font-medium">
                            RX {order.rxNumber}
                          </span>
                          {isScanned && (
                            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">
                              Scanned
                            </span>
                          )}
                        </div>
                        {order.notes && (
                          <p className="text-slate-400 text-xs mt-0.5 truncate">
                            {order.notes}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-700 flex gap-3">
              <Button
                onClick={() => {
                  const selectedIds = Array.from(
                    addressGroupDialog.selectedIds,
                  );
                  if (selectedIds.length === 0) return;
                  confirmGroupMutation.mutate({
                    barcode: addressGroupDialog.scannedOrder.rxNumber,
                    orderIds: selectedIds,
                  });
                }}
                disabled={
                  addressGroupDialog.selectedIds.size === 0 ||
                  confirmGroupMutation.isPending
                }
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {confirmGroupMutation.isPending
                  ? "Creating..."
                  : `Create Delivery (${addressGroupDialog.selectedIds.size} RX${addressGroupDialog.selectedIds.size !== 1 ? "s" : ""})`}
              </Button>
              <Button
                variant="outline"
                onClick={() => setAddressGroupDialog(null)}
                disabled={confirmGroupMutation.isPending}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
