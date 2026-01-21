import { useEffect, useState } from 'react';
import { Plus, Minus, Pause, Package, Calendar, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { getProductName, getProductPrice } from '@/lib/supabase-helpers';
import { devError } from '@/lib/utils';

interface SubscriptionProduct {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  custom_price: number | null;
  base_price: number;
  is_active: boolean;
}

export default function CustomerSubscription() {
  const { customerId } = useCustomerAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [vacationStart, setVacationStart] = useState('');
  const [vacationEnd, setVacationEnd] = useState('');
  const [savingVacation, setSavingVacation] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (customerId) {
      fetchSubscriptions();
    }
  }, [customerId]);

  const fetchSubscriptions = async () => {
    if (!customerId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_products')
        .select(`
          id,
          product_id,
          quantity,
          custom_price,
          is_active,
          products (
            name,
            base_price
          )
        `)
        .eq('customer_id', customerId);

      if (error) throw error;

      const formattedProducts: SubscriptionProduct[] = (data || []).map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: getProductName(item.products),
        quantity: item.quantity,
        custom_price: item.custom_price,
        base_price: getProductPrice(item.products),
        is_active: item.is_active ?? true,
      }));

      setProducts(formattedProducts);
    } catch (error) {
      devError('Error fetching subscriptions:', error);
      toast({ title: "Error loading subscriptions", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (id: string, newQty: number) => {
    if (newQty < 0.25) return;
    
    try {
      const { error } = await supabase
        .from('customer_products')
        .update({ quantity: newQty })
        .eq('id', id);

      if (error) throw error;

      setProducts(prev => prev.map(p => p.id === id ? { ...p, quantity: newQty } : p));
      toast({ title: "Quantity updated" });
    } catch (error) {
      devError('Error updating quantity:', error);
      toast({ title: "Failed to update quantity", variant: "destructive" });
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('customer_products')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;

      setProducts(prev => prev.map(p => p.id === id ? { ...p, is_active: isActive } : p));
      toast({ title: isActive ? "Product activated" : "Product paused" });
    } catch (error) {
      devError('Error toggling product:', error);
      toast({ title: "Failed to update product", variant: "destructive" });
    }
  };

  const removeProduct = async (id: string) => {
    try {
      const { error } = await supabase
        .from('customer_products')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setProducts(prev => prev.filter(p => p.id !== id));
      toast({ title: "Product removed from subscription" });
    } catch (error) {
      devError('Error removing product:', error);
      toast({ title: "Failed to remove product", variant: "destructive" });
    }
  };

  const scheduleVacation = async () => {
    if (!vacationStart || !vacationEnd || !customerId) return;
    
    setSavingVacation(true);
    try {
      const { error } = await supabase
        .from('customer_vacations')
        .insert({
          customer_id: customerId,
          start_date: vacationStart,
          end_date: vacationEnd,
          is_active: true,
        });

      if (error) throw error;

      toast({ 
        title: "Vacation scheduled", 
        description: `Deliveries paused from ${format(new Date(vacationStart), 'MMM d')} to ${format(new Date(vacationEnd), 'MMM d')}` 
      });
      setVacationStart('');
      setVacationEnd('');
      setDialogOpen(false);
    } catch (error) {
      devError('Error scheduling vacation:', error);
      toast({ title: "Failed to schedule vacation", variant: "destructive" });
    } finally {
      setSavingVacation(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Subscription</h1>
          <p className="text-muted-foreground">Manage your daily products</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline"><Pause className="mr-2 h-4 w-4" />Pause</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule Vacation</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <Input 
                  type="date" 
                  value={vacationStart} 
                  onChange={e => setVacationStart(e.target.value)} 
                  min={format(new Date(), 'yyyy-MM-dd')} 
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Date</label>
                <Input 
                  type="date" 
                  value={vacationEnd} 
                  onChange={e => setVacationEnd(e.target.value)} 
                  min={vacationStart || format(new Date(), 'yyyy-MM-dd')} 
                />
              </div>
              <Button 
                onClick={scheduleVacation} 
                disabled={savingVacation || !vacationStart || !vacationEnd} 
                className="w-full"
              >
                {savingVacation ? 'Saving...' : 'Schedule Pause'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="h-20 animate-pulse bg-muted" />
            </Card>
          ))}
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No products in subscription</p>
            <p className="text-sm text-muted-foreground mt-1">Add products from the Products page</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {products.map(product => (
            <Card key={product.id} className={!product.is_active ? 'opacity-60' : ''}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch 
                      checked={product.is_active} 
                      onCheckedChange={v => toggleActive(product.id, v)} 
                    />
                    <div>
                      <p className="font-medium">{product.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        ₹{(product.custom_price || product.base_price).toFixed(2)}/unit
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="icon" 
                      variant="outline" 
                      onClick={() => updateQuantity(product.id, product.quantity - 0.5)}
                      disabled={product.quantity <= 0.25}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-12 text-center font-bold">{product.quantity}</span>
                    <Button 
                      size="icon" 
                      variant="outline" 
                      onClick={() => updateQuantity(product.id, product.quantity + 0.5)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeProduct(product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
