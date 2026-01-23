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
import { Receipt, IndianRupee, Loader2, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { InvoicePDFGenerator } from "@/components/billing/InvoicePDFGenerator";

interface Customer {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  unit: string;
  base_price: number;
  is_active: boolean;
}

interface LineItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: string;
  rate: string;
  unit: string;
  amount: number;
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

const createEmptyLineItem = (): LineItem => ({
  id: crypto.randomUUID(),
  product_id: "",
  product_name: "",
  quantity: "",
  rate: "",
  unit: "",
  amount: 0,
});

export default function BillingPage() {
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithCustomer | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([createEmptyLineItem()]);
  const [formData, setFormData] = useState({
    customer_id: "",
    billing_period_start: format(new Date(new Date().setDate(1)), "yyyy-MM-dd"),
    billing_period_end: format(new Date(), "yyyy-MM-dd"),
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
      const [customerRes, invoiceRes, productRes] = await Promise.all([
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
          .order("created_at", { ascending: false }),
        supabase
          .from("products")
          .select("id, name, unit, base_price, is_active")
          .eq("is_active", true)
          .order("name")
      ]);

      setCustomers(customerRes.data || []);
      setProducts(productRes.data || []);

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

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const discountAmount = parseFloat(formData.discount_amount) || 0;
  const finalAmount = subtotal - discountAmount;

  const handleProductChange = (itemId: string, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    setLineItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const qty = parseFloat(item.quantity) || 0;
        const rate = product.base_price;
        return {
          ...item,
          product_id: productId,
          product_name: product.name,
          unit: product.unit,
          rate: rate.toString(),
          amount: qty * rate,
        };
      }
      return item;
    }));
  };

  const handleQuantityChange = (itemId: string, quantity: string) => {
    setLineItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const qty = parseFloat(quantity) || 0;
        const rate = parseFloat(item.rate) || 0;
        return {
          ...item,
          quantity,
          amount: qty * rate,
        };
      }
      return item;
    }));
  };

  const handleRateChange = (itemId: string, rate: string) => {
    setLineItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const qty = parseFloat(item.quantity) || 0;
        const r = parseFloat(rate) || 0;
        return {
          ...item,
          rate,
          amount: qty * r,
        };
      }
      return item;
    }));
  };

  const addLineItem = () => {
    setLineItems(prev => [...prev, createEmptyLineItem()]);
  };

  const removeLineItem = (itemId: string) => {
    if (lineItems.length === 1) return;
    setLineItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleCreateInvoice = async () => {
    const validItems = lineItems.filter(item => item.product_id && parseFloat(item.quantity) > 0);
    
    if (!formData.customer_id || validItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select a customer and add at least one item",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("invoices").insert({
      invoice_number: generateInvoiceNumber(),
      customer_id: formData.customer_id,
      billing_period_start: formData.billing_period_start,
      billing_period_end: formData.billing_period_end,
      total_amount: subtotal,
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
      setLineItems([createEmptyLineItem()]);
      setFormData({
        customer_id: "",
        billing_period_start: format(new Date(new Date().setDate(1)), "yyyy-MM-dd"),
        billing_period_end: format(new Date(), "yyyy-MM-dd"),
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>Add products with quantity and rate to generate invoice</DialogDescription>
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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>
              
              <div className="space-y-3">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                  <div className="col-span-4">Product</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-1 text-center">Unit</div>
                  <div className="col-span-2 text-right">Rate (₹)</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-1"></div>
                </div>
                
                {lineItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Select
                        value={item.product_id}
                        onValueChange={(v) => handleProductChange(item.id, v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} (₹{p.base_price}/{p.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                        placeholder="0"
                        className="h-9 text-right"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="col-span-1 text-center text-sm text-muted-foreground">
                      {item.unit || "-"}
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        value={item.rate}
                        onChange={(e) => handleRateChange(item.id, e.target.value)}
                        placeholder="0.00"
                        className="h-9 text-right"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="col-span-2 text-right font-medium">
                      ₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLineItem(item.id)}
                        disabled={lineItems.length === 1}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Discount (₹)</Label>
              <Input
                type="number"
                value={formData.discount_amount}
                onChange={(e) => setFormData({ ...formData, discount_amount: e.target.value })}
                placeholder="0.00"
                className="max-w-[200px]"
              />
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-success">
                  <span>Discount:</span>
                  <span>-₹{discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                <span>Grand Total:</span>
                <span className="text-primary">₹{finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={saving || subtotal === 0}>
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
