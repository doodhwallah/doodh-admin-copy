import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { devError } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, addDays } from "date-fns";
import { FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Customer {
  id: string;
  name: string;
  billing_cycle: string;
}

interface DeliverySummary {
  customer_id: string;
  customer_name: string;
  total_deliveries: number;
  total_amount: number;
  has_invoice: boolean;
}

// Type for delivery query with customer and items
interface DeliveryWithCustomer {
  customer_id: string;
  customers: { name: string } | null;
  delivery_items: Array<{ total_amount: number }> | null;
}

interface BulkInvoiceGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function BulkInvoiceGenerator({
  open,
  onOpenChange,
  onComplete,
}: BulkInvoiceGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [startDate, setStartDate] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(
    format(endOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [summaries, setSummaries] = useState<DeliverySummary[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchDeliverySummary();
    }
  }, [open, startDate, endDate]);

  const fetchDeliverySummary = async () => {
    setLoading(true);
    
    // Fetch deliveries with items for the period
    const { data: deliveries, error: deliveryError } = await supabase
      .from("deliveries")
      .select(`
        id,
        customer_id,
        delivery_date,
        status,
        customers!inner(id, name, billing_cycle),
        delivery_items(quantity, unit_price, total_amount)
      `)
      .gte("delivery_date", startDate)
      .lte("delivery_date", endDate)
      .eq("status", "delivered");

    if (deliveryError) {
      toast({
        title: "Error fetching deliveries",
        description: deliveryError.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Fetch existing invoices for the period
    const { data: existingInvoices, error: invoiceError } = await supabase
      .from("invoices")
      .select("customer_id")
      .gte("billing_period_start", startDate)
      .lte("billing_period_end", endDate);

    if (invoiceError) {
      toast({
        title: "Error fetching invoices",
        description: invoiceError.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const invoicedCustomers = new Set(existingInvoices?.map((i) => i.customer_id) || []);

    // Aggregate by customer with proper typing
    const customerMap = new Map<string, DeliverySummary>();
    const typedDeliveries = (deliveries || []) as DeliveryWithCustomer[];
    
    typedDeliveries.forEach((delivery) => {
      const customerId = delivery.customer_id;
      const customerName = delivery.customers?.name || "Unknown";
      const deliveryTotal = (delivery.delivery_items || []).reduce(
        (sum, item) => sum + Number(item.total_amount),
        0
      );

      if (customerMap.has(customerId)) {
        const existing = customerMap.get(customerId)!;
        existing.total_deliveries += 1;
        existing.total_amount += deliveryTotal;
      } else {
        customerMap.set(customerId, {
          customer_id: customerId,
          customer_name: customerName,
          total_deliveries: 1,
          total_amount: deliveryTotal,
          has_invoice: invoicedCustomers.has(customerId),
        });
      }
    });

    const summaryList = Array.from(customerMap.values()).sort(
      (a, b) => b.total_amount - a.total_amount
    );
    
    setSummaries(summaryList);
    
    // Pre-select customers without invoices
    const toSelect = summaryList
      .filter((s) => !s.has_invoice && s.total_amount > 0)
      .map((s) => s.customer_id);
    setSelectedCustomers(new Set(toSelect));
    
    setLoading(false);
  };

  const toggleCustomer = (customerId: string) => {
    const newSet = new Set(selectedCustomers);
    if (newSet.has(customerId)) {
      newSet.delete(customerId);
    } else {
      newSet.add(customerId);
    }
    setSelectedCustomers(newSet);
  };

  const selectAll = () => {
    const all = summaries
      .filter((s) => !s.has_invoice && s.total_amount > 0)
      .map((s) => s.customer_id);
    setSelectedCustomers(new Set(all));
  };

  const deselectAll = () => {
    setSelectedCustomers(new Set());
  };

  const generateInvoices = async () => {
    if (selectedCustomers.size === 0) {
      toast({
        title: "No customers selected",
        description: "Please select at least one customer",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    setProgress(0);

    const customersToInvoice = summaries.filter((s) => selectedCustomers.has(s.customer_id));
    let completed = 0;
    let failed = 0;

    for (const summary of customersToInvoice) {
      try {
        // Generate invoice number
        const invoiceNumber = `INV-${format(new Date(), "yyyyMMdd")}-${summary.customer_id.slice(0, 4).toUpperCase()}`;
        
        const dueDate = format(addDays(new Date(), 15), "yyyy-MM-dd");

        const { error } = await supabase.from("invoices").insert({
          customer_id: summary.customer_id,
          invoice_number: invoiceNumber,
          billing_period_start: startDate,
          billing_period_end: endDate,
          total_amount: summary.total_amount,
          tax_amount: 0,
          discount_amount: 0,
          final_amount: summary.total_amount,
          due_date: dueDate,
          payment_status: "pending",
        });

        if (error) {
          devError("Error creating invoice:", error);
          failed++;
        } else {
          await supabase.from("customer_ledger").insert({
            customer_id: summary.customer_id,
            transaction_date: new Date().toISOString().split("T")[0],
            transaction_type: "invoice",
            description: `Invoice ${invoiceNumber} for ${format(new Date(startDate), "MMM dd")} - ${format(new Date(endDate), "MMM dd")}`,
            debit_amount: summary.total_amount,
            credit_amount: 0,
          });
          completed++;
        }
      } catch (err) {
        devError("Error processing customer:", err);
        failed++;
      }

      setProgress(Math.round(((completed + failed) / customersToInvoice.length) * 100));
    }

    setGenerating(false);

    toast({
      title: "Invoice generation complete",
      description: `Created ${completed} invoices${failed > 0 ? `, ${failed} failed` : ""}`,
    });

    if (completed > 0) {
      onComplete();
      onOpenChange(false);
    }
  };

  const eligibleCount = summaries.filter((s) => !s.has_invoice && s.total_amount > 0).length;
  const totalSelectedAmount = summaries
    .filter((s) => selectedCustomers.has(s.customer_id))
    .reduce((sum, s) => sum + s.total_amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Bulk Invoice Generator
          </DialogTitle>
          <DialogDescription>
            Automatically generate invoices based on delivered orders
          </DialogDescription>
        </DialogHeader>

        {/* Date Range Selection */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>Billing Period Start</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Billing Period End</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={fetchDeliverySummary}>
                Refresh Data
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{summaries.length}</div>
              <p className="text-sm text-muted-foreground">Total Customers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-primary">{selectedCustomers.size}</div>
              <p className="text-sm text-muted-foreground">Selected for Invoice</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-success">
                ₹{totalSelectedAmount.toLocaleString()}
              </div>
              <p className="text-sm text-muted-foreground">Total Amount</p>
            </CardContent>
          </Card>
        </div>

        {/* Customer List */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Customers ({eligibleCount} eligible)
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  Deselect All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : summaries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No deliveries found for the selected period
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-center">Deliveries</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaries.map((summary) => (
                      <TableRow key={summary.customer_id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedCustomers.has(summary.customer_id)}
                            onCheckedChange={() => toggleCustomer(summary.customer_id)}
                            disabled={summary.has_invoice || summary.total_amount === 0}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {summary.customer_name}
                        </TableCell>
                        <TableCell className="text-center">
                          {summary.total_deliveries}
                        </TableCell>
                        <TableCell className="text-right">
                          ₹{summary.total_amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          {summary.has_invoice ? (
                            <div className="flex items-center justify-center gap-1 text-success">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-xs">Invoiced</span>
                            </div>
                          ) : summary.total_amount === 0 ? (
                            <div className="flex items-center justify-center gap-1 text-muted-foreground">
                              <AlertCircle className="h-4 w-4" />
                              <span className="text-xs">No Amount</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pending</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Progress Bar (shown during generation) */}
        {generating && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Generating invoices...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={generateInvoices}
            disabled={generating || selectedCustomers.size === 0}
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Generate {selectedCustomers.size} Invoice{selectedCustomers.size !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
