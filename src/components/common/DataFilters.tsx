import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ArrowUpDown, Filter, X } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import { cn } from "@/lib/utils";

export type TimeRange = "1m" | "2m" | "3m" | "6m" | "1y" | "all";

export interface SortOption {
  value: string;
  label: string;
}

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface DataFiltersProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  sortBy?: string;
  sortOptions?: SortOption[];
  onSortChange?: (sort: string) => void;
  sortDirection?: "asc" | "desc";
  onSortDirectionChange?: (dir: "asc" | "desc") => void;
  showCustomDateRange?: boolean;
  customDateRange?: DateRange;
  onCustomDateRangeChange?: (range: DateRange) => void;
  className?: string;
}

export const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: "1m", label: "Last Month" },
  { value: "2m", label: "Last 2 Months" },
  { value: "3m", label: "Last 3 Months" },
  { value: "6m", label: "Last 6 Months" },
  { value: "1y", label: "This Year" },
  { value: "all", label: "All Time" },
];

export function getDateRangeFromTimeRange(range: TimeRange): DateRange {
  const now = new Date();
  
  switch (range) {
    case "1m":
      return { start: startOfMonth(subMonths(now, 1)), end: now };
    case "2m":
      return { start: startOfMonth(subMonths(now, 2)), end: now };
    case "3m":
      return { start: startOfMonth(subMonths(now, 3)), end: now };
    case "6m":
      return { start: startOfMonth(subMonths(now, 6)), end: now };
    case "1y":
      return { start: startOfYear(now), end: now };
    case "all":
    default:
      return { start: null, end: null };
  }
}

export function DataFilters({
  timeRange,
  onTimeRangeChange,
  sortBy,
  sortOptions,
  onSortChange,
  sortDirection = "desc",
  onSortDirectionChange,
  showCustomDateRange = false,
  customDateRange,
  onCustomDateRangeChange,
  className,
}: DataFiltersProps) {
  const [isCustomRange, setIsCustomRange] = useState(false);

  const handleTimeRangeChange = (value: string) => {
    if (value === "custom") {
      setIsCustomRange(true);
    } else {
      setIsCustomRange(false);
      onTimeRangeChange(value as TimeRange);
    }
  };

  const toggleSortDirection = () => {
    if (onSortDirectionChange) {
      onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc");
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={isCustomRange ? "custom" : timeRange} onValueChange={handleTimeRangeChange}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Time Range" />
          </SelectTrigger>
          <SelectContent>
            {timeRangeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
            {showCustomDateRange && (
              <SelectItem value="custom">Custom Range</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {isCustomRange && showCustomDateRange && customDateRange && onCustomDateRangeChange && (
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2">
                <CalendarIcon className="h-4 w-4" />
                {customDateRange.start ? format(customDateRange.start, "dd MMM yy") : "Start"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={customDateRange.start || undefined}
                onSelect={(date) => onCustomDateRangeChange({ ...customDateRange, start: date || null })}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground">to</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2">
                <CalendarIcon className="h-4 w-4" />
                {customDateRange.end ? format(customDateRange.end, "dd MMM yy") : "End"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={customDateRange.end || undefined}
                onSelect={(date) => onCustomDateRangeChange({ ...customDateRange, end: date || null })}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2"
            onClick={() => {
              setIsCustomRange(false);
              onTimeRangeChange("1m");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {sortOptions && sortOptions.length > 0 && onSortChange && (
        <div className="flex items-center gap-1">
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {onSortDirectionChange && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-2"
              onClick={toggleSortDirection}
              title={sortDirection === "asc" ? "Ascending" : "Descending"}
            >
              <ArrowUpDown className={cn("h-4 w-4", sortDirection === "asc" && "rotate-180")} />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
