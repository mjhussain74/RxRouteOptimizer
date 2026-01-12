import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Edit2, Trash2, Phone, Mail, MapPin } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Switch } from "./ui/switch";

interface Pharmacy {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
  isActive: boolean;
  createdAt: string;
}

export default function PharmacyManager() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPharmacy, setEditingPharmacy] = useState<Pharmacy | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });

  const { data: pharmacies = [], isLoading } = useQuery<Pharmacy[]>({
    queryKey: ["/api/pharmacies"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch("/api/pharmacies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to create pharmacy");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pharmacies"] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Pharmacy> }) => {
      const response = await fetch(`/api/pharmacies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to update pharmacy");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pharmacies"] });
      resetForm();
    },
  });

  const resetForm = () => {
    setFormData({ name: "", address: "", phone: "", email: "" });
    setEditingPharmacy(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (pharmacy: Pharmacy) => {
    setEditingPharmacy(pharmacy);
    setFormData({
      name: pharmacy.name,
      address: pharmacy.address || "",
      phone: pharmacy.phone || "",
      email: pharmacy.email || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPharmacy) {
      updateMutation.mutate({ id: editingPharmacy.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleActive = (pharmacy: Pharmacy) => {
    updateMutation.mutate({ id: pharmacy.id, data: { isActive: !pharmacy.isActive } });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading pharmacies...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Pharmacy Management</h2>
          <p className="text-slate-400">Manage all pharmacies in the system</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Pharmacy
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-800 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingPharmacy ? "Edit Pharmacy" : "Add New Pharmacy"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-200">Pharmacy Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="Enter pharmacy name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200">Address</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="Enter address"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200">Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="Enter phone number"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200">Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="Enter email"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-purple-600 hover:bg-purple-700">
                  {editingPharmacy ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pharmacies.map((pharmacy) => (
          <Card key={pharmacy.id} className={`bg-slate-800 border-slate-700 ${!pharmacy.isActive ? 'opacity-50' : ''}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-purple-400" />
                  <CardTitle className="text-white text-lg">{pharmacy.name}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={pharmacy.isActive}
                    onCheckedChange={() => toggleActive(pharmacy)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(pharmacy)}
                    className="text-slate-400 hover:text-white"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {pharmacy.address && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <MapPin className="h-4 w-4" />
                  <span>{pharmacy.address}</span>
                </div>
              )}
              {pharmacy.phone && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Phone className="h-4 w-4" />
                  <span>{pharmacy.phone}</span>
                </div>
              )}
              {pharmacy.email && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Mail className="h-4 w-4" />
                  <span>{pharmacy.email}</span>
                </div>
              )}
              <div className="pt-2 text-xs text-slate-500">
                Added: {new Date(pharmacy.createdAt).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {pharmacies.length === 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Pharmacies Yet</h3>
            <p className="text-slate-400 mb-4">Add your first pharmacy to get started</p>
            <Button onClick={() => setIsDialogOpen(true)} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Pharmacy
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
