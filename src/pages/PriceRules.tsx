import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Percent, DollarSign, Droplets, Loader2 } from "lucide-react";
import { devError } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  base_price: number;
  category: string;
}

interface PriceRule {
  id: string;
  name: string;
  product_id: string | null;
  min_fat_percentage: number | null;
  max_fat_percentage: number | null;
  min_snf_percentage: number | null;
  max_snf_percentage: number | null;
  price_adjustment: number;
  adjustment_type: string;
  is_active: boolean;
}

export default function PriceRulesPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Form states
  const [name, setName] = useState("");
  const [productId, setProductId] = useState("");
  const [minFat, setMinFat] = useState("");
  const [maxFat, setMaxFat] = useState("");
  const [minSnf, setMinSnf] = useState("");
  const [maxSnf, setMaxSnf] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("fixed");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, rulesRes] = await Promise.all([
        supabase.from("products").select("id, name, base_price, category").eq("is_active", true),
        supabase.from("price_rules").select("*").order("created_at", { ascending: false }),
      ]);

      if (productsRes.data) setProducts(productsRes.data);
      if (rulesRes.data) setRules(rulesRes.data);
    } catch (error) {
      devError("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRule = async () => {
    if (!name || !adjustment) {
      toast({ title: "Error", description: "Name and adjustment are required", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("price_rules").insert({
      name,
      product_id: productId || null,
      min_fat_percentage: minFat ? parseFloat(minFat) : null,
      max_fat_percentage: maxFat ? parseFloat(maxFat) : null,
      min_snf_percentage: minSnf ? parseFloat(minSnf) : null,
      max_snf_percentage: maxSnf ? parseFloat(maxSnf) : null,
      price_adjustment: parseFloat(adjustment),
      adjustment_type: adjustmentType,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Price rule created" });
      setDialogOpen(false);
      resetForm();
      fetchData();
    }
  };

  const handleToggleRule = async (id: string, isActive: boolean) => {
    const { error } = await supabase.from("price_rules").update({ is_active: !isActive }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      fetchData();
    }
  };

  const handleDeleteRule = async (id: string) => {
    const { error } = await supabase.from("price_rules").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Rule deleted" });
      fetchData();
    }
  };

  const resetForm = () => {
    setName("");
    setProductId("");
    setMinFat("");
    setMaxFat("");
    setMinSnf("");
    setMaxSnf("");
    setAdjustment("");
    setAdjustmentType("fixed");
  };

  const getProductName = (id: string | null) => {
    if (!id) return "All Products";
    return products.find(p => p.id === id)?.name || "Unknown";
  };

  // Stats
  const totalRules = rules.length;
  const activeRules = rules.filter(r => r.is_active).length;
  const fatBasedRules = rules.filter(r => r.min_fat_percentage || r.max_fat_percentage).length;
  const snfBasedRules = rules.filter(r => r.min_snf_percentage || r.max_snf_percentage).length;

  const columns = [
    { key: "name" as const, header: "Rule Name" },
    { key: "product_id" as const, header: "Product", render: (row: PriceRule) => getProductName(row.product_id) },
    { 
      key: "min_fat_percentage" as const, 
      header: "Fat Range", 
      render: (row: PriceRule) => {
        if (!row.min_fat_percentage && !row.max_fat_percentage) return "-";
        return `${row.min_fat_percentage || 0}% - ${row.max_fat_percentage || "∞"}%`;
      }
    },
    { 
      key: "min_snf_percentage" as const, 
      header: "SNF Range", 
      render: (row: PriceRule) => {
        if (!row.min_snf_percentage && !row.max_snf_percentage) return "-";
        return `${row.min_snf_percentage || 0}% - ${row.max_snf_percentage || "∞"}%`;
      }
    },
    { 
      key: "price_adjustment" as const, 
      header: "Adjustment", 
      render: (row: PriceRule) => (
        <span className={row.price_adjustment >= 0 ? "text-green-600" : "text-destructive"}>
          {row.price_adjustment >= 0 ? "+" : ""}
          {row.adjustment_type === "percentage" 
            ? `${row.price_adjustment}%` 
            : `₹${row.price_adjustment}/L`}
        </span>
      )
    },
    { 
      key: "is_active" as const, 
      header: "Active", 
      render: (row: PriceRule) => (
        <Switch 
          checked={row.is_active} 
          onCheckedChange={() => handleToggleRule(row.id, row.is_active)} 
        />
      )
    },
    {
      key: "id" as const,
      header: "",
      render: (row: PriceRule) => (
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteRule(row.id)}>
          Delete
        </Button>
      )
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quality-Based Pricing"
        description="Set price adjustments based on Fat and SNF percentages"
      >
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Price Rule</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Price Rule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Rule Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Premium Fat Bonus" />
              </div>

              <div className="space-y-2">
                <Label>Apply to Product</Label>
                <Select value={productId || "all"} onValueChange={(val) => setProductId(val === "all" ? "" : val)}>
                  <SelectTrigger><SelectValue placeholder="All products" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border p-4 space-y-4">
                <p className="text-sm font-medium">Fat Percentage Range</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Minimum %</Label>
                    <Input type="number" step="0.1" value={minFat} onChange={e => setMinFat(e.target.value)} placeholder="e.g., 4.0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Maximum %</Label>
                    <Input type="number" step="0.1" value={maxFat} onChange={e => setMaxFat(e.target.value)} placeholder="e.g., 5.0" />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-4">
                <p className="text-sm font-medium">SNF Percentage Range</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Minimum %</Label>
                    <Input type="number" step="0.1" value={minSnf} onChange={e => setMinSnf(e.target.value)} placeholder="e.g., 8.0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Maximum %</Label>
                    <Input type="number" step="0.1" value={maxSnf} onChange={e => setMaxSnf(e.target.value)} placeholder="e.g., 9.0" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Adjustment Type</Label>
                  <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed (₹ per liter)</SelectItem>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Adjustment Value *</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={adjustment} 
                    onChange={e => setAdjustment(e.target.value)} 
                    placeholder={adjustmentType === "percentage" ? "e.g., 5" : "e.g., 2.50"}
                  />
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Use positive values for bonuses, negative for deductions.
              </p>

              <Button className="w-full" onClick={handleCreateRule}>Create Rule</Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Rules</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRules}</div>
            <p className="text-xs text-muted-foreground">{activeRules} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fat-Based Rules</CardTitle>
            <Droplets className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fatBasedRules}</div>
            <p className="text-xs text-muted-foreground">pricing rules</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">SNF-Based Rules</CardTitle>
            <Droplets className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{snfBasedRules}</div>
            <p className="text-xs text-muted-foreground">pricing rules</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Products</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
            <p className="text-xs text-muted-foreground">with quality pricing</p>
          </CardContent>
        </Card>
      </div>

      {/* Pricing Example */}
      <Card>
        <CardHeader>
          <CardTitle>How Quality Pricing Works</CardTitle>
          <CardDescription>Price adjustments are applied based on milk quality parameters</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-muted p-4">
              <h4 className="font-semibold mb-2">Standard Quality</h4>
              <p className="text-sm text-muted-foreground mb-2">Fat: 3.5% - 4.0%, SNF: 8.0% - 8.5%</p>
              <p className="text-lg font-medium">Base Price</p>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-950 p-4">
              <h4 className="font-semibold mb-2 text-green-700 dark:text-green-400">Premium Quality</h4>
              <p className="text-sm text-muted-foreground mb-2">Fat: {">"} 4.5%, SNF: {">"} 8.5%</p>
              <p className="text-lg font-medium text-green-600">Base + Bonus</p>
            </div>
            <div className="rounded-lg bg-red-50 dark:bg-red-950 p-4">
              <h4 className="font-semibold mb-2 text-red-700 dark:text-red-400">Below Standard</h4>
              <p className="text-sm text-muted-foreground mb-2">Fat: {"<"} 3.5%, SNF: {"<"} 8.0%</p>
              <p className="text-lg font-medium text-red-600">Base - Deduction</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rules Table */}
      <Card>
        <CardHeader>
          <CardTitle>Price Rules</CardTitle>
          <CardDescription>Manage quality-based pricing adjustments</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable data={rules} columns={columns} searchable searchPlaceholder="Search rules..." />
        </CardContent>
      </Card>
    </div>
  );
}
