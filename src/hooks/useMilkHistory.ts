import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { devError } from "@/lib/utils";

export interface MilkHistoryRecord {
  date: string;
  morning: number | null;
  evening: number | null;
  total: number;
  morningChange: number | null;
  eveningChange: number | null;
  totalChange: number | null;
  morningFat: number | null;
  eveningFat: number | null;
  morningSNF: number | null;
  eveningSNF: number | null;
}

export interface DailyProductionTotal {
  date: string;
  morning: number;
  evening: number;
  total: number;
  morningChange: number | null;
  eveningChange: number | null;
  totalChange: number | null;
}

interface RawProductionRecord {
  production_date: string;
  session: string;
  quantity_liters: number;
  fat_percentage: number | null;
  snf_percentage: number | null;
  cattle_id: string;
}

export function useMilkHistory() {
  const [loading, setLoading] = useState(false);
  const [cattleHistory, setCattleHistory] = useState<MilkHistoryRecord[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyProductionTotal[]>([]);

  const fetchCattleHistory = useCallback(async (cattleId: string, days: number = 30) => {
    setLoading(true);
    const startDate = format(subDays(new Date(), days), "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("milk_production")
      .select("production_date, session, quantity_liters, fat_percentage, snf_percentage")
      .eq("cattle_id", cattleId)
      .gte("production_date", startDate)
      .order("production_date", { ascending: false });

    if (error) {
      devError("Error fetching milk history:", error);
      setLoading(false);
      return [];
    }

    // Group by date
    const grouped: Record<string, {
      morning: number | null;
      evening: number | null;
      morningFat: number | null;
      eveningFat: number | null;
      morningSNF: number | null;
      eveningSNF: number | null;
    }> = {};

    (data || []).forEach((record) => {
      if (!grouped[record.production_date]) {
        grouped[record.production_date] = {
          morning: null,
          evening: null,
          morningFat: null,
          eveningFat: null,
          morningSNF: null,
          eveningSNF: null,
        };
      }
      if (record.session === "morning") {
        grouped[record.production_date].morning = record.quantity_liters;
        grouped[record.production_date].morningFat = record.fat_percentage;
        grouped[record.production_date].morningSNF = record.snf_percentage;
      } else {
        grouped[record.production_date].evening = record.quantity_liters;
        grouped[record.production_date].eveningFat = record.fat_percentage;
        grouped[record.production_date].eveningSNF = record.snf_percentage;
      }
    });

    // Sort dates descending and calculate changes
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    const history: MilkHistoryRecord[] = sortedDates.map((date, index) => {
      const current = grouped[date];
      const previous = index < sortedDates.length - 1 ? grouped[sortedDates[index + 1]] : null;
      
      const currentTotal = (current.morning || 0) + (current.evening || 0);
      const previousTotal = previous ? (previous.morning || 0) + (previous.evening || 0) : null;

      return {
        date,
        morning: current.morning,
        evening: current.evening,
        total: currentTotal,
        morningChange: previous && current.morning !== null && previous.morning !== null
          ? current.morning - previous.morning
          : null,
        eveningChange: previous && current.evening !== null && previous.evening !== null
          ? current.evening - previous.evening
          : null,
        totalChange: previousTotal !== null ? currentTotal - previousTotal : null,
        morningFat: current.morningFat,
        eveningFat: current.eveningFat,
        morningSNF: current.morningSNF,
        eveningSNF: current.eveningSNF,
      };
    });

    setCattleHistory(history);
    setLoading(false);
    return history;
  }, []);

  const fetchDailyTotals = useCallback(async (days: number = 30, sessionFilter?: "morning" | "evening") => {
    setLoading(true);
    const startDate = format(subDays(new Date(), days), "yyyy-MM-dd");

    let query = supabase
      .from("milk_production")
      .select("production_date, session, quantity_liters")
      .gte("production_date", startDate)
      .order("production_date", { ascending: false });

    if (sessionFilter) {
      query = query.eq("session", sessionFilter);
    }

    const { data, error } = await query;

    if (error) {
      devError("Error fetching daily totals:", error);
      setLoading(false);
      return [];
    }

    // Group by date
    const grouped: Record<string, { morning: number; evening: number }> = {};

    (data || []).forEach((record) => {
      if (!grouped[record.production_date]) {
        grouped[record.production_date] = { morning: 0, evening: 0 };
      }
      if (record.session === "morning") {
        grouped[record.production_date].morning += record.quantity_liters;
      } else {
        grouped[record.production_date].evening += record.quantity_liters;
      }
    });

    // Sort dates descending and calculate changes
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    const totals: DailyProductionTotal[] = sortedDates.map((date, index) => {
      const current = grouped[date];
      const previous = index < sortedDates.length - 1 ? grouped[sortedDates[index + 1]] : null;
      
      const currentTotal = current.morning + current.evening;
      const previousTotal = previous ? previous.morning + previous.evening : null;

      return {
        date,
        morning: current.morning,
        evening: current.evening,
        total: currentTotal,
        morningChange: previous ? current.morning - previous.morning : null,
        eveningChange: previous ? current.evening - previous.evening : null,
        totalChange: previousTotal !== null ? currentTotal - previousTotal : null,
      };
    });

    setDailyTotals(totals);
    setLoading(false);
    return totals;
  }, []);

  return {
    loading,
    cattleHistory,
    dailyTotals,
    fetchCattleHistory,
    fetchDailyTotals,
  };
}
