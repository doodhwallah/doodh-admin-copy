import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { DataFilters, TimeRange, SortOption, getDateRangeFromTimeRange } from "@/components/common/DataFilters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Wallet, Plus, Loader2, Edit, Trash2, Calendar } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";

interface Expense {
  id: string;
  category: string;
  title: string;
  amount: number;
  expense_date: string;
  notes: string | null;
  created_at: string;
}

const categoryColors: Record<string, string> = {
  feed: "bg-success/10 text-success border-success/20",
  medicine: "bg-info/10 text-info border-info/20",
  salary: "bg-primary/10 text-primary border-primary/20",
  transport: "bg-warning/10 text-warning border-warning/20",
  electricity: "bg-accent/10 text-accent border-accent/20",
  maintenance: "bg-muted text-muted-foreground border-border",
  misc: "bg-secondary text-secondary-foreground border-border",
};

const categoryLabels: Record<string, string> = {
  feed: "Feed & Fodder",
  medicine: "Medicine",
  salary: "Salary",
  transport: "Transport",
  electricity: "Electricity & Water",
  maintenance: "Maintenance",
  misc: "Miscellaneous",
};

const expensesSortOptions: SortOption[] = [
  { value: "expense_date", label: "Date" },
  { value: "amount", label: "Amount" },
  { value: "category", label: "Category" },
];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("3m");
  const [sortBy, setSortBy] = useState("expense_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [formData, setFormData] = useState({
    category: "feed",
    title: "",
    amount: "",
    expense_date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });
  const { toast } = useToast();

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const dateRange = getDateRangeFromTimeRange(timeRange);
    
    let query = supabase
      .from("expenses")
      .select("*");
    
    if (dateRange.start) {
      query = query.gte("expense_date", format(dateRange.start, "yyyy-MM-dd"));
    }
    if (dateRange.end) {
      query = query.lte("expense_date", format(dateRange.end, "yyyy-MM-dd"));
    }
    
    query = query.order(sortBy, { ascending: sortDirection === "asc" });
    
    const { data, error } = await query;

    if (error) {
      toast({ title: "Error fetching expenses", description: error.message, variant: "destructive" });
    } else {
      setExpenses(data || []);
    }
    setLoading(false);
  }, [timeRange, sortBy, sortDirection, toast]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleSave = async () => {
    if (!formData.title || !formData.amount) {
      toast({ title: "Fill required fields", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      category: formData.category,
      title: formData.title,
      amount: parseFloat(formData.amount),
      expense_date: formData.expense_date,
      notes: formData.notes || null,
    };

    const { error } = selectedExpense
      ? await supabase.from("expenses").update(payload).eq("id", selectedExpense.id)
      : await supabase.from("expenses").insert(payload);

    setSaving(false);

    if (error) {
      toast({ title: "Error saving expense", description: error.message, variant: "destructive" });
    } else {
      toast({ title: selectedExpense ? "Expense updated" : "Expense added" });
      setDialogOpen(false);
      setSelectedExpense(null);
      setFormData({ category: "feed", title: "", amount: "", expense_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
      fetchExpenses();
    }
  };

  const handleDelete = async () => {
    if (!selectedExpense) return;

    const { error } = await supabase.from("expenses").delete().eq("id", selectedExpense.id);

    if (error) {
      toast({ title: "Error deleting expense", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Expense deleted" });
      setDeleteDialogOpen(false);
      setSelectedExpense(null);
      fetchExpenses();
    }
  };

  const openEditDialog = (expense: Expense) => {
    setSelectedExpense(expense);
    setFormData({
      category: expense.category,
      title: expense.title,
      amount: expense.amount.toString(),
      expense_date: expense.expense_date,
      notes: expense.notes || "",
    });
    setDialogOpen(true);
  };

  const filteredExpenses = categoryFilter === "all" 
    ? expenses 
    : expenses.filter(e => e.category === categoryFilter);

  const monthlyExpenses = expenses.filter(e => {
    const date = new Date(e.expense_date);
    return date >= startOfMonth(new Date()) && date <= endOfMonth(new Date());
  });

  const totalThisMonth = monthlyExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const autoExpenses = expenses.filter(e => e.notes?.startsWith("[AUTO]"));
  const manualExpenses = expenses.filter(e => !e.notes?.startsWith("[AUTO]"));
  const autoTotal = autoExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const totalByCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
    return acc;
  }, {} as Record<string, number>);

  const columns = [
    {
      key: "expense_date",
      header: "Date",
      render: (item: Expense) => (
        <span className="font-medium">{format(new Date(item.expense_date), "dd MMM yyyy")}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (item: Expense) => (
        <Badge variant="outline" className={cn("capitalize", categoryColors[item.category])}>
          {categoryLabels[item.category] || item.category}
        </Badge>
      ),
    },
    {
      key: "title",
      header: "Description",
      render: (item: Expense) => {
        const isAutoGenerated = item.notes?.startsWith("[AUTO]");
        return (
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span>{item.title}</span>
              {isAutoGenerated && (
                <Badge variant="outline" className="text-xs bg-info/10 text-info border-info/20">
                  Auto
                </Badge>
              )}
            </div>
            {item.notes && (
              <span className="text-xs text-muted-foreground">
                {item.notes.startsWith("[AUTO]") 
                  ? item.notes.split("|")[1]?.trim() || ""
                  : item.notes}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "amount",
      header: "Amount",
      render: (item: Expense) => (
        <span className="font-semibold text-destructive">-₹{Number(item.amount).toLocaleString()}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: Expense) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { setSelectedExpense(item); setDeleteDialogOpen(true); }}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Track all dairy expenses"
        icon={Wallet}
        action={{
          label: "Add Expense",
          onClick: () => {
            setSelectedExpense(null);
            setFormData({ category: "feed", title: "", amount: "", expense_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
            setDialogOpen(true);
          },
        }}
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-destructive/30">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-destructive">₹{totalThisMonth.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">This Month</p>
          </CardContent>
        </Card>
        <Card className="border-info/30">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-info">₹{autoTotal.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Auto-tracked ({autoExpenses.length})</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">₹{(totalByCategory.feed || 0).toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Feed & Fodder</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">₹{(totalByCategory.salary || 0).toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Salaries</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{expenses.length}</div>
            <p className="text-sm text-muted-foreground">Total Entries</p>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4">Expense Breakdown</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(totalByCategory).map(([cat, amount]) => (
              <div key={cat} className="flex items-center gap-2">
                <Badge variant="outline" className={cn("capitalize", categoryColors[cat])}>
                  {categoryLabels[cat] || cat}
                </Badge>
                <span className="font-medium">₹{amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* DataFilters */}
      <DataFilters
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        sortBy={sortBy}
        sortOptions={expensesSortOptions}
        onSortChange={setSortBy}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
      />

      {/* Category Filter */}
      <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all">All</TabsTrigger>
          {Object.entries(categoryLabels).map(([key, label]) => (
            <TabsTrigger key={key} value={key}>{label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        data={filteredExpenses}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search expenses..."
        emptyMessage="No expenses recorded"
      />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
            <DialogDescription>Record a new expense</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={formData.expense_date} onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="What was this expense for?" />
            </div>
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional details..." rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {selectedExpense ? "Update" : "Add"} Expense
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Expense"
        description={`Delete "${selectedExpense?.title}"? This cannot be undone.`}
        confirmText="Delete"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}
