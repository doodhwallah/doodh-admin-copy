import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { devError } from "@/lib/utils";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Receipt, IndianRupee, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { InvoicePDFGenerator } from "@/components/billing/InvoicePDFGenerator";

interface Customer {
  id: string;
  name: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  billing_period_start: string;
  billing_period_end: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_status: string;
  due_date: string | null;
  created_at: string;
  customer?: Customer;
}

interface InvoiceWithCustomer extends Invoice {
  customer: Customer;
}

export default function BillingPage() {
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithCustomer | null>(null);
  const [formData, setFormData] = useState({
    customer_id: "",
    billing_period_start: format(new Date(new Date().setDate(1)), "yyyy-MM-dd"),
    billing_period_end: format(new Date(), "yyyy-MM-dd"),
    total_amount: "",
    discount_amount: "0",
  });
  const [paymentAmount, setPaymentAmount] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    try {
      // Fetch customers and invoices in parallel for faster loading
      const [customerRes, invoiceRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("invoices")
          .select(`
            *,
            customer:customer_id (id, name)
          `)
          .order("created_at", { ascending: false })
      ]);

      setCustomers(customerRes.data || []);

      if (invoiceRes.error) {
        toast({
          title: "Error fetching invoices",
          description: invoiceRes.error.message,
          variant: "destructive",
        });
      } else {
        setInvoices((invoiceRes.data as InvoiceWithCustomer[]) || []);
      }
    } catch (error) {
      devError("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return `INV-${year}${month}-${random}`;
  };

  const handleCreateInvoice = async () => {
    if (!formData.customer_id || !formData.total_amount) {
      toast({
        title: "Validation Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    
    const totalAmount = parseFloat(formData.total_amount);
    const discountAmount = parseFloat(formData.discount_amount) || 0;
    const finalAmount = totalAmount - discountAmount;

    const { error } = await supabase.from("invoices").insert({
      invoice_number: generateInvoiceNumber(),
      customer_id: formData.customer_id,
      billing_period_start: formData.billing_period_start,
      billing_period_end: formData.billing_period_end,
      total_amount: totalAmount,
      discount_amount: discountAmount,
      tax_amount: 0,
      final_amount: finalAmount,
      payment_status: "pending",
      due_date: format(new Date(new Date().setDate(new Date().getDate() + 15)), "yyyy-MM-dd"),
    });

    setSaving(false);

    if (error) {
      toast({
        title: "Error creating invoice",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Invoice created",
        description: "The invoice has been generated",
      });
      setDialogOpen(false);
      setFormData({
        customer_id: "",
        billing_period_start: format(new Date(new Date().setDate(1)), "yyyy-MM-dd"),
        billing_period_end: format(new Date(), "yyyy-MM-dd"),
        total_amount: "",
        discount_amount: "0",
      });
      fetchData();
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    const newPaidAmount = Number(selectedInvoice.paid_amount) + amount;
    const remaining = Number(selectedInvoice.final_amount) - newPaidAmount;
    
    let newStatus: "paid" | "partial" | "pending" = "partial";
    if (remaining <= 0) newStatus = "paid";
    else if (newPaidAmount === 0) newStatus = "pending";

    const { error: invoiceError } = await supabase
      .from("invoices")
      .update({ 
        paid_amount: newPaidAmount,
        payment_status: newStatus,
        payment_date: newStatus === "paid" ? format(new Date(), "yyyy-MM-dd") : null
      })
      .eq("id", selectedInvoice.id);

    const { error: paymentError } = await supabase.from("payments").insert({
      invoice_id: selectedInvoice.id,
      customer_id: selectedInvoice.customer_id,
      amount: amount,
      payment_mode: "cash",
      payment_date: format(new Date(), "yyyy-MM-dd"),
    });

    if (invoiceError || paymentError) {
      toast({
        title: "Error recording payment",
        description: invoiceError?.message || paymentError?.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Payment recorded",
        description: `₹${amount.toLocaleString()} payment recorded`,
      });
      setPaymentDialogOpen(false);
      setPaymentAmount("");
      setSelectedInvoice(null);
      fetchData();
    }
  };

  const filteredInvoices = statusFilter === "all" 
    ? invoices 
    : invoices.filter(i => i.payment_status === statusFilter);

  const stats = {
    total: invoices.reduce((sum, i) => sum + Number(i.final_amount), 0),
    collected: invoices.reduce((sum, i) => sum + Number(i.paid_amount), 0),
    pending: invoices.filter(i => i.payment_status === "pending").reduce((sum, i) => sum + Number(i.final_amount), 0),
    overdue: invoices.filter(i => i.payment_status === "overdue").reduce((sum, i) => sum + (Number(i.final_amount) - Number(i.paid_amount)), 0),
  };

  const columns = [
    {
      key: "invoice_number",
      header: "Invoice #",
      render: (item: InvoiceWithCustomer) => (
        <span className="font-mono font-medium text-primary">{item.invoice_number}</span>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (item: InvoiceWithCustomer) => (
        <span className="font-medium">{item.customer?.name}</span>
      ),
    },
    {
      key: "period",
      header: "Billing Period",
      render: (item: InvoiceWithCustomer) => (
        <span className="text-sm">
          {format(new Date(item.billing_period_start), "dd MMM")} - {format(new Date(item.billing_period_end), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      key: "final_amount",
      header: "Amount",
      render: (item: InvoiceWithCustomer) => (
        <span className="font-semibold">₹{Number(item.final_amount).toLocaleString()}</span>
      ),
    },
    {
      key: "paid_amount",
      header: "Paid",
      render: (item: InvoiceWithCustomer) => (
        <span className="text-success">₹{Number(item.paid_amount).toLocaleString()}</span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      render: (item: InvoiceWithCustomer) => {
        const balance = Number(item.final_amount) - Number(item.paid_amount);
        return (
          <span className={balance > 0 ? "text-destructive font-medium" : ""}>
            ₹{balance.toLocaleString()}
          </span>
        );
      },
    },
    {
      key: "payment_status",
      header: "Status",
      render: (item: InvoiceWithCustomer) => <StatusBadge status={item.payment_status} />,
    },
    {
      key: "download",
      header: "Invoice",
      render: (item: InvoiceWithCustomer) => (
        <InvoicePDFGenerator invoice={item} />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: InvoiceWithCustomer) => (
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => {
            setSelectedInvoice(item);
            setPaymentAmount("");
            setPaymentDialogOpen(true);
          }}
          disabled={item.payment_status === "paid"}
        >
          <IndianRupee className="h-3 w-3" /> Pay
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Invoices"
        description="Manage invoices and payments"
        icon={Receipt}
        action={{
          label: "Create Invoice",
          onClick: () => setDialogOpen(true),
        }}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">₹{stats.total.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Total Billed</p>
          </CardContent>
        </Card>
        <Card className="border-success/30">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-success">₹{stats.collected.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Collected</p>
          </CardContent>
        </Card>
        <Card className="border-warning/30">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-warning">₹{stats.pending.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-destructive">₹{stats.overdue.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="partial">Partial</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        data={filteredInvoices}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search by invoice number, customer..."
        emptyMessage="No invoices found. Create your first invoice."
      />

      {/* Create Invoice Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>Generate a new invoice for a customer</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select
                value={formData.customer_id}
                onValueChange={(v) => setFormData({ ...formData, customer_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={formData.billing_period_start}
                  onChange={(e) => setFormData({ ...formData, billing_period_start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={formData.billing_period_end}
                  onChange={(e) => setFormData({ ...formData, billing_period_end: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Total Amount (₹) *</Label>
                <Input
                  type="number"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Discount (₹)</Label>
                <Input
                  type="number"
                  value={formData.discount_amount}
                  onChange={(e) => setFormData({ ...formData, discount_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            {formData.total_amount && (
              <div className="rounded-lg bg-muted p-4">
                <div className="flex justify-between text-sm">
                  <span>Total:</span>
                  <span>₹{parseFloat(formData.total_amount || "0").toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Discount:</span>
                  <span>-₹{parseFloat(formData.discount_amount || "0").toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold mt-2 pt-2 border-t">
                  <span>Final Amount:</span>
                  <span>₹{(parseFloat(formData.total_amount || "0") - parseFloat(formData.discount_amount || "0")).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Invoice
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Invoice: {selectedInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted p-4 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Invoice Total:</span>
                  <span>₹{Number(selectedInvoice.final_amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-success">
                  <span>Already Paid:</span>
                  <span>₹{Number(selectedInvoice.paid_amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold pt-2 border-t">
                  <span>Balance Due:</span>
                  <span className="text-destructive">
                    ₹{(Number(selectedInvoice.final_amount) - Number(selectedInvoice.paid_amount)).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Payment Amount (₹)</Label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount"
                  max={Number(selectedInvoice.final_amount) - Number(selectedInvoice.paid_amount)}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}>
              Record Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
