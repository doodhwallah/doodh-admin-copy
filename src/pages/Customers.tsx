import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, Edit, Trash2, Phone, MapPin, Loader2, Palmtree, BookOpen, Eye } from "lucide-react";
import { VacationManager } from "@/components/customers/VacationManager";
import { CustomerLedger } from "@/components/customers/CustomerLedger";
import { CustomerAccountApprovals } from "@/components/customers/CustomerAccountApprovals";
import { CustomerDetailDialog } from "@/components/customers/CustomerDetailDialog";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  area: string | null;
  subscription_type: string;
  billing_cycle: string;
  credit_balance: number;
  advance_balance: number;
  is_active: boolean;
  created_at: string;
}

const emptyFormData = {
  name: "",
  phone: "",
  email: "",
  address: "",
  area: "",
  subscription_type: "daily",
  billing_cycle: "monthly",
  notes: "",
};

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vacationDialogOpen, setVacationDialogOpen] = useState(false);
  const [ledgerDialogOpen, setLedgerDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState(emptyFormData);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    setPage(0);
  }, [searchQuery]);

  useEffect(() => {
    fetchCustomers();
    if (searchParams.get("action") === "add") {
      setDialogOpen(true);
      setSearchParams({});
    }
  }, [searchParams, page, searchQuery]);

  const fetchCustomers = async () => {
    setLoading(true);
    
    let query = supabase
      .from("customers")
      .select("*", { count: "exact" });
    
    if (searchQuery.trim()) {
      query = query.or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,area.ilike.%${searchQuery}%`);
    }
    
    const { data, error, count } = await query
      .order("name")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      toast({
        title: "Error fetching customers",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setCustomers(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleOpenDialog = (customer?: Customer) => {
    if (customer) {
      setSelectedCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone || "",
        email: customer.email || "",
        address: customer.address || "",
        area: customer.area || "",
        subscription_type: customer.subscription_type,
        billing_cycle: customer.billing_cycle,
        notes: "",
      });
    } else {
      setSelectedCustomer(null);
      setFormData(emptyFormData);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast({
        title: "Validation Error",
        description: "Customer name is required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const payload = {
      name: formData.name,
      phone: formData.phone || null,
      email: formData.email || null,
      address: formData.address || null,
      area: formData.area || null,
      subscription_type: formData.subscription_type,
      billing_cycle: formData.billing_cycle,
      notes: formData.notes || null,
    };

    const { error } = selectedCustomer
      ? await supabase.from("customers").update(payload).eq("id", selectedCustomer.id)
      : await supabase.from("customers").insert(payload);

    setSaving(false);

    if (error) {
      toast({
        title: "Error saving customer",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: selectedCustomer ? "Customer updated" : "Customer added",
        description: `${formData.name} has been saved successfully`,
      });
      setDialogOpen(false);
      fetchCustomers();
    }
  };

  const handleDelete = async () => {
    if (!selectedCustomer) return;

    const { error } = await supabase.from("customers").delete().eq("id", selectedCustomer.id);

    if (error) {
      toast({
        title: "Error deleting customer",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Customer deleted",
        description: `${selectedCustomer.name} has been removed`,
      });
      setDeleteDialogOpen(false);
      setSelectedCustomer(null);
      fetchCustomers();
    }
  };

  const totalDue = customers.reduce((sum, c) => sum + Number(c.credit_balance), 0);
  const totalAdvance = customers.reduce((sum, c) => sum + Number(c.advance_balance), 0);

  const handleOpenDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailDialogOpen(true);
  };

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (item: Customer) => (
        <div 
          className="flex flex-col cursor-pointer group"
          onClick={() => handleOpenDetail(item)}
        >
          <span className="font-semibold flex items-center gap-1 text-primary group-hover:underline">
            {item.name}
            <Eye className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
          {item.area && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {item.area}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "phone",
      header: "Contact",
      render: (item: Customer) => (
        <div 
          className="flex flex-col cursor-pointer group"
          onClick={() => handleOpenDetail(item)}
        >
          {item.phone && (
            <span className="flex items-center gap-1 text-sm text-primary group-hover:underline">
              <Phone className="h-3 w-3" /> {item.phone}
            </span>
          )}
          {item.email && (
            <span className="text-xs text-muted-foreground">{item.email}</span>
          )}
        </div>
      ),
    },
    {
      key: "subscription_type",
      header: "Subscription",
      render: (item: Customer) => (
        <span className="capitalize">{item.subscription_type}</span>
      ),
    },
    {
      key: "billing_cycle",
      header: "Billing",
      render: (item: Customer) => (
        <span className="capitalize">{item.billing_cycle}</span>
      ),
    },
    {
      key: "credit_balance",
      header: "Due",
      render: (item: Customer) => (
        <span className={item.credit_balance > 0 ? "text-destructive font-medium" : ""}>
          ₹{Number(item.credit_balance).toLocaleString()}
        </span>
      ),
    },
    {
      key: "advance_balance",
      header: "Advance",
      render: (item: Customer) => (
        <span className={item.advance_balance > 0 ? "text-success font-medium" : ""}>
          ₹{Number(item.advance_balance).toLocaleString()}
        </span>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (item: Customer) => (
        <StatusBadge status={item.is_active ? "active" : "inactive"} />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: Customer) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="Vacation/Pause"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedCustomer(item);
              setVacationDialogOpen(true);
            }}
          >
            <Palmtree className="h-4 w-4 text-primary" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Ledger"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedCustomer(item);
              setLedgerDialogOpen(true);
            }}
          >
            <BookOpen className="h-4 w-4 text-info" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDialog(item);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedCustomer(item);
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Manage your customer base"
        icon={Users}
        action={{
          label: "Add Customer",
          onClick: () => handleOpenDialog(),
        }}
      />

      {/* Pending Customer Approvals */}
      <CustomerAccountApprovals />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-animation">
        <Card className="group overflow-hidden hover-lift">
          <CardContent className="pt-6 relative">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold">{customers.length}</div>
                <p className="text-sm text-muted-foreground font-medium">Total Customers</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-colored">
                <Users className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group overflow-hidden hover-lift">
          <CardContent className="pt-6 relative">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br from-success/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-success">
                  {customers.filter((c) => c.is_active).length}
                </div>
                <p className="text-sm text-muted-foreground font-medium">Active</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-success to-success/70 flex items-center justify-center shadow-md">
                <Users className="h-6 w-6 text-success-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group overflow-hidden hover-lift">
          <CardContent className="pt-6 relative">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br from-destructive/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-destructive">
                  ₹{totalDue.toLocaleString()}
                </div>
                <p className="text-sm text-muted-foreground font-medium">Total Due</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-destructive to-destructive/70 flex items-center justify-center shadow-md">
                <span className="text-destructive-foreground font-bold">₹</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group overflow-hidden hover-lift">
          <CardContent className="pt-6 relative">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br from-info/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-info">
                  ₹{totalAdvance.toLocaleString()}
                </div>
                <p className="text-sm text-muted-foreground font-medium">Total Advance</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-info to-info/70 flex items-center justify-center shadow-md">
                <span className="text-info-foreground font-bold">₹</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={customers}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search by name, phone, area..."
        emptyMessage="No customers found. Add your first customer."
      />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCustomer ? "Edit Customer" : "Add New Customer"}
            </DialogTitle>
            <DialogDescription>
              {selectedCustomer
                ? "Update customer information"
                : "Enter details for the new customer"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Customer name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="customer@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="area">Area</Label>
                <Input
                  id="area"
                  value={formData.area}
                  onChange={(e) =>
                    setFormData({ ...formData, area: e.target.value })
                  }
                  placeholder="e.g., Sector 15, Noida"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="Full address"
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="subscription_type">Subscription Type</Label>
                <Select
                  value={formData.subscription_type}
                  onValueChange={(v) =>
                    setFormData({ ...formData, subscription_type: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="alternate">Alternate Days</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing_cycle">Billing Cycle</Label>
                <Select
                  value={formData.billing_cycle}
                  onValueChange={(v) =>
                    setFormData({ ...formData, billing_cycle: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {selectedCustomer ? "Update" : "Add"} Customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Customer"
        description={`Are you sure you want to delete ${selectedCustomer?.name}? This will also delete all related deliveries and invoices.`}
        confirmText="Delete"
        onConfirm={handleDelete}
        variant="destructive"
      />

      {/* Vacation Manager */}
      <VacationManager
        customerId={selectedCustomer?.id || ""}
        customerName={selectedCustomer?.name || ""}
        open={vacationDialogOpen}
        onOpenChange={setVacationDialogOpen}
      />

      {/* Customer Ledger */}
      <CustomerLedger
        customerId={selectedCustomer?.id || ""}
        customerName={selectedCustomer?.name || ""}
        open={ledgerDialogOpen}
        onOpenChange={setLedgerDialogOpen}
      />

      {/* Customer Detail Dialog */}
      <CustomerDetailDialog
        customer={selectedCustomer}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />
    </div>
  );
}
