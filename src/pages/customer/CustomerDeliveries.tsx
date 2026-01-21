import { useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import { Calendar, Package, Check, X, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { supabase } from '@/integrations/supabase/client';
import { getProductName } from '@/lib/supabase-helpers';
import { devError } from '@/lib/utils';

interface DeliveryItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
}

interface Delivery {
  id: string;
  delivery_date: string;
  status: 'pending' | 'delivered' | 'missed' | 'partial';
  delivery_time: string | null;
  notes: string | null;
  items: DeliveryItem[];
}

// Type for Supabase delivery query result
interface DeliveryQueryResult {
  id: string;
  delivery_date: string;
  status: string | null;
  delivery_time: string | null;
  notes: string | null;
  delivery_items: Array<{
    quantity: number;
    unit_price: number;
    total_amount: number;
    products: { name: string } | null;
  }> | null;
}

const statusConfig = {
  pending: { color: 'bg-warning', icon: Clock, label: 'Pending' },
  delivered: { color: 'bg-success', icon: Check, label: 'Delivered' },
  missed: { color: 'bg-destructive', icon: X, label: 'Missed' },
  partial: { color: 'bg-info', icon: Package, label: 'Partial' },
};


export default function CustomerDeliveries() {
  const { customerId } = useCustomerAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(7); // Days to show

  useEffect(() => {
    const fetchDeliveries = async () => {
      if (!customerId) {
        setLoading(false);
        return;
      }

      try {
        const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
        const { data, error } = await supabase
          .from('deliveries')
          .select(`
            id,
            delivery_date,
            status,
            delivery_time,
            notes,
            delivery_items (
              quantity,
              unit_price,
              total_amount,
              products (name)
            )
          `)
          .eq('customer_id', customerId)
          .gte('delivery_date', startDate)
          .order('delivery_date', { ascending: false });

        if (error) throw error;

        const typedData = (data || []) as DeliveryQueryResult[];
        const formattedDeliveries: Delivery[] = typedData.map((d) => ({
          id: d.id,
          delivery_date: d.delivery_date,
          status: (d.status || 'pending') as Delivery['status'],
          delivery_time: d.delivery_time,
          notes: d.notes,
          items: (d.delivery_items || []).map((item) => ({
            product_name: item.products?.name || 'Unknown Product',
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_amount: item.total_amount,
          })),
        }));

        setDeliveries(formattedDeliveries);
      } catch (err) {
        devError('Error fetching deliveries:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDeliveries();
  }, [customerId]);

  // Filter deliveries based on date range
  const filteredDeliveries = deliveries.filter(d => {
    const deliveryDate = new Date(d.delivery_date);
    const startDate = subDays(new Date(), dateRange);
    return deliveryDate >= startDate;
  });

  const totalAmount = filteredDeliveries
    .filter(d => d.status === 'delivered' || d.status === 'partial')
    .reduce((sum, d) => sum + d.items.reduce((itemSum, item) => itemSum + item.total_amount, 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Delivery History</h1>
          <p className="text-muted-foreground">Track your daily deliveries</p>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="flex gap-2">
        {[7, 14, 30].map(days => (
          <Button
            key={days}
            variant={dateRange === days ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange(days)}
          >
            {days} Days
          </Button>
        ))}
      </div>

      {/* Summary Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-600">
                {filteredDeliveries.filter(d => d.status === 'delivered').length}
              </p>
              <p className="text-sm text-muted-foreground">Delivered</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">
                {filteredDeliveries.filter(d => d.status === 'pending').length}
              </p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">
                {filteredDeliveries.filter(d => d.status === 'missed').length}
              </p>
              <p className="text-sm text-muted-foreground">Missed</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t text-center">
            <p className="text-sm text-muted-foreground">Total Value (Delivered)</p>
            <p className="text-xl font-bold">₹{totalAmount.toFixed(2)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Deliveries List */}
      <div className="space-y-3">
        {loading ? (
          Array(5).fill(0).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))
        ) : filteredDeliveries.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No deliveries found</p>
              <p className="text-muted-foreground">No deliveries in the selected date range</p>
            </CardContent>
          </Card>
        ) : (
          filteredDeliveries.map(delivery => {
            const config = statusConfig[delivery.status];
            const StatusIcon = config.icon;
            const isExpanded = expandedId === delivery.id;
            const itemTotal = delivery.items.reduce((sum, item) => sum + item.total_amount, 0);

            return (
              <Card 
                key={delivery.id} 
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setExpandedId(isExpanded ? null : delivery.id)}
              >
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`${config.color} rounded-full p-2`}>
                        <StatusIcon className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {format(new Date(delivery.delivery_date), 'EEE, dd MMM yyyy')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {delivery.items.length} item{delivery.items.length !== 1 ? 's' : ''} • ₹{itemTotal.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={delivery.status === 'delivered' ? 'default' : 'secondary'}>
                        {config.label}
                      </Badge>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      {delivery.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span>{item.product_name} × {item.quantity}</span>
                          <span>₹{item.total_amount.toFixed(2)}</span>
                        </div>
                      ))}
                      {delivery.delivery_time && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Delivered at: {format(new Date(delivery.delivery_time), 'hh:mm a')}
                        </p>
                      )}
                      {delivery.notes && (
                        <p className="text-xs text-muted-foreground italic">
                          Note: {delivery.notes}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
