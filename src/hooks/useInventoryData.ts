import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useExpenseAutomation } from "@/hooks/useExpenseAutomation";
import { format } from "date-fns";

export interface FeedItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  min_stock_level: number;
  cost_per_unit: number | null;
  supplier: string | null;
}

export interface FeedConsumption {
  id: string;
  feed_id: string;
  cattle_id: string | null;
  consumption_date: string;
  quantity: number;
  created_at: string;
}

export interface FeedFormData {
  name: string;
  category: string;
  unit: string;
  current_stock: string;
  min_stock_level: string;
  cost_per_unit: string;
  supplier: string;
}

interface InventoryData {
  items: FeedItem[];
  consumption: FeedConsumption[];
}

async function fetchInventoryData(): Promise<InventoryData> {
  const [itemsRes, consumptionRes] = await Promise.all([
    supabase.from("feed_inventory").select("*").order("category").order("name"),
    supabase
      .from("feed_consumption")
      .select("*")
      .order("consumption_date", { ascending: false })
      .limit(50),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  if (consumptionRes.error) throw consumptionRes.error;

  return {
    items: itemsRes.data || [],
    consumption: consumptionRes.data || [],
  };
}

export function useInventoryData() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { logFeedPurchase } = useExpenseAutomation();

  const inventoryQuery = useQuery({
    queryKey: ["inventory"],
    queryFn: fetchInventoryData,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const createItemMutation = useMutation({
    mutationFn: async (formData: FeedFormData) => {
      const { error } = await supabase.from("feed_inventory").insert({
        name: formData.name,
        category: formData.category,
        unit: formData.unit,
        current_stock: parseFloat(formData.current_stock) || 0,
        min_stock_level: parseFloat(formData.min_stock_level) || 0,
        cost_per_unit: formData.cost_per_unit ? parseFloat(formData.cost_per_unit) : null,
        supplier: formData.supplier || null,
      });

      if (error) throw error;

      // Auto-create expense entry for initial stock purchase
      const initialStock = parseFloat(formData.current_stock) || 0;
      const costPerUnit = formData.cost_per_unit ? parseFloat(formData.cost_per_unit) : 0;
      
      if (initialStock > 0 && costPerUnit > 0) {
        await logFeedPurchase(
          formData.name,
          initialStock,
          costPerUnit,
          formData.unit,
          format(new Date(), "yyyy-MM-dd")
        );
      }
    },
    onSuccess: (_, formData) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      const initialStock = parseFloat(formData.current_stock) || 0;
      const costPerUnit = formData.cost_per_unit ? parseFloat(formData.cost_per_unit) : 0;
      const message = initialStock > 0 && costPerUnit > 0 
        ? "Item added & expense recorded" 
        : "Item added";
      toast({ title: message });
    },
    onError: (error: Error) => {
      toast({ title: "Error saving item", description: error.message, variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: FeedFormData }) => {
      const { error } = await supabase
        .from("feed_inventory")
        .update({
          name: formData.name,
          category: formData.category,
          unit: formData.unit,
          current_stock: parseFloat(formData.current_stock) || 0,
          min_stock_level: parseFloat(formData.min_stock_level) || 0,
          cost_per_unit: formData.cost_per_unit ? parseFloat(formData.cost_per_unit) : null,
          supplier: formData.supplier || null,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast({ title: "Item updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating item", description: error.message, variant: "destructive" });
    },
  });

  const updateStockMutation = useMutation({
    mutationFn: async ({
      item,
      type,
      quantity,
    }: {
      item: FeedItem;
      type: "add" | "consume";
      quantity: number;
    }) => {
      const newStock =
        type === "add" ? item.current_stock + quantity : Math.max(0, item.current_stock - quantity);

      const { error } = await supabase
        .from("feed_inventory")
        .update({ current_stock: newStock })
        .eq("id", item.id);

      if (error) throw error;

      if (type === "consume") {
        await supabase.from("feed_consumption").insert({
          feed_id: item.id,
          consumption_date: format(new Date(), "yyyy-MM-dd"),
          quantity,
        });
      }

      // Auto-create expense entry when adding stock (purchase)
      if (type === "add" && item.cost_per_unit && item.cost_per_unit > 0) {
        await logFeedPurchase(
          item.name,
          quantity,
          item.cost_per_unit,
          item.unit,
          format(new Date(), "yyyy-MM-dd")
        );
      }
    },
    onSuccess: (_, { type, item }) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      if (type === "add" && item.cost_per_unit) {
        queryClient.invalidateQueries({ queryKey: ["expenses"] });
      }
      const message =
        type === "add" && item.cost_per_unit ? "Stock updated & expense recorded" : "Stock updated";
      toast({ title: message });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating stock", description: error.message, variant: "destructive" });
    },
  });

  return {
    items: inventoryQuery.data?.items || [],
    consumption: inventoryQuery.data?.consumption || [],
    isLoading: inventoryQuery.isLoading,
    isError: inventoryQuery.isError,
    error: inventoryQuery.error,
    refetch: inventoryQuery.refetch,
    createItem: createItemMutation.mutate,
    updateItem: updateItemMutation.mutate,
    updateStock: updateStockMutation.mutate,
    isCreating: createItemMutation.isPending,
    isUpdating: updateItemMutation.isPending,
    isUpdatingStock: updateStockMutation.isPending,
  };
}
