import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MapPin,
  AlertTriangle,
  Calendar,
  Filter,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface OrderDetail {
  id: number;
  rxNumber: string;
  batchId: number | null;
  fillDate: string | null;
  deliveryStatus: string;
  lastSeenAt: string;
  customerName: string | null;
}

interface AddressGroup {
  normalizedAddressHash: string;
  addressText: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  lat: number | null;
  lng: number | null;
  customerNames: string[];
  totalCount: number;
  monthCount: number;
  weekCount: number;
  lastDeliveryDate: string;
  orders: OrderDetail[];
}

type SortCol = "address" | "total" | "month" | "week" | "last";
type SortDir = "asc" | "desc";

type Preset = "week" | "month" | "30days" | "custom";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    IMPORTED: "bg-slate-600 text-slate-200",
    ROUTE_ELIGIBLE: "bg-blue-600/30 text-blue-300",
    ROUTED: "bg-yellow-600/30 text-yellow-300",
    DELIVERED: "bg-green-600/30 text-green-300",
    CANCELLED: "bg-red-600/30 text-red-300",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? "bg-slate-700 text-slate-300"}`}
    >
      {status}
    </span>
  );
}

export default function AddressAnalytics() {
  const today = new Date();

  // Date range state
  const [preset, setPreset] = useState<Preset>("30days");
  const [customFrom, setCustomFrom] = useState(isoDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [customTo, setCustomTo] = useState(isoDate(today));

  // Admin pharmacy filter
  const [pharmacyFilterId, setPharmacyFilterId] = useState<string>("all");

  // Table sort
  const [sortCol, setSortCol] = useState<SortCol>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Expanded rows & selected map pin
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [mapAddress, setMapAddress] = useState<AddressGroup | null>(null);

  // Compute from/to from preset
  const { from, to } = useMemo(() => {
    const now = new Date();
    if (preset === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      return { from: isoDate(start), to: isoDate(now) };
    }
    if (preset === "month") {
      return {
        from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: isoDate(now),
      };
    }
    if (preset === "30days") {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      return { from: isoDate(start), to: isoDate(now) };
    }
    return { from: customFrom, to: customTo };
  }, [preset, customFrom, customTo]);

  const pharmacyQuery = useQuery<any[]>({
    queryKey: ["/api/pharmacies"],
    queryFn: async () => {
      const res = await fetch("/api/pharmacies", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const pharmacies: any[] = pharmacyQuery.data ?? [];
  const isAdmin = pharmacies.length > 0;

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    if (isAdmin && pharmacyFilterId !== "all") {
      params.set("pharmacyId", pharmacyFilterId);
    }
    return `/api/analytics/address-frequency?${params}`;
  }, [from, to, isAdmin, pharmacyFilterId]);

  const { data, isLoading, error } = useQuery<{ groups: AddressGroup[] }>({
    queryKey: [queryUrl],
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
  });

  const groups = data?.groups ?? [];

  const sorted = useMemo(() => {
    return [...groups].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "address") cmp = a.addressText.localeCompare(b.addressText);
      else if (sortCol === "total") cmp = a.totalCount - b.totalCount;
      else if (sortCol === "month") cmp = a.monthCount - b.monthCount;
      else if (sortCol === "week") cmp = a.weekCount - b.weekCount;
      else if (sortCol === "last")
        cmp =
          new Date(a.lastDeliveryDate).getTime() -
          new Date(b.lastDeliveryDate).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [groups, sortCol, sortDir]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col)
      return <ChevronDown className="h-3 w-3 text-slate-500 inline ml-1" />;
    return sortDir === "desc" ? (
      <ChevronDown className="h-3 w-3 text-blue-400 inline ml-1" />
    ) : (
      <ChevronUp className="h-3 w-3 text-blue-400 inline ml-1" />
    );
  }

  const flaggedCount = groups.filter((g) => g.monthCount >= 2).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Address Analytics</h2>
        <p className="text-slate-400">
          See how many delivery trips have been made to each patient address.
          Multiple scripts in the same batch run count as one trip.
        </p>
      </div>

      {/* Controls */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Preset buttons */}
            <div>
              <p className="text-slate-400 text-xs mb-1">Date range</p>
              <div className="flex gap-1">
                {(
                  [
                    { id: "week", label: "This Week" },
                    { id: "month", label: "This Month" },
                    { id: "30days", label: "Last 30 Days" },
                    { id: "custom", label: "Custom" },
                  ] as { id: Preset; label: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPreset(p.id)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                      preset === p.id
                        ? "bg-blue-500 text-white"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom range inputs */}
            {preset === "custom" && (
              <div className="flex gap-2 items-center">
                <div>
                  <p className="text-slate-400 text-xs mb-1">From</p>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="bg-slate-900/50 border-slate-600 text-white w-36 h-8 text-sm"
                  />
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-1">To</p>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="bg-slate-900/50 border-slate-600 text-white w-36 h-8 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Admin pharmacy filter */}
            {isAdmin && (
              <div>
                <p className="text-slate-400 text-xs mb-1">Pharmacy</p>
                <Select value={pharmacyFilterId} onValueChange={setPharmacyFilterId}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white w-44 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="all" className="text-white">
                      All Pharmacies
                    </SelectItem>
                    {pharmacies.map((p: any) => (
                      <SelectItem
                        key={p.id}
                        value={String(p.id)}
                        className="text-white"
                      >
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Summary badge */}
            {flaggedCount > 0 && (
              <div className="flex items-center gap-2 ml-auto bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span className="text-amber-300 text-sm font-medium">
                  {flaggedCount} address{flaggedCount !== 1 ? "es" : ""} with 2+
                  trips this month
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Map inset for selected address */}
      {mapAddress && mapAddress.lat != null && mapAddress.lng != null && (
        <Card className="bg-slate-800/50 border-slate-700 overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-blue-400" />
              {mapAddress.addressText}
            </CardTitle>
            <button
              onClick={() => setMapAddress(null)}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <div className="h-56">
            <MapContainer
              center={[mapAddress.lat, mapAddress.lng]}
              zoom={15}
              style={{ height: "100%", width: "100%" }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={[mapAddress.lat, mapAddress.lng]}>
                <Popup>
                  <div className="font-medium">{mapAddress.addressText}</div>
                  {mapAddress.customerNames.length > 0 && (
                    <div className="text-sm text-gray-600">
                      {mapAddress.customerNames.join(", ")}
                    </div>
                  )}
                  <div className="text-sm mt-1">
                    {mapAddress.totalCount} delivery trip{mapAddress.totalCount !== 1 ? "s" : ""}
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-400" />
            Delivery Frequency by Address
            {!isLoading && (
              <span className="text-sm font-normal text-slate-400 ml-2">
                {groups.length} address{groups.length !== 1 ? "es" : ""}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              Loading analytics…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-16 text-red-400">
              Failed to load data. Please try again.
            </div>
          )}
          {!isLoading && !error && groups.length === 0 && (
            <div className="flex items-center justify-center py-16 text-slate-500">
              No delivery orders found for the selected period.
            </div>
          )}

          {!isLoading && !error && groups.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700 text-left">
                    <th className="w-6 px-4 py-3" />
                    <th
                      className="px-4 py-3 text-slate-400 text-xs font-medium cursor-pointer hover:text-white"
                      onClick={() => toggleSort("address")}
                    >
                      Address
                      <SortIcon col="address" />
                    </th>
                    <th className="px-4 py-3 text-slate-400 text-xs font-medium">
                      Patient(s)
                    </th>
                    <th
                      className="px-4 py-3 text-slate-400 text-xs font-medium cursor-pointer hover:text-white text-right"
                      onClick={() => toggleSort("total")}
                    >
                      Trips
                      <SortIcon col="total" />
                    </th>
                    <th
                      className="px-4 py-3 text-slate-400 text-xs font-medium cursor-pointer hover:text-white text-right"
                      onClick={() => toggleSort("month")}
                    >
                      This Month
                      <SortIcon col="month" />
                    </th>
                    <th
                      className="px-4 py-3 text-slate-400 text-xs font-medium cursor-pointer hover:text-white text-right"
                      onClick={() => toggleSort("week")}
                    >
                      This Week
                      <SortIcon col="week" />
                    </th>
                    <th
                      className="px-4 py-3 text-slate-400 text-xs font-medium cursor-pointer hover:text-white"
                      onClick={() => toggleSort("last")}
                    >
                      Last Delivered
                      <SortIcon col="last" />
                    </th>
                    <th className="px-4 py-3 text-slate-400 text-xs font-medium">
                      Map
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((group) => {
                    const flagged = group.monthCount >= 2;
                    const isExpanded = expandedHash === group.normalizedAddressHash;

                    return (
                      <>
                        <tr
                          key={group.normalizedAddressHash}
                          className={`border-b border-slate-700/50 transition-colors hover:bg-slate-700/20 ${
                            flagged ? "bg-amber-500/5" : ""
                          }`}
                        >
                          {/* Expand toggle */}
                          <td className="px-4 py-3">
                            <button
                              onClick={() =>
                                setExpandedHash(
                                  isExpanded
                                    ? null
                                    : group.normalizedAddressHash,
                                )
                              }
                              className="text-slate-500 hover:text-white transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>

                          {/* Address */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {flagged && (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                              )}
                              <div>
                                <div className="text-white text-sm font-medium">
                                  {group.streetAddress ?? group.addressText}
                                </div>
                                {group.streetAddress && (
                                  <div className="text-slate-500 text-xs">
                                    {[group.city, group.state, group.zipCode]
                                      .filter(Boolean)
                                      .join(", ")}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Patients */}
                          <td className="px-4 py-3 text-slate-300 text-sm">
                            {group.customerNames.length > 0
                              ? group.customerNames.slice(0, 2).join(", ") +
                                (group.customerNames.length > 2
                                  ? ` +${group.customerNames.length - 2}`
                                  : "")
                              : <span className="text-slate-600">—</span>}
                          </td>

                          {/* Counts */}
                          <td className="px-4 py-3 text-right">
                            <span className="text-white font-semibold text-sm">
                              {group.totalCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-sm font-semibold ${
                                flagged ? "text-amber-400" : "text-slate-300"
                              }`}
                            >
                              {group.monthCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-slate-300 text-sm">
                              {group.weekCount}
                            </span>
                          </td>

                          {/* Last delivered */}
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {new Date(group.lastDeliveryDate).toLocaleDateString()}
                          </td>

                          {/* Map button */}
                          <td className="px-4 py-3">
                            {group.lat != null && group.lng != null ? (
                              <button
                                onClick={() =>
                                  setMapAddress(
                                    mapAddress?.normalizedAddressHash ===
                                      group.normalizedAddressHash
                                      ? null
                                      : group,
                                  )
                                }
                                className={`p-1.5 rounded transition-colors ${
                                  mapAddress?.normalizedAddressHash ===
                                  group.normalizedAddressHash
                                    ? "bg-blue-500 text-white"
                                    : "text-slate-500 hover:text-blue-400 hover:bg-blue-500/10"
                                }`}
                                title="View on map"
                              >
                                <MapPin className="h-4 w-4" />
                              </button>
                            ) : (
                              <span className="text-slate-700 text-xs px-1">—</span>
                            )}
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr
                            key={`${group.normalizedAddressHash}-detail`}
                            className="border-b border-slate-700/50 bg-slate-900/40"
                          >
                            <td />
                            <td colSpan={7} className="px-6 py-3">
                              <p className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wide">
                                Scripts in period ({group.orders.length})
                              </p>
                              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {group.orders.map((order) => (
                                  <div
                                    key={order.id}
                                    className="flex items-center gap-4 bg-slate-800/60 rounded-lg px-3 py-2 text-sm"
                                  >
                                    <span className="text-slate-300 font-mono text-xs">
                                      Rx&nbsp;{order.rxNumber}
                                    </span>
                                    {order.customerName && (
                                      <span className="text-slate-400 text-xs">
                                        {order.customerName}
                                      </span>
                                    )}
                                    {order.fillDate && (
                                      <span className="text-slate-500 text-xs flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        Fill: {order.fillDate}
                                      </span>
                                    )}
                                    <span className="text-slate-500 text-xs ml-auto">
                                      Seen{" "}
                                      {new Date(
                                        order.lastSeenAt,
                                      ).toLocaleDateString()}
                                    </span>
                                    {statusBadge(order.deliveryStatus)}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
