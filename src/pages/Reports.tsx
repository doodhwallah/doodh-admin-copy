import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { DataExportDialog } from "@/components/export/DataExportDialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { devError } from "@/lib/utils";
import { 
  BarChart3, 
  Droplets, 
  IndianRupee, 
  Users, 
  Beef, 
  TrendingUp, 
  TrendingDown,
  Download,
  Loader2
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from "recharts";
import { format, subDays, startOfMonth, eachDayOfInterval } from "date-fns";

const COLORS = ['hsl(152, 45%, 28%)', 'hsl(158, 50%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(199, 89%, 48%)', 'hsl(0, 72%, 51%)'];

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [productionData, setProductionData] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [expenseData, setExpenseData] = useState<any[]>([]);
  const [cattleStats, setCattleStats] = useState<any>({});
  const [customerStats, setCustomerStats] = useState<any>({});
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    setLoading(true);

    const last30Days = eachDayOfInterval({
      start: subDays(new Date(), 29),
      end: new Date(),
    });

    try {
      // Fetch all data in parallel for faster loading
      const [productionRes, invoicesRes, expensesRes, cattleRes, customersRes] = await Promise.all([
        supabase
          .from("milk_production")
          .select("production_date, session, quantity_liters")
          .gte("production_date", format(subDays(new Date(), 29), "yyyy-MM-dd")),
        supabase
          .from("invoices")
          .select("created_at, final_amount, paid_amount")
          .gte("created_at", format(startOfMonth(new Date()), "yyyy-MM-dd")),
        supabase
          .from("expenses")
          .select("category, amount, expense_date")
          .gte("expense_date", format(startOfMonth(new Date()), "yyyy-MM-dd")),
        supabase.from("cattle").select("status, lactation_status"),
        supabase.from("customers").select("is_active, credit_balance, advance_balance")
      ]);

      // Process production data
      const production = productionRes.data || [];
      const productionByDate = last30Days.map(date => {
        const dateStr = format(date, "yyyy-MM-dd");
        const dayProduction = production.filter(p => p.production_date === dateStr);
        const morning = dayProduction.filter(p => p.session === "morning").reduce((sum, p) => sum + Number(p.quantity_liters), 0);
        const evening = dayProduction.filter(p => p.session === "evening").reduce((sum, p) => sum + Number(p.quantity_liters), 0);
        return {
          date: format(date, "dd MMM"),
          morning,
          evening,
          total: morning + evening,
        };
      });
      setProductionData(productionByDate);

      // Process invoice data
      const invoices = invoicesRes.data || [];
      const monthlyRevenue = invoices.reduce((sum, i) => sum + Number(i.final_amount), 0);
      const monthlyCollected = invoices.reduce((sum, i) => sum + Number(i.paid_amount), 0);
      setRevenueData([
        { name: "Billed", value: monthlyRevenue },
        { name: "Collected", value: monthlyCollected },
        { name: "Pending", value: monthlyRevenue - monthlyCollected },
      ]);

      // Process expense data
      const expenses = expensesRes.data || [];
      const expenseByCategory = expenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
        return acc;
      }, {} as Record<string, number>);
      const expenseChartData = Object.entries(expenseByCategory).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace("_", " "),
        value,
      }));
      setExpenseData(expenseChartData);

      // Process cattle stats
      const cattle = cattleRes.data || [];
      setCattleStats({
        total: cattle.length,
        active: cattle.filter(c => c.status === "active").length,
        lactating: cattle.filter(c => c.lactation_status === "lactating").length,
        pregnant: cattle.filter(c => c.lactation_status === "pregnant").length,
        dry: cattle.filter(c => c.lactation_status === "dry").length,
      });

      // Process customer stats
      const customers = customersRes.data || [];
      setCustomerStats({
        total: customers.length,
        active: customers.filter(c => c.is_active).length,
        totalDue: customers.reduce((sum, c) => sum + Number(c.credit_balance), 0),
        totalAdvance: customers.reduce((sum, c) => sum + Number(c.advance_balance), 0),
      });
    } catch (error) {
      devError("Error fetching report data:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalProduction = productionData.reduce((sum, d) => sum + d.total, 0);
  const avgDailyProduction = totalProduction / 30;
  const totalExpenses = expenseData.reduce((sum, d) => sum + d.value, 0);

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
        title="Reports & Analytics"
        description="Comprehensive insights into your dairy operations"
        icon={BarChart3}
      >
        <Button variant="outline" className="gap-2" onClick={() => setExportDialogOpen(true)}>
          <Download className="h-4 w-4" /> Export
        </Button>
      </PageHeader>

      <DataExportDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen} />

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-info/10 to-info/5 border-info/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">30-Day Production</p>
                <p className="text-2xl font-bold text-info">{totalProduction.toFixed(0)} L</p>
                <p className="text-xs text-muted-foreground">Avg: {avgDailyProduction.toFixed(1)} L/day</p>
              </div>
              <Droplets className="h-8 w-8 text-info/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                <p className="text-2xl font-bold text-success">₹{revenueData[0]?.value?.toLocaleString() || 0}</p>
                <p className="text-xs text-muted-foreground">Collected: ₹{revenueData[1]?.value?.toLocaleString() || 0}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-success/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Expenses</p>
                <p className="text-2xl font-bold text-destructive">₹{totalExpenses.toLocaleString()}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-destructive/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className="text-2xl font-bold text-primary">
                  ₹{((revenueData[1]?.value || 0) - totalExpenses).toLocaleString()}
                </p>
              </div>
              <IndianRupee className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="production" className="space-y-6">
        <TabsList>
          <TabsTrigger value="production">Production</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="cattle">Cattle</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>

        <TabsContent value="production">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="h-5 w-5 text-info" />
                Daily Milk Production (Last 30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={productionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorMorning" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorEvening" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(152, 45%, 28%)" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="hsl(152, 45%, 28%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}L`} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [`${value} L`, '']}
                    />
                    <Area type="monotone" dataKey="morning" stroke="hsl(38, 92%, 50%)" fillOpacity={1} fill="url(#colorMorning)" name="Morning" />
                    <Area type="monotone" dataKey="evening" stroke="hsl(152, 45%, 28%)" fillOpacity={1} fill="url(#colorEvening)" name="Evening" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IndianRupee className="h-5 w-5 text-success" />
                  Revenue Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueData} layout="vertical" margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={80} />
                      <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, '']} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {revenueData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-destructive" />
                  Expense Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ₹${(value/1000).toFixed(1)}k`}
                        labelLine={false}
                      >
                        {expenseData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, '']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cattle">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Beef className="h-5 w-5 text-primary" />
                  Cattle Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span>Total Cattle</span>
                    <span className="text-2xl font-bold">{cattleStats.total}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg border">
                      <p className="text-sm text-muted-foreground">Active</p>
                      <p className="text-xl font-bold text-success">{cattleStats.active}</p>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <p className="text-sm text-muted-foreground">Lactating</p>
                      <p className="text-xl font-bold text-info">{cattleStats.lactating}</p>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <p className="text-sm text-muted-foreground">Pregnant</p>
                      <p className="text-xl font-bold text-primary">{cattleStats.pregnant}</p>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <p className="text-sm text-muted-foreground">Dry</p>
                      <p className="text-xl font-bold text-warning">{cattleStats.dry}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Customer Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span>Total Customers</span>
                    <span className="text-2xl font-bold">{customerStats.total}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg border">
                      <p className="text-sm text-muted-foreground">Active</p>
                      <p className="text-xl font-bold text-success">{customerStats.active}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-destructive/30">
                      <p className="text-sm text-muted-foreground">Total Due</p>
                      <p className="text-xl font-bold text-destructive">₹{customerStats.totalDue?.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle>Customer Analytics</CardTitle>
              <CardDescription>Detailed customer performance metrics</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">Coming Soon</h3>
                <p className="text-muted-foreground max-w-sm">
                  Detailed customer analytics including consumption patterns, payment history, and route performance
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
