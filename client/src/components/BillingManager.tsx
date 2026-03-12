import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  Settings,
  FileText,
  ChevronDown,
  ChevronUp,
  Save,
  RefreshCw,
  Building2,
  Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

interface BillingTier {
  id: number;
  label: string;
  minMiles: number;
  maxMiles: number;
  fee: number;
}

interface InvoiceLineItem {
  stopId: number;
  deliveryId: number;
  addressText: string;
  customerName: string | null;
  distanceMiles: number;
  fee: number;
  status: string;
}

interface Invoice {
  id: number;
  routeId: number;
  pharmacyId: number;
  pharmacyName: string;
  driverName: string | null;
  routeName: string;
  completedAt: string;
  lineItems: InvoiceLineItem[];
  totalDeliveries: number;
  totalFee: number;
  generatedAt: string;
  status: string;
}

export default function BillingManager() {
  const queryClient = useQueryClient();
  const [editedTiers, setEditedTiers] = useState<BillingTier[] | null>(null);
  const [expandedInvoice, setExpandedInvoice] = useState<number | null>(null);
  const [filterPharmacyId, setFilterPharmacyId] = useState<string>("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showFeeConfig, setShowFeeConfig] = useState(false);
  const [generateAllMsg, setGenerateAllMsg] = useState<string | null>(null);

  const { data: tiers = [], isLoading: tiersLoading } = useQuery<BillingTier[]>({
    queryKey: ["/api/billing/tiers"],
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/billing/invoices", filterPharmacyId],
    queryFn: async () => {
      const url = filterPharmacyId
        ? `/api/billing/invoices?pharmacyId=${filterPharmacyId}`
        : "/api/billing/invoices";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
  });

  const { data: pharmacies = [] } = useQuery<any[]>({
    queryKey: ["/api/pharmacies"],
  });

  const saveTiersMutation = useMutation({
    mutationFn: async (tiers: BillingTier[]) => {
      const res = await fetch("/api/billing/tiers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save tiers");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/tiers"] });
      setEditedTiers(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const generateAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/billing/invoices/generate-all", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate invoices");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      setGenerateAllMsg(`Generated ${data.generated} invoice(s), ${data.skipped} already existed or were skipped.`);
      setTimeout(() => setGenerateAllMsg(null), 6000);
    },
  });

  const activeTiers = editedTiers || tiers;

  const updateTierFee = (id: number, fee: number) => {
    const base = editedTiers || tiers;
    setEditedTiers(base.map(t => t.id === id ? { ...t, fee } : t));
  };

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.totalFee, 0);
  const totalDeliveries = invoices.reduce((sum, inv) => sum + inv.totalDeliveries, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Billing</h2>
          <p className="text-slate-400">View pharmacy invoices and configure delivery fees</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFeeConfig(!showFeeConfig)}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <Settings className="h-4 w-4 mr-1" />
            Delivery Fee Configuration
          </Button>
          <Button
            size="sm"
            onClick={() => generateAllMutation.mutate()}
            disabled={generateAllMutation.isPending}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Zap className="h-4 w-4 mr-1" />
            {generateAllMutation.isPending ? "Generating..." : "Generate Missing Invoices"}
          </Button>
        </div>
      </div>

      {generateAllMsg && (
        <div className="bg-teal-900/40 border border-teal-700 rounded-lg px-4 py-3 text-teal-300 text-sm">
          {generateAllMsg}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-teal-500/20 rounded-lg">
              <DollarSign className="h-6 w-6 text-teal-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm">Total Revenue</p>
              <p className="text-white text-2xl font-bold">${totalRevenue.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <FileText className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm">Total Invoices</p>
              <p className="text-white text-2xl font-bold">{invoices.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <Building2 className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm">Total Deliveries Billed</p>
              <p className="text-white text-2xl font-bold">{totalDeliveries}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delivery Fee Config — hidden by default */}
      {showFeeConfig && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <Settings className="h-5 w-5 text-teal-400" />
                Delivery Fee Tiers
              </CardTitle>
              <div className="flex gap-2">
                {editedTiers && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditedTiers(null)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => saveTiersMutation.mutate(activeTiers)}
                  disabled={!editedTiers || saveTiersMutation.isPending}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {saveTiersMutation.isPending ? "Saving..." : saveSuccess ? "Saved!" : "Save Changes"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tiersLoading ? (
              <p className="text-slate-400">Loading tiers...</p>
            ) : (
              <div className="space-y-3">
                {activeTiers.map((tier) => (
                  <div
                    key={tier.id}
                    className="flex items-center gap-4 bg-slate-700/40 rounded-lg p-4 border border-slate-600/50"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium">{tier.label}</p>
                      <p className="text-slate-400 text-sm">
                        {tier.minMiles} – {tier.maxMiles} miles radius
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={tier.fee}
                        onChange={(e) => updateTierFee(tier.id, parseFloat(e.target.value) || 0)}
                        className="w-24 bg-slate-900/50 border-slate-600 text-white text-right"
                      />
                      <span className="text-slate-400 text-sm">per delivery</span>
                    </div>
                  </div>
                ))}
                {activeTiers.length > 0 && (
                  <p className="text-slate-500 text-xs mt-2">
                    Deliveries beyond {activeTiers[activeTiers.length - 1]?.maxMiles} miles are not charged.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-400" />
              Invoices
            </CardTitle>
            <div className="flex items-center gap-3">
              <select
                value={filterPharmacyId}
                onChange={(e) => setFilterPharmacyId(e.target.value)}
                className="bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">All Pharmacies</option>
                {(pharmacies as any[]).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] })}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <p className="text-slate-400">Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No invoices yet.</p>
              <p className="text-slate-500 text-sm mt-1">
                Invoices are generated automatically when a route is completed.
                Use "Generate Missing Invoices" to backfill past completed routes.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="bg-slate-700/30 rounded-lg border border-slate-600/50 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-700/40 transition-colors text-left"
                    onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <FileText className="h-4 w-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">{invoice.routeName}</p>
                        <p className="text-slate-400 text-sm">
                          {invoice.pharmacyName}
                          {invoice.driverName && ` · ${invoice.driverName}`}
                          {" · "}
                          {new Date(invoice.completedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-teal-400 font-bold text-lg">${invoice.totalFee.toFixed(2)}</p>
                        <p className="text-slate-400 text-xs">{invoice.totalDeliveries} deliveries</p>
                      </div>
                      {expandedInvoice === invoice.id
                        ? <ChevronUp className="h-4 w-4 text-slate-400" />
                        : <ChevronDown className="h-4 w-4 text-slate-400" />
                      }
                    </div>
                  </button>

                  {expandedInvoice === invoice.id && (
                    <div className="border-t border-slate-600/50">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-800/60">
                              <th className="text-left px-4 py-2 text-slate-400 font-medium">Address</th>
                              <th className="text-left px-4 py-2 text-slate-400 font-medium">Customer</th>
                              <th className="text-right px-4 py-2 text-slate-400 font-medium">Distance</th>
                              <th className="text-right px-4 py-2 text-slate-400 font-medium">Fee</th>
                              <th className="text-center px-4 py-2 text-slate-400 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoice.lineItems.map((item, idx) => (
                              <tr key={idx} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                                <td className="px-4 py-2 text-white text-xs">{item.addressText}</td>
                                <td className="px-4 py-2 text-slate-300 text-xs">{item.customerName || "—"}</td>
                                <td className="px-4 py-2 text-slate-300 text-xs text-right">{item.distanceMiles} mi</td>
                                <td className="px-4 py-2 text-teal-400 font-medium text-right">
                                  {item.fee > 0 ? `$${item.fee.toFixed(2)}` : "—"}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    item.status === "completed"
                                      ? "bg-green-500/20 text-green-400"
                                      : item.status === "cancelled"
                                      ? "bg-red-500/20 text-red-400"
                                      : "bg-slate-500/20 text-slate-400"
                                  }`}>
                                    {item.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-800/60 border-t border-slate-600/50">
                              <td colSpan={3} className="px-4 py-3 text-slate-300 font-medium">
                                Total — {invoice.totalDeliveries} deliveries
                              </td>
                              <td className="px-4 py-3 text-teal-400 font-bold text-right text-base">
                                ${invoice.totalFee.toFixed(2)}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
