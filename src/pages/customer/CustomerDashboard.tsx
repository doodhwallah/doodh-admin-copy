import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, Calendar, Receipt, 
  Pause, Play, ChevronRight, AlertCircle 
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { supabase } from '@/integrations/supabase/client';
import { getProductName } from '@/lib/supabase-helpers';
import { devError } from '@/lib/utils';

interface DeliverySummary {
  pending: number;
  delivered: number;
  total: number;
}

interface SubscriptionItem {
  id: string;
  product_name: string;
  quantity: number;
  custom_price: number | null;
  is_active: boolean;
}

export default function CustomerDashboard() {
  const { customerData, customerId } = useCustomerAuth();
  const navigate = useNavigate();
  const [deliverySummary, setDeliverySummary] = useState<DeliverySummary>({ pending: 0, delivered: 0, total: 0 });
  const [subscriptionItems, setSubscriptionItems] = useState<SubscriptionItem[]>([]);
  const [isOnVacation, setIsOnVacation] = useState(false);
  const [loading, setLoading] = useState(true);

  // Get balance from customerData
  const creditBalance = customerData?.credit_balance || 0;
  const advanceBalance = customerData?.advance_balance || 0;
  const outstandingBalance = creditBalance - advanceBalance;

  useEffect(() => {
    if (customerId) {
      fetchDashboardData();
    }
  }, [customerId]);

  const fetchDashboardData = async () => {
    if (!customerId) return;
    
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Fetch all data in parallel for faster loading
      const [subscriptionsRes, deliveriesRes, vacationRes] = await Promise.all([
        supabase
          .from('customer_products')
          .select(`
            id,
            quantity,
            custom_price,
            is_active,
            products (name)
          `)
          .eq('customer_id', customerId),
        supabase
          .from('deliveries')
          .select('id, status')
          .eq('customer_id', customerId)
          .eq('delivery_date', today),
        supabase
          .from('customer_vacations')
          .select('id')
          .eq('customer_id', customerId)
          .eq('is_active', true)
          .lte('start_date', today)
          .gte('end_date', today)
          .maybeSingle()
      ]);

      if (subscriptionsRes.error) throw subscriptionsRes.error;
      if (deliveriesRes.error) throw deliveriesRes.error;
      if (vacationRes.error) throw vacationRes.error;

      // Process subscriptions
      const formattedSubs: SubscriptionItem[] = (subscriptionsRes.data || []).map(sub => ({
        id: sub.id,
        product_name: getProductName(sub.products),
        quantity: sub.quantity,
        custom_price: sub.custom_price,
        is_active: sub.is_active ?? true
      }));
      setSubscriptionItems(formattedSubs);

      // Process deliveries
      const deliveries = deliveriesRes.data || [];
      const delivered = deliveries.filter(d => d.status === 'delivered').length;
      const pending = deliveries.filter(d => d.status === 'pending').length;
      setDeliverySummary({
        delivered,
        pending,
        total: deliveries.length
      });

      // Process vacation status
      setIsOnVacation(!!vacationRes.data);

    } catch (error) {
      devError('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Vacation Banner */}
      {isOnVacation && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="flex items-center gap-3 py-4">
            <Pause className="h-5 w-5 text-amber-600" />
            <div className="flex-1">
              <p className="font-medium text-amber-800 dark:text-amber-200">Deliveries Paused</p>
              <p className="text-sm text-amber-600 dark:text-amber-400">Your subscription is currently on vacation</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/customer/subscription')}>
              Manage
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Balance Card */}
      <Card className={outstandingBalance > 0 ? "border-destructive" : "border-green-500"}>
        <CardHeader className="pb-2">
          <CardDescription>Outstanding Balance</CardDescription>
          <CardTitle className={`text-3xl ${outstandingBalance > 0 ? 'text-destructive' : 'text-green-600'}`}>
            ₹{Math.abs(outstandingBalance).toFixed(2)}
            {outstandingBalance < 0 && <span className="text-sm font-normal ml-2">(Credit)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Due: ₹{creditBalance.toFixed(2)}</span>
            <span>Advance: ₹{advanceBalance.toFixed(2)}</span>
          </div>
          <Button variant="outline" className="w-full mt-4" onClick={() => navigate('/customer/billing')}>
            <Receipt className="mr-2 h-4 w-4" />
            View Billing Details
          </Button>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/customer/deliveries')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-full p-3">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{deliverySummary.delivered}/{deliverySummary.total}</p>
                <p className="text-sm text-muted-foreground">Today's Deliveries</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/customer/subscription')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-full p-3">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{subscriptionItems.filter(s => s.is_active).length}</p>
                <p className="text-sm text-muted-foreground">Active Products</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">My Subscription</CardTitle>
            <CardDescription>Your daily milk products</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/customer/subscription')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {subscriptionItems.length === 0 ? (
            <div className="text-center py-6">
              <Package className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No active subscription</p>
              <Button variant="link" onClick={() => navigate('/customer/products')}>
                Browse Products
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptionItems.slice(0, 3).map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant={item.is_active ? "default" : "secondary"}>
                      {item.is_active ? 'Active' : 'Paused'}
                    </Badge>
                    <span className="font-medium">{item.product_name}</span>
                  </div>
                  <span className="text-muted-foreground">{item.quantity}x daily</span>
                </div>
              ))}
              {subscriptionItems.length > 3 && (
                <Button variant="ghost" className="w-full" onClick={() => navigate('/customer/subscription')}>
                  +{subscriptionItems.length - 3} more products
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button 
          variant="outline" 
          className="h-auto py-4 flex-col gap-2"
          onClick={() => navigate('/customer/subscription')}
        >
          {isOnVacation ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          <span>{isOnVacation ? 'Resume Delivery' : 'Pause Delivery'}</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-auto py-4 flex-col gap-2"
          onClick={() => navigate('/customer/profile')}
        >
          <AlertCircle className="h-5 w-5" />
          <span>Get Support</span>
        </Button>
      </div>
    </div>
  );
}
