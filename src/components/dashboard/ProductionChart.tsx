import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay } from "date-fns";
import { devError } from "@/lib/utils";

interface DailyProduction {
  day: string;
  morning: number;
  evening: number;
}

async function fetchWeeklyProduction(): Promise<DailyProduction[]> {
  const today = new Date();
  const weekAgo = subDays(today, 6);
  
  const { data, error } = await supabase
    .from("milk_production")
    .select("production_date, session, quantity_liters")
    .gte("production_date", format(weekAgo, "yyyy-MM-dd"))
    .lte("production_date", format(today, "yyyy-MM-dd"))
    .order("production_date", { ascending: true });

  if (error) {
    devError("Error fetching production data:", error);
    return [];
  }

  // Group by date and session
  const grouped: Record<string, { morning: number; evening: number }> = {};
  
  // Initialize all 7 days
  for (let i = 6; i >= 0; i--) {
    const date = format(subDays(today, i), "yyyy-MM-dd");
    grouped[date] = { morning: 0, evening: 0 };
  }

  // Fill in actual data
  (data || []).forEach((record) => {
    const date = record.production_date;
    if (grouped[date]) {
      if (record.session === "morning") {
        grouped[date].morning += Number(record.quantity_liters) || 0;
      } else if (record.session === "evening") {
        grouped[date].evening += Number(record.quantity_liters) || 0;
      }
    }
  });

  // Convert to array with day names
  return Object.entries(grouped).map(([date, values]) => ({
    day: format(new Date(date), "EEE"),
    morning: Math.round(values.morning * 10) / 10,
    evening: Math.round(values.evening * 10) / 10,
  }));
}

export function ProductionChart() {
  const { data: chartData, isLoading } = useQuery({
    queryKey: ["weekly-production-chart"],
    queryFn: fetchWeeklyProduction,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  return (
    <Card className="col-span-full lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <TrendingUp className="h-5 w-5 text-success" />
            Weekly Production
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="text-muted-foreground">Morning</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-accent" />
              <span className="text-muted-foreground">Evening</span>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[280px] w-full">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !chartData || chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">No production data for the past week</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="morningGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(152 45% 28%)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(152 45% 28%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="eveningGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(158 50% 45%)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(158 50% 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis 
                  dataKey="day" 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: 'hsl(150 10% 45%)', fontSize: 12 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: 'hsl(150 10% 45%)', fontSize: 12 }}
                  tickFormatter={(value) => `${value}L`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(0 0% 100%)',
                    border: '1px solid hsl(150 15% 85%)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px hsl(150 25% 15% / 0.1)',
                  }}
                  labelStyle={{ color: 'hsl(150 25% 15%)', fontWeight: 600 }}
                  itemStyle={{ color: 'hsl(150 10% 45%)' }}
                  formatter={(value: number) => [`${value} L`, '']}
                />
                <Area
                  type="monotone"
                  dataKey="morning"
                  stroke="hsl(152 45% 28%)"
                  strokeWidth={2}
                  fill="url(#morningGradient)"
                  name="Morning"
                />
                <Area
                  type="monotone"
                  dataKey="evening"
                  stroke="hsl(158 50% 45%)"
                  strokeWidth={2}
                  fill="url(#eveningGradient)"
                  name="Evening"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
