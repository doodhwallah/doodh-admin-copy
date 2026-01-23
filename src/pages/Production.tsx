import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import { DataFilters, TimeRange, SortOption, getDateRangeFromTimeRange } from "@/components/common/DataFilters";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MilkHistoryDialog } from "@/components/production/MilkHistoryDialog";
import { Droplets, Sun, Moon, Loader2, History } from "lucide-react";
import { format } from "date-fns";

interface Cattle {
  id: string;
  tag_number: string;
  name: string | null;
}

interface MilkProduction {
  id: string;
  cattle_id: string;
  production_date: string;
  session: string;
  quantity_liters: number;
  fat_percentage: number | null;
  snf_percentage: number | null;
  quality_notes: string | null;
  cattle?: Cattle;
}

interface ProductionWithCattle extends MilkProduction {
  cattle: Cattle;
}

const productionSortOptions: SortOption[] = [
  { value: "production_date", label: "Date" },
  { value: "quantity_liters", label: "Quantity" },
];

export default function ProductionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [productions, setProductions] = useState<ProductionWithCattle[]>([]);
  const [cattle, setCattle] = useState<Cattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [session, setSession] = useState<"morning" | "evening">("morning");
  const [entries, setEntries] = useState<Record<string, { quantity: string; fat: string; snf: string; notes: string }>>({});
  const [timeRange, setTimeRange] = useState<TimeRange>("1m");
  const [sortBy, setSortBy] = useState("production_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const { toast } = useToast();

  // History dialog state
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyMode, setHistoryMode] = useState<"cattle" | "daily">("daily");
  const [selectedCattleId, setSelectedCattleId] = useState<string>("");
  const [selectedCattleName, setSelectedCattleName] = useState<string>("");
  const [sessionFilter, setSessionFilter] = useState<"morning" | "evening" | "total">("total");

  const fetchData = useCallback(async () => {
    setLoading(true);
    
    try {
      const dateRange = getDateRangeFromTimeRange(timeRange);
      
      // Fetch cattle and productions in parallel for faster loading
      let productionQuery = supabase
        .from("milk_production")
        .select(`
          *,
          cattle:cattle_id (id, tag_number, name)
        `);
      
      if (dateRange.start) {
        productionQuery = productionQuery.gte("production_date", format(dateRange.start, "yyyy-MM-dd"));
      }
      if (dateRange.end) {
        productionQuery = productionQuery.lte("production_date", format(dateRange.end, "yyyy-MM-dd"));
      }
      
      productionQuery = productionQuery.order(sortBy, { ascending: sortDirection === "asc" });
      
      const [cattleRes, productionRes] = await Promise.all([
        supabase
          .from("cattle")
          .select("id, tag_number, name")
          .eq("status", "active")
          .in("lactation_status", ["lactating"])
          .order("tag_number"),
        productionQuery
      ]);

      setCattle(cattleRes.data || []);

      if (productionRes.error) {
        toast({
          title: "Error fetching data",
          description: productionRes.error.message,
          variant: "destructive",
        });
      } else {
        setProductions((productionRes.data as ProductionWithCattle[]) || []);
      }
    } catch (error) {
      devError("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [timeRange, sortBy, sortDirection, toast]);

  useEffect(() => {
    fetchData();
    if (searchParams.get("action") === "add") {
      setDialogOpen(true);
      setSearchParams({});
    }
  }, [fetchData, searchParams, setSearchParams]);

  const handleOpenDialog = async () => {
    // Reset entries
    const newEntries: Record<string, { quantity: string; fat: string; snf: string; notes: string }> = {};
    
    // Check existing entries for the selected date and session
    const { data: existing } = await supabase
      .from("milk_production")
      .select("*")
      .eq("production_date", selectedDate)
      .eq("session", session);

    cattle.forEach((c) => {
      const existingEntry = existing?.find((e) => e.cattle_id === c.id);
      newEntries[c.id] = {
        quantity: existingEntry?.quantity_liters?.toString() || "",
        fat: existingEntry?.fat_percentage?.toString() || "",
        snf: existingEntry?.snf_percentage?.toString() || "",
        notes: existingEntry?.quality_notes || "",
      };
    });

    setEntries(newEntries);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);

    const records = Object.entries(entries)
      .filter(([_, entry]) => entry.quantity && parseFloat(entry.quantity) > 0)
      .map(([cattleId, entry]) => ({
        cattle_id: cattleId,
        production_date: selectedDate,
        session,
        quantity_liters: parseFloat(entry.quantity),
        fat_percentage: entry.fat ? parseFloat(entry.fat) : null,
        snf_percentage: entry.snf ? parseFloat(entry.snf) : null,
        quality_notes: entry.notes || null,
      }));

    if (records.length === 0) {
      toast({
        title: "No entries",
        description: "Please enter at least one production record",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    // Upsert records
    const { error } = await supabase
      .from("milk_production")
      .upsert(records, { onConflict: "cattle_id,production_date,session" });

    setSaving(false);

    if (error) {
      toast({
        title: "Error saving production",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Production saved",
        description: `${records.length} entries saved for ${session} session`,
      });
      setDialogOpen(false);
      fetchData();
    }
  };

  // Open cattle history dialog
  const handleOpenCattleHistory = (cattleId: string, cattleName: string) => {
    setHistoryMode("cattle");
    setSelectedCattleId(cattleId);
    setSelectedCattleName(cattleName);
    setHistoryDialogOpen(true);
  };

  // Open daily totals history dialog
  const handleOpenDailyHistory = (filter: "morning" | "evening" | "total") => {
    setHistoryMode("daily");
    setSessionFilter(filter);
    setHistoryDialogOpen(true);
  };

  const todayTotal = productions
    .filter((p) => p.production_date === format(new Date(), "yyyy-MM-dd"))
    .reduce((sum, p) => sum + Number(p.quantity_liters), 0);

  const morningTotal = productions
    .filter((p) => p.production_date === format(new Date(), "yyyy-MM-dd") && p.session === "morning")
    .reduce((sum, p) => sum + Number(p.quantity_liters), 0);

  const eveningTotal = productions
    .filter((p) => p.production_date === format(new Date(), "yyyy-MM-dd") && p.session === "evening")
    .reduce((sum, p) => sum + Number(p.quantity_liters), 0);

  const columns = [
    {
      key: "production_date",
      header: "Date",
      render: (item: ProductionWithCattle) => (
        <span className="font-medium">
          {format(new Date(item.production_date), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      key: "session",
      header: "Session",
      render: (item: ProductionWithCattle) => (
        <div className="flex items-center gap-2">
          {item.session === "morning" ? (
            <Sun className="h-4 w-4 text-warning" />
          ) : (
            <Moon className="h-4 w-4 text-info" />
          )}
          <span className="capitalize">{item.session}</span>
        </div>
      ),
    },
    {
      key: "cattle",
      header: "Cattle",
      render: (item: ProductionWithCattle) => (
        <button
          onClick={() => handleOpenCattleHistory(
            item.cattle?.id,
            `${item.cattle?.tag_number}${item.cattle?.name ? ` (${item.cattle.name})` : ""}`
          )}
          className="font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer"
        >
          {item.cattle?.tag_number} {item.cattle?.name ? `(${item.cattle.name})` : ""}
          <History className="h-3 w-3 opacity-50" />
        </button>
      ),
    },
    {
      key: "quantity_liters",
      header: "Quantity",
      render: (item: ProductionWithCattle) => (
        <span className="font-semibold">{item.quantity_liters} L</span>
      ),
    },
    {
      key: "fat_percentage",
      header: "Fat %",
      render: (item: ProductionWithCattle) => item.fat_percentage ? `${item.fat_percentage}%` : "-",
    },
    {
      key: "snf_percentage",
      header: "SNF %",
      render: (item: ProductionWithCattle) => item.snf_percentage ? `${item.snf_percentage}%` : "-",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Milk Production"
        description="Track daily milk collection"
        icon={Droplets}
        action={{
          label: "Record Production",
          onClick: handleOpenDialog,
        }}
      />

      <DataFilters
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        sortBy={sortBy}
        sortOptions={productionSortOptions}
        onSortChange={setSortBy}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
      />

      {/* Stats Cards - Now Clickable */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card 
          className="bg-gradient-to-br from-info/10 to-info/5 border-info/20 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleOpenDailyHistory("total")}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Today's Total</p>
                <p className="text-3xl font-bold text-info">{todayTotal} L</p>
                <p className="text-xs text-muted-foreground mt-1">Click to view history</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-info/20">
                <Droplets className="h-6 w-6 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card 
          className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleOpenDailyHistory("morning")}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Morning Session</p>
                <p className="text-3xl font-bold text-warning">{morningTotal} L</p>
                <p className="text-xs text-muted-foreground mt-1">Click to view history</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/20">
                <Sun className="h-6 w-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card 
          className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleOpenDailyHistory("evening")}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Evening Session</p>
                <p className="text-3xl font-bold text-primary">{eveningTotal} L</p>
                <p className="text-xs text-muted-foreground mt-1">Click to view history</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                <Moon className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={productions}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search by date, cattle..."
        emptyMessage="No production records. Start recording milk production."
      />

      {/* Production Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Milk Production</DialogTitle>
            <DialogDescription>
              Enter milk production for each cattle
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Session</Label>
                <Tabs value={session} onValueChange={(v) => setSession(v as "morning" | "evening")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="morning" className="gap-2">
                      <Sun className="h-4 w-4" /> Morning
                    </TabsTrigger>
                    <TabsTrigger value="evening" className="gap-2">
                      <Moon className="h-4 w-4" /> Evening
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {cattle.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No lactating cattle found. Add cattle with lactating status first.
              </div>
            ) : (
              <div className="space-y-2">
                {/* Desktop: Grid layout */}
                <div className="hidden md:block">
                  <div className="grid grid-cols-12 gap-2 px-2 text-sm font-medium text-muted-foreground mb-2">
                    <div className="col-span-3">Cattle</div>
                    <div className="col-span-2">Quantity (L)</div>
                    <div className="col-span-2">Fat %</div>
                    <div className="col-span-2">SNF %</div>
                    <div className="col-span-3">Notes</div>
                  </div>
                  {cattle.map((c) => (
                    <div key={c.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg hover:bg-muted/50">
                      <div className="col-span-3 flex items-center gap-2">
                        <div>
                          <span className="font-medium">{c.tag_number}</span>
                          {c.name && <span className="text-muted-foreground ml-1">({c.name})</span>}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleOpenCattleHistory(c.id, `${c.tag_number}${c.name ? ` (${c.name})` : ""}`)}
                        >
                          <History className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="0.0"
                          value={entries[c.id]?.quantity || ""}
                          onChange={(e) =>
                            setEntries({
                              ...entries,
                              [c.id]: { ...entries[c.id], quantity: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="0.0"
                          value={entries[c.id]?.fat || ""}
                          onChange={(e) =>
                            setEntries({
                              ...entries,
                              [c.id]: { ...entries[c.id], fat: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="0.0"
                          value={entries[c.id]?.snf || ""}
                          onChange={(e) =>
                            setEntries({
                              ...entries,
                              [c.id]: { ...entries[c.id], snf: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          placeholder="Notes"
                          value={entries[c.id]?.notes || ""}
                          onChange={(e) =>
                            setEntries({
                              ...entries,
                              [c.id]: { ...entries[c.id], notes: e.target.value },
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mobile: Card layout */}
                <div className="md:hidden space-y-3">
                  {cattle.map((c) => (
                    <div key={c.id} className="border rounded-lg p-3 space-y-3 bg-card">
                      {/* Cattle name row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Droplets className="h-4 w-4 text-primary" />
                          <span className="font-semibold">{c.tag_number}</span>
                          {c.name && <span className="text-muted-foreground text-sm">({c.name})</span>}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenCattleHistory(c.id, `${c.tag_number}${c.name ? ` (${c.name})` : ""}`)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Primary: Quantity input (large) */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Milk Quantity (Litres)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="0.0"
                          className="text-lg h-12 font-semibold"
                          value={entries[c.id]?.quantity || ""}
                          onChange={(e) =>
                            setEntries({
                              ...entries,
                              [c.id]: { ...entries[c.id], quantity: e.target.value },
                            })
                          }
                        />
                      </div>

                      {/* Secondary: Fat, SNF, Notes in compact row */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Fat %</Label>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="0.0"
                            className="text-sm"
                            value={entries[c.id]?.fat || ""}
                            onChange={(e) =>
                              setEntries({
                                ...entries,
                                [c.id]: { ...entries[c.id], fat: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">SNF %</Label>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="0.0"
                            className="text-sm"
                            value={entries[c.id]?.snf || ""}
                            onChange={(e) =>
                              setEntries({
                                ...entries,
                                [c.id]: { ...entries[c.id], snf: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Notes</Label>
                          <Input
                            placeholder="..."
                            className="text-sm"
                            value={entries[c.id]?.notes || ""}
                            onChange={(e) =>
                              setEntries({
                                ...entries,
                                [c.id]: { ...entries[c.id], notes: e.target.value },
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Total:{" "}
              <span className="font-semibold text-foreground">
                {Object.values(entries)
                  .reduce((sum, e) => sum + (parseFloat(e.quantity) || 0), 0)
                  .toFixed(1)}{" "}
                L
              </span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || cattle.length === 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Production
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Milk History Dialog */}
      <MilkHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        mode={historyMode}
        cattleId={selectedCattleId}
        cattleName={selectedCattleName}
        sessionFilter={sessionFilter}
      />
    </div>
  );
}
