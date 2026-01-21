import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  User, Phone, MapPin, Calendar, Mail,
  Clock, CheckCircle, XCircle, AlertCircle,
  Package, Receipt, Truck, DollarSign,
  TrendingUp, CreditCard, Palmtree, ShoppingCart
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { devError } from "@/lib/utils";

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

interface Delivery {
  id: string;
  delivery_date: string;
  delivery_time: string | null;
  status: string;
  notes: string | null;
  items: DeliveryItem[];
}

interface DeliveryItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  total_amount: number;
  final_amount: number;
  paid_amount: number | null;
  payment_status: string;
  due_date: string | null;
  created_at: string;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_mode: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

interface Subscription {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  custom_price: number | null;
  base_price: number;
  is_active: boolean;
}

interface Vacation {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  is_active: boolean;
  created_at: string;
}

interface LedgerEntry {
  id: string;
  transaction_date: string;
  transaction_type: string;
  description: string;
  debit_amount: number | null;
  credit_amount: number | null;
  running_balance: number | null;
}

interface CustomerDetailDialogProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerDetailDialog({ customer, open, onOpenChange }: CustomerDetailDialogProps) {
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    if (customer && open) {
      fetchCustomerData();
    }
  }, [customer, open]);

  const fetchCustomerData = async () => {
    if (!customer) return;
    
    setLoading(true);
    try {
      const [delRes, invRes, payRes, subRes, vacRes, ledgerRes] = await Promise.all([
        // Fetch deliveries with items
        supabase
          .from("deliveries")
          .select(`
            id, delivery_date, delivery_time, status, notes,
            delivery_items(id, quantity, unit_price, total_amount, products(name))
          `)
          .eq("customer_id", customer.id)
          .order("delivery_date", { ascending: false })
          .limit(50),
        // Fetch invoices
        supabase
          .from("invoices")
          .select("*")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false })
          .limit(30),
        // Fetch payments
        supabase
          .from("payments")
          .select("*")
          .eq("customer_id", customer.id)
          .order("payment_date", { ascending: false })
          .limit(30),
        // Fetch subscriptions
        supabase
          .from("customer_products")
          .select("*, products(name, base_price)")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false }),
        // Fetch vacations
        supabase
          .from("customer_vacations")
          .select("*")
          .eq("customer_id", customer.id)
          .order("start_date", { ascending: false })
          .limit(20),
        // Fetch ledger
        supabase
          .from("customer_ledger")
          .select("*")
          .eq("customer_id", customer.id)
          .order("transaction_date", { ascending: false })
          .limit(50),
      ]);

      // Format deliveries
      if (delRes.data) {
        const formattedDeliveries = delRes.data.map((d: any) => ({
          id: d.id,
          delivery_date: d.delivery_date,
          delivery_time: d.delivery_time,
          status: d.status,
          notes: d.notes,
          items: (d.delivery_items || []).map((item: any) => ({
            id: item.id,
            product_name: item.products?.name || "Unknown",
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_amount: item.total_amount,
          })),
        }));
        setDeliveries(formattedDeliveries);
      }

      if (invRes.data) setInvoices(invRes.data);
      if (payRes.data) setPayments(payRes.data);
      
      // Format subscriptions
      if (subRes.data) {
        const formattedSubs = subRes.data.map((s: any) => ({
          id: s.id,
          product_id: s.product_id,
          product_name: s.products?.name || "Unknown",
          quantity: s.quantity,
          custom_price: s.custom_price,
          base_price: s.products?.base_price || 0,
          is_active: s.is_active,
        }));
        setSubscriptions(formattedSubs);
      }
      
      if (vacRes.data) setVacations(vacRes.data);
      if (ledgerRes.data) setLedger(ledgerRes.data);
    } catch (error) {
      devError("Error fetching customer data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!customer) return null;

  // Calculate stats
  const totalDelivered = deliveries.filter(d => d.status === "delivered").length;
  const totalMissed = deliveries.filter(d => d.status === "missed").length;
  const totalPending = deliveries.filter(d => d.status === "pending").length;
  
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalInvoiced = invoices.reduce((sum, i) => sum + i.final_amount, 0);
  const paidInvoices = invoices.filter(i => i.payment_status === "paid").length;
  const pendingInvoices = invoices.filter(i => i.payment_status === "pending" || i.payment_status === "partial").length;

  const activeSubscriptions = subscriptions.filter(s => s.is_active).length;
  const monthlyValue = subscriptions
    .filter(s => s.is_active)
    .reduce((sum, s) => sum + (s.custom_price || s.base_price) * s.quantity * 30, 0);

  const tenure = customer.created_at 
    ? differenceInDays(new Date(), parseISO(customer.created_at))
    : null;

  const statusVariants: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
    delivered: "default",
    missed: "destructive",
    pending: "secondary",
    partial: "outline",
    paid: "default",
    overdue: "destructive",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {customer.name}
            <Badge variant={customer.is_active ? "default" : "secondary"} className="ml-2">
              {customer.is_active ? "Active" : "Inactive"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-[300px]" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(90vh-120px)] pr-4">
            {/* Customer Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Phone className="h-4 w-4" />
                    <span className="text-xs">Phone</span>
                  </div>
                  <p className="font-semibold">{customer.phone || "Not provided"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <MapPin className="h-4 w-4" />
                    <span className="text-xs">Area</span>
                  </div>
                  <p className="font-semibold">{customer.area || "Not set"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Package className="h-4 w-4" />
                    <span className="text-xs">Subscription</span>
                  </div>
                  <p className="font-semibold capitalize">{customer.subscription_type}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4" />
                    <span className="text-xs">Customer Since</span>
                  </div>
                  <p className="font-semibold">
                    {tenure !== null ? `${Math.floor(tenure / 365)}y ${Math.floor((tenure % 365) / 30)}m` : "N/A"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Contact & Address */}
            {(customer.email || customer.address) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {customer.email && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Mail className="h-4 w-4" />
                        <span className="text-xs">Email</span>
                      </div>
                      <p className="text-sm">{customer.email}</p>
                    </CardContent>
                  </Card>
                )}
                {customer.address && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <MapPin className="h-4 w-4" />
                        <span className="text-xs">Address</span>
                      </div>
                      <p className="text-sm">{customer.address}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Financial Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-red-50 dark:bg-red-950/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-red-600 mb-1">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-xs">Amount Due</span>
                  </div>
                  <p className="font-bold text-xl text-red-700 dark:text-red-400">
                    ₹{Number(customer.credit_balance).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-950/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-green-600 mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-xs">Advance Balance</span>
                  </div>
                  <p className="font-bold text-xl text-green-700 dark:text-green-400">
                    ₹{Number(customer.advance_balance).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 dark:bg-blue-950/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs">Total Paid</span>
                  </div>
                  <p className="font-bold text-xl text-blue-700 dark:text-blue-400">
                    ₹{totalPaid.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{payments.length} payments</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 dark:bg-purple-950/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-purple-600 mb-1">
                    <ShoppingCart className="h-4 w-4" />
                    <span className="text-xs">Monthly Value</span>
                  </div>
                  <p className="font-bold text-xl text-purple-700 dark:text-purple-400">
                    ₹{monthlyValue.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{activeSubscriptions} active items</p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="deliveries" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="deliveries" className="text-xs">
                  Deliveries ({deliveries.length})
                </TabsTrigger>
                <TabsTrigger value="invoices" className="text-xs">
                  Invoices ({invoices.length})
                </TabsTrigger>
                <TabsTrigger value="payments" className="text-xs">
                  Payments ({payments.length})
                </TabsTrigger>
                <TabsTrigger value="subscriptions" className="text-xs">
                  Products ({subscriptions.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs">
                  Ledger ({ledger.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="deliveries" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Delivery History</span>
                      <div className="flex gap-2 text-xs">
                        <Badge variant="default" className="font-normal">
                          <CheckCircle className="h-3 w-3 mr-1" /> {totalDelivered}
                        </Badge>
                        <Badge variant="destructive" className="font-normal">
                          <XCircle className="h-3 w-3 mr-1" /> {totalMissed}
                        </Badge>
                        <Badge variant="secondary" className="font-normal">
                          <Clock className="h-3 w-3 mr-1" /> {totalPending}
                        </Badge>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-2">
                        {deliveries.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No deliveries yet</p>
                        ) : (
                          deliveries.map((delivery) => (
                            <div 
                              key={delivery.id} 
                              className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full ${
                                    delivery.status === "delivered" ? "bg-green-500" :
                                    delivery.status === "missed" ? "bg-red-500" : "bg-amber-500"
                                  }`} />
                                  <div>
                                    <p className="font-medium">
                                      {format(parseISO(delivery.delivery_date), "EEE, dd MMM yyyy")}
                                    </p>
                                    {delivery.delivery_time && (
                                      <p className="text-xs text-muted-foreground">{delivery.delivery_time}</p>
                                    )}
                                  </div>
                                </div>
                                <Badge variant={statusVariants[delivery.status] || "secondary"}>
                                  {delivery.status}
                                </Badge>
                              </div>
                              {delivery.items.length > 0 && (
                                <div className="mt-2 pl-5 text-xs text-muted-foreground">
                                  {delivery.items.map((item) => (
                                    <div key={item.id} className="flex justify-between">
                                      <span>{item.product_name} × {item.quantity}</span>
                                      <span>₹{item.total_amount.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="invoices" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Invoice History</span>
                      <div className="flex gap-2 text-xs">
                        <Badge variant="default" className="font-normal">
                          <CheckCircle className="h-3 w-3 mr-1" /> {paidInvoices} Paid
                        </Badge>
                        <Badge variant="secondary" className="font-normal">
                          <AlertCircle className="h-3 w-3 mr-1" /> {pendingInvoices} Pending
                        </Badge>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-2">
                        {invoices.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No invoices generated</p>
                        ) : (
                          invoices.map((invoice) => (
                            <div 
                              key={invoice.id} 
                              className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <p className="font-medium">{invoice.invoice_number}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(parseISO(invoice.billing_period_start), "dd MMM")} - {format(parseISO(invoice.billing_period_end), "dd MMM yyyy")}
                                  </p>
                                </div>
                                <Badge variant={statusVariants[invoice.payment_status] || "secondary"}>
                                  {invoice.payment_status}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                                <div>
                                  <span className="text-muted-foreground">Total</span>
                                  <p className="font-medium">₹{invoice.total_amount.toLocaleString()}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Final</span>
                                  <p className="font-medium">₹{invoice.final_amount.toLocaleString()}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Paid</span>
                                  <p className="font-medium text-green-600">₹{(invoice.paid_amount || 0).toLocaleString()}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payments" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Payment History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-2">
                        {payments.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No payments recorded</p>
                        ) : (
                          payments.map((payment) => (
                            <div 
                              key={payment.id} 
                              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                            >
                              <div>
                                <p className="font-medium">
                                  {format(parseISO(payment.payment_date), "EEE, dd MMM yyyy")}
                                </p>
                                <p className="text-xs text-muted-foreground capitalize">
                                  {payment.payment_mode}
                                  {payment.reference_number && ` • Ref: ${payment.reference_number}`}
                                </p>
                                {payment.notes && (
                                  <p className="text-xs text-muted-foreground mt-1">{payment.notes}</p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-green-600">+₹{payment.amount.toLocaleString()}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="subscriptions" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Subscribed Products</span>
                      <Badge variant="outline">{activeSubscriptions} Active</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-2">
                        {subscriptions.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No subscriptions</p>
                        ) : (
                          subscriptions.map((sub) => (
                            <div 
                              key={sub.id} 
                              className={`flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors ${
                                !sub.is_active ? "opacity-50" : ""
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <Package className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">{sub.product_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Qty: {sub.quantity} × ₹{(sub.custom_price || sub.base_price).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant={sub.is_active ? "default" : "secondary"}>
                                  {sub.is_active ? "Active" : "Paused"}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-1">
                                  ₹{((sub.custom_price || sub.base_price) * sub.quantity).toLocaleString()}/day
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Vacation History */}
                {vacations.length > 0 && (
                  <Card className="mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Palmtree className="h-4 w-4" />
                        Vacation History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {vacations.slice(0, 5).map((vacation) => (
                          <div 
                            key={vacation.id} 
                            className="flex items-center justify-between p-2 rounded-lg border text-sm"
                          >
                            <div>
                              <p className="font-medium">
                                {format(parseISO(vacation.start_date), "dd MMM")} - {format(parseISO(vacation.end_date), "dd MMM yyyy")}
                              </p>
                              {vacation.reason && (
                                <p className="text-xs text-muted-foreground">{vacation.reason}</p>
                              )}
                            </div>
                            <Badge variant={vacation.is_active ? "default" : "secondary"}>
                              {vacation.is_active ? "Active" : "Past"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Transaction Ledger</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-1">
                        {ledger.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No ledger entries</p>
                        ) : (
                          ledger.map((entry) => (
                            <div 
                              key={entry.id} 
                              className="flex items-center justify-between p-2 rounded border-b text-sm hover:bg-accent/30 transition-colors"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-xs">
                                  {format(parseISO(entry.transaction_date), "dd MMM yyyy")}
                                </p>
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {entry.description}
                                </p>
                              </div>
                              <div className="flex items-center gap-4 text-xs">
                                {entry.debit_amount && entry.debit_amount > 0 ? (
                                  <span className="text-red-600 font-medium">
                                    -₹{entry.debit_amount.toLocaleString()}
                                  </span>
                                ) : null}
                                {entry.credit_amount && entry.credit_amount > 0 ? (
                                  <span className="text-green-600 font-medium">
                                    +₹{entry.credit_amount.toLocaleString()}
                                  </span>
                                ) : null}
                                {entry.running_balance !== null && (
                                  <span className="text-muted-foreground min-w-[60px] text-right">
                                    Bal: ₹{entry.running_balance.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
