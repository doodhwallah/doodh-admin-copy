import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Receipt, CreditCard, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { supabase } from '@/integrations/supabase/client';
import { devError } from '@/lib/utils';

interface Invoice {
  id: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  total_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_status: 'pending' | 'partial' | 'paid' | 'overdue';
  due_date: string | null;
}

interface LedgerEntry {
  id: string;
  transaction_date: string;
  transaction_type: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
}

const statusStyles = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  partial: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export default function CustomerBilling() {
  const { customerId, customerData } = useCustomerAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBillingData = async () => {
      if (!customerId) {
        setLoading(false);
        return;
      }

      try {
        // Fetch invoices and ledger entries in parallel for faster loading
        const [invoiceRes, ledgerRes] = await Promise.all([
          supabase
            .from('invoices')
            .select('*')
            .eq('customer_id', customerId)
            .order('billing_period_end', { ascending: false })
            .limit(12),
          supabase
            .from('customer_ledger')
            .select('*')
            .eq('customer_id', customerId)
            .order('transaction_date', { ascending: false })
            .limit(30)
        ]);

        if (invoiceRes.error) throw invoiceRes.error;
        if (ledgerRes.error) throw ledgerRes.error;

        setInvoices((invoiceRes.data || []).map((inv) => ({
          ...inv,
          payment_status: (inv.payment_status || 'pending') as Invoice['payment_status'],
        })));

        setLedger((ledgerRes.data || []).map((entry) => ({
          id: entry.id,
          transaction_date: entry.transaction_date,
          transaction_type: entry.transaction_type,
          description: entry.description,
          debit_amount: entry.debit_amount || 0,
          credit_amount: entry.credit_amount || 0,
          running_balance: entry.running_balance || 0,
        })));
      } catch (err) {
        devError('Error fetching billing data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBillingData();
  }, [customerId]);

  // Calculate balances from real customer data
  const creditBalance = customerData?.credit_balance || 0;
  const advanceBalance = customerData?.advance_balance || 0;
  const outstandingBalance = creditBalance - advanceBalance;
  const unpaidInvoices = invoices.filter(i => i.payment_status !== 'paid');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Billing & Payments</h1>
        <p className="text-muted-foreground">View invoices and payment history</p>
      </div>

      {/* Balance Summary */}
      <Card className={outstandingBalance > 0 ? "border-destructive" : "border-green-500"}>
        <CardHeader className="pb-2">
          <CardDescription>Current Balance</CardDescription>
          <CardTitle className={`text-3xl ${outstandingBalance > 0 ? 'text-destructive' : 'text-green-600'}`}>
            ₹{Math.abs(outstandingBalance).toFixed(2)}
            {outstandingBalance < 0 && <span className="text-sm font-normal ml-2">(Credit Balance)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-muted-foreground">Total Due</p>
              <p className="font-semibold text-destructive">₹{creditBalance.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Advance Paid</p>
              <p className="font-semibold text-green-600">₹{advanceBalance.toFixed(2)}</p>
            </div>
          </div>
          {unpaidInvoices.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-800 dark:text-amber-300">
                {unpaidInvoices.length} unpaid invoice{unpaidInvoices.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="invoices">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="ledger">Transaction History</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4 space-y-3">
          {loading ? (
            Array(3).fill(0).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))
          ) : invoices.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium">No invoices yet</p>
                <p className="text-muted-foreground">Your invoices will appear here</p>
              </CardContent>
            </Card>
          ) : (
            invoices.map(invoice => (
              <Card key={invoice.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{invoice.invoice_number}</p>
                        <Badge className={statusStyles[invoice.payment_status]}>
                          {invoice.payment_status.charAt(0).toUpperCase() + invoice.payment_status.slice(1)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(new Date(invoice.billing_period_start), 'dd MMM')} - {format(new Date(invoice.billing_period_end), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">₹{invoice.final_amount.toFixed(2)}</p>
                      {invoice.paid_amount > 0 && invoice.payment_status !== 'paid' && (
                        <p className="text-xs text-muted-foreground">
                          Paid: ₹{invoice.paid_amount.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                  {invoice.due_date && invoice.payment_status !== 'paid' && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Due: {format(new Date(invoice.due_date), 'dd MMM yyyy')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="ledger" className="mt-4 space-y-3">
          {loading ? (
            Array(5).fill(0).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            ))
          ) : ledger.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium">No transactions yet</p>
                <p className="text-muted-foreground">Your transaction history will appear here</p>
              </CardContent>
            </Card>
          ) : (
            ledger.map(entry => (
              <Card key={entry.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(entry.transaction_date), 'dd MMM yyyy')} • {entry.transaction_type}
                      </p>
                    </div>
                    <div className="text-right">
                      {entry.debit_amount > 0 && (
                        <p className="text-destructive font-semibold">+₹{entry.debit_amount.toFixed(2)}</p>
                      )}
                      {entry.credit_amount > 0 && (
                        <p className="text-green-600 font-semibold">-₹{entry.credit_amount.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
