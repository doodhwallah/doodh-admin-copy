import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, subWeeks, subMonths, startOfDay, endOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, FileText, Loader2, Database, AlertTriangle } from "lucide-react";
import { devError } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

type TimeRange = "daily" | "weekly" | "monthly" | "all";
type ExportFormat = "pdf" | "csv";

interface TableData {
  name: string;
  data: any[];
  error?: string;
}

interface ExportResult {
  tables: TableData[];
  failedTables: string[];
}

function formatIndianCurrency(amount: number): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "0.00";
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getDateRange(timeRange: TimeRange): { start: Date; end: Date } {
  const now = new Date();
  const end = endOfDay(now);
  
  switch (timeRange) {
    case "daily":
      return { start: startOfDay(now), end };
    case "weekly":
      return { start: startOfDay(subWeeks(now, 1)), end };
    case "monthly":
      return { start: startOfDay(subMonths(now, 1)), end };
    case "all":
    default:
      return { start: new Date("2020-01-01"), end };
  }
}

interface TableConfig {
  name: string;
  table: string;
  query: string;
  dateField?: string;
  orderField?: string;
  columns: { key: string; label: string }[];
  masterData?: boolean;
}

const tableConfigs: TableConfig[] = [
  { name: "Cattle", table: "cattle", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "tag_number", label: "Tag #" }, { key: "name", label: "Name" }, { key: "breed", label: "Breed" }, { key: "cattle_type", label: "Type" }, { key: "status", label: "Status" }, { key: "lactation_status", label: "Lactation" }, { key: "date_of_birth", label: "DOB" }, { key: "weight", label: "Weight" }, { key: "purchase_cost", label: "Cost" }] },
  { name: "Milk Production", table: "milk_production", query: "*, cattle(tag_number, name)", dateField: "production_date", orderField: "production_date",
    columns: [{ key: "production_date", label: "Date" }, { key: "cattle.tag_number", label: "Cattle" }, { key: "session", label: "Session" }, { key: "quantity_liters", label: "Qty (L)" }, { key: "fat_percentage", label: "Fat %" }, { key: "snf_percentage", label: "SNF %" }] },
  { name: "Customers", table: "customers", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "area", label: "Area" }, { key: "address", label: "Address" }, { key: "subscription_type", label: "Subscription" }, { key: "billing_cycle", label: "Billing" }, { key: "credit_balance", label: "Credit" }, { key: "advance_balance", label: "Advance" }, { key: "is_active", label: "Active" }] },
  { name: "Deliveries", table: "deliveries", query: "*, customer:customer_id(name)", dateField: "delivery_date", orderField: "delivery_date",
    columns: [{ key: "delivery_date", label: "Date" }, { key: "customer.name", label: "Customer" }, { key: "status", label: "Status" }, { key: "delivery_time", label: "Time" }, { key: "notes", label: "Notes" }] },
  { name: "Delivery Items", table: "delivery_items", query: "*, delivery:delivery_id(delivery_date), product:product_id(name)", orderField: "created_at",
    columns: [{ key: "delivery.delivery_date", label: "Date" }, { key: "product.name", label: "Product" }, { key: "quantity", label: "Qty" }, { key: "unit_price", label: "Price" }, { key: "total_amount", label: "Total" }] },
  { name: "Invoices", table: "invoices", query: "*, customer:customer_id(name)", dateField: "created_at", orderField: "created_at",
    columns: [{ key: "invoice_number", label: "Invoice #" }, { key: "customer.name", label: "Customer" }, { key: "billing_period_start", label: "Start" }, { key: "billing_period_end", label: "End" }, { key: "total_amount", label: "Total" }, { key: "discount_amount", label: "Discount" }, { key: "final_amount", label: "Final" }, { key: "paid_amount", label: "Paid" }, { key: "payment_status", label: "Status" }] },
  { name: "Payments", table: "payments", query: "*, customer:customer_id(name)", dateField: "payment_date", orderField: "payment_date",
    columns: [{ key: "payment_date", label: "Date" }, { key: "customer.name", label: "Customer" }, { key: "amount", label: "Amount" }, { key: "payment_method", label: "Method" }, { key: "reference_number", label: "Reference" }] },
  { name: "Employees", table: "employees", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "role", label: "Role" }, { key: "salary", label: "Salary" }, { key: "joining_date", label: "Joining" }, { key: "is_active", label: "Active" }] },
  { name: "Attendance", table: "attendance", query: "*, employee:employee_id(name)", dateField: "attendance_date", orderField: "attendance_date",
    columns: [{ key: "attendance_date", label: "Date" }, { key: "employee.name", label: "Employee" }, { key: "check_in", label: "In" }, { key: "check_out", label: "Out" }, { key: "status", label: "Status" }] },
  { name: "Employee Shifts", table: "employee_shifts", query: "*, employee:employee_id(name)", orderField: "created_at",
    columns: [{ key: "employee.name", label: "Employee" }, { key: "shift_date", label: "Date" }, { key: "start_time", label: "Start" }, { key: "end_time", label: "End" }] },
  { name: "Payroll Records", table: "payroll_records", query: "*, employee:employee_id(name)", dateField: "pay_period_start", orderField: "pay_period_start",
    columns: [{ key: "employee.name", label: "Employee" }, { key: "pay_period_start", label: "Period Start" }, { key: "pay_period_end", label: "Period End" }, { key: "gross_salary", label: "Gross" }, { key: "deductions", label: "Deductions" }, { key: "net_salary", label: "Net" }] },
  { name: "Expenses", table: "expenses", query: "*", dateField: "expense_date", orderField: "expense_date",
    columns: [{ key: "expense_date", label: "Date" }, { key: "title", label: "Title" }, { key: "category", label: "Category" }, { key: "amount", label: "Amount" }, { key: "notes", label: "Notes" }] },
  { name: "Health Records", table: "cattle_health", query: "*, cattle(tag_number, name)", dateField: "record_date", orderField: "record_date",
    columns: [{ key: "record_date", label: "Date" }, { key: "cattle.tag_number", label: "Cattle" }, { key: "record_type", label: "Type" }, { key: "diagnosis", label: "Diagnosis" }, { key: "treatment", label: "Treatment" }, { key: "vet_name", label: "Vet" }, { key: "cost", label: "Cost" }] },
  { name: "Breeding Records", table: "breeding_records", query: "*, cattle(tag_number, name)", dateField: "breeding_date", orderField: "breeding_date",
    columns: [{ key: "breeding_date", label: "Date" }, { key: "cattle.tag_number", label: "Cattle" }, { key: "breeding_type", label: "Type" }, { key: "bull_details", label: "Bull" }, { key: "status", label: "Status" }, { key: "expected_calving_date", label: "Expected Calving" }] },
  { name: "Feed Inventory", table: "feed_inventory", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "item_name", label: "Item" }, { key: "category", label: "Category" }, { key: "quantity", label: "Qty" }, { key: "unit", label: "Unit" }, { key: "min_stock_level", label: "Min Stock" }, { key: "cost_per_unit", label: "Cost/Unit" }] },
  { name: "Feed Consumption", table: "feed_consumption", query: "*, cattle(tag_number)", dateField: "consumption_date", orderField: "consumption_date",
    columns: [{ key: "consumption_date", label: "Date" }, { key: "cattle.tag_number", label: "Cattle" }, { key: "feed_type", label: "Feed" }, { key: "quantity", label: "Qty" }] },
  { name: "Products", table: "products", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "name", label: "Name" }, { key: "unit", label: "Unit" }, { key: "price", label: "Price" }, { key: "is_active", label: "Active" }] },
  { name: "Price Rules", table: "price_rules", query: "*, product:product_id(name)", masterData: true, orderField: "created_at",
    columns: [{ key: "product.name", label: "Product" }, { key: "rule_type", label: "Type" }, { key: "min_quantity", label: "Min Qty" }, { key: "price", label: "Price" }, { key: "is_active", label: "Active" }] },
  { name: "Routes", table: "routes", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "name", label: "Name" }, { key: "description", label: "Description" }, { key: "is_active", label: "Active" }] },
  { name: "Route Stops", table: "route_stops", query: "*, route:route_id(name), customer:customer_id(name)", masterData: true, orderField: "stop_order",
    columns: [{ key: "route.name", label: "Route" }, { key: "customer.name", label: "Customer" }, { key: "stop_order", label: "Order" }] },
  { name: "Bottles", table: "bottles", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "bottle_type", label: "Type" }, { key: "size", label: "Size" }, { key: "total_quantity", label: "Total" }, { key: "available_quantity", label: "Available" }, { key: "deposit_amount", label: "Deposit" }] },
  { name: "Customer Bottles", table: "customer_bottles", query: "*, customer:customer_id(name)", masterData: true, orderField: "created_at",
    columns: [{ key: "customer.name", label: "Customer" }, { key: "bottle_type", label: "Type" }, { key: "bottle_size", label: "Size" }, { key: "quantity_issued", label: "Issued" }, { key: "quantity_returned", label: "Returned" }, { key: "deposit_amount", label: "Deposit" }] },
  { name: "Bottle Transactions", table: "bottle_transactions", query: "*", dateField: "transaction_date", orderField: "transaction_date",
    columns: [{ key: "transaction_date", label: "Date" }, { key: "transaction_type", label: "Type" }, { key: "quantity", label: "Qty" }, { key: "notes", label: "Notes" }] },
  { name: "Customer Ledger", table: "customer_ledger", query: "*, customer:customer_id(name)", dateField: "transaction_date", orderField: "transaction_date",
    columns: [{ key: "transaction_date", label: "Date" }, { key: "customer.name", label: "Customer" }, { key: "transaction_type", label: "Type" }, { key: "amount", label: "Amount" }, { key: "running_balance", label: "Balance" }, { key: "description", label: "Description" }] },
  { name: "Customer Accounts", table: "customer_accounts", query: "*, customer:customer_id(name)", masterData: true, orderField: "created_at",
    columns: [{ key: "customer.name", label: "Customer" }, { key: "phone", label: "Phone" }, { key: "is_active", label: "Active" }] },
  { name: "Customer Products", table: "customer_products", query: "*, customer:customer_id(name), product:product_id(name)", masterData: true, orderField: "created_at",
    columns: [{ key: "customer.name", label: "Customer" }, { key: "product.name", label: "Product" }, { key: "quantity", label: "Qty" }, { key: "unit_price", label: "Price" }, { key: "is_active", label: "Active" }] },
  { name: "Customer Vacations", table: "customer_vacations", query: "*, customer:customer_id(name)", dateField: "start_date", orderField: "start_date",
    columns: [{ key: "customer.name", label: "Customer" }, { key: "start_date", label: "Start" }, { key: "end_date", label: "End" }, { key: "reason", label: "Reason" }] },
  { name: "Equipment", table: "equipment", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "name", label: "Name" }, { key: "equipment_type", label: "Type" }, { key: "purchase_date", label: "Purchase Date" }, { key: "purchase_cost", label: "Cost" }, { key: "status", label: "Status" }] },
  { name: "Maintenance Records", table: "maintenance_records", query: "*, equipment:equipment_id(name)", dateField: "maintenance_date", orderField: "maintenance_date",
    columns: [{ key: "maintenance_date", label: "Date" }, { key: "equipment.name", label: "Equipment" }, { key: "maintenance_type", label: "Type" }, { key: "cost", label: "Cost" }, { key: "notes", label: "Notes" }] },
  { name: "Dairy Settings", table: "dairy_settings", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "dairy_name", label: "Dairy Name" }, { key: "address", label: "Address" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "currency", label: "Currency" }, { key: "invoice_prefix", label: "Invoice Prefix" }] },
  { name: "User Profiles", table: "profiles", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "full_name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "role", label: "Role" }] },
  { name: "User Roles", table: "user_roles", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "user_id", label: "User ID" }, { key: "role", label: "Role" }] },
  { name: "Activity Logs", table: "activity_logs", query: "*", dateField: "created_at", orderField: "created_at",
    columns: [{ key: "created_at", label: "Time" }, { key: "entity_type", label: "Entity" }, { key: "action", label: "Action" }, { key: "user_id", label: "User" }] },
  { name: "Notification Logs", table: "notification_logs", query: "*", dateField: "created_at", orderField: "created_at",
    columns: [{ key: "created_at", label: "Time" }, { key: "notification_type", label: "Type" }, { key: "recipient", label: "Recipient" }, { key: "status", label: "Status" }] },
  { name: "Notification Templates", table: "notification_templates", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "name", label: "Name" }, { key: "template_type", label: "Type" }, { key: "subject", label: "Subject" }, { key: "is_active", label: "Active" }] },
  { name: "Shifts", table: "shifts", query: "*", masterData: true, orderField: "created_at",
    columns: [{ key: "name", label: "Name" }, { key: "start_time", label: "Start" }, { key: "end_time", label: "End" }] },
  { name: "Auth Attempts (Admin)", table: "auth_attempts", query: "*", dateField: "last_attempt", orderField: "last_attempt",
    columns: [{ key: "phone", label: "Phone" }, { key: "failed_count", label: "Failed" }, { key: "last_attempt", label: "Last Attempt" }, { key: "locked_until", label: "Locked Until" }] },
  { name: "Customer Auth Attempts", table: "customer_auth_attempts", query: "*", dateField: "last_attempt", orderField: "last_attempt",
    columns: [{ key: "phone", label: "Phone" }, { key: "failed_count", label: "Failed" }, { key: "last_attempt", label: "Last Attempt" }, { key: "locked_until", label: "Locked Until" }] },
];

async function fetchAllData(timeRange: TimeRange): Promise<ExportResult> {
  const { start, end } = getDateRange(timeRange);
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");

  const results: TableData[] = [];
  const failedTables: string[] = [];

  for (const config of tableConfigs) {
    try {
      let q = (supabase.from(config.table as any) as any).select(config.query);
      
      if (config.dateField && timeRange !== "all" && !config.masterData) {
        q = q.gte(config.dateField, startStr).lte(config.dateField, endStr);
      }
      
      const orderField = config.orderField || config.dateField || "created_at";
      q = q.order(orderField, { ascending: false });
      
      const { data, error } = await q;
      
      if (error) {
        failedTables.push(config.name);
        results.push({ name: config.name, data: [], error: error.message });
      } else {
        results.push({ name: config.name, data: data || [] });
      }
    } catch (err: any) {
      failedTables.push(config.name);
      results.push({ name: config.name, data: [], error: err?.message || "Unknown error" });
    }
  }

  return { tables: results, failedTables };
}

function getNestedValue(obj: any, path: string): any {
  const parts = path.split(".");
  let value = obj;
  for (const part of parts) {
    value = value?.[part];
  }
  return value;
}

function formatValue(value: any, key: string): string {
  if (value === null || value === undefined) return "-";
  
  if (key.includes("date") || key.includes("Date")) {
    try {
      return format(new Date(value), "dd/MM/yy");
    } catch {
      return String(value);
    }
  }
  
  if (key.includes("amount") || key.includes("cost") || key.includes("price") || 
      key.includes("salary") || key.includes("balance") || key.includes("deposit")) {
    const num = Number(value);
    if (!isNaN(num)) return `₹${formatIndianCurrency(num)}`;
  }
  
  if (typeof value === "boolean") return value ? "Yes" : "No";
  
  if (key.includes("time") && typeof value === "string") {
    try {
      return format(new Date(value), "HH:mm");
    } catch {
      return String(value);
    }
  }
  
  const strVal = String(value);
  if (strVal.length > 40) return strVal.substring(0, 40) + "...";
  return strVal;
}

function generateCSV(result: ExportResult, timeRange: TimeRange): void {
  const timestamp = format(new Date(), "yyyy-MM-dd_HH-mm");
  const rangeLabel = timeRange === "all" ? "Complete" : timeRange.charAt(0).toUpperCase() + timeRange.slice(1);

  for (const config of tableConfigs) {
    const tableData = result.tables.find(t => t.name === config.name);
    if (!tableData || tableData.data.length === 0) continue;

    const csvRows: string[] = [];
    csvRows.push(config.columns.map(c => c.label).join(","));

    tableData.data.forEach((row: any) => {
      const values = config.columns.map((col) => {
        const value = getNestedValue(row, col.key);
        if (value === null || value === undefined) return "";
        const strVal = String(value);
        if (strVal.includes(",") || strVal.includes('"') || strVal.includes("\n")) {
          return `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      });
      csvRows.push(values.join(","));
    });

    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `DoodhWallah_${config.name.replace(/\s+/g, "_")}_${rangeLabel}_${timestamp}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

async function generatePDF(result: ExportResult, timeRange: TimeRange): Promise<void> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  
  const primaryColor: [number, number, number] = [79, 70, 229];
  const secondaryColor: [number, number, number] = [16, 185, 129];
  const darkColor: [number, number, number] = [30, 41, 59];
  const warningColor: [number, number, number] = [245, 158, 11];

  const { start, end } = getDateRange(timeRange);
  const rangeLabel = timeRange === "all" ? "Complete Data Backup" : `${timeRange.charAt(0).toUpperCase() + timeRange.slice(1)} Report`;
  const dateRangeStr = timeRange === "all" 
    ? "All Records" 
    : `${format(start, "dd MMM yyyy")} - ${format(end, "dd MMM yyyy")}`;

  let currentPage = 1;

  const addHeader = () => {
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 22, "F");
    doc.setFillColor(...secondaryColor);
    doc.rect(0, 22, pageWidth, 2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Doodh Wallah - Data Backup", margin, 14);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${rangeLabel} | ${dateRangeStr}`, pageWidth - margin, 14, { align: "right" });
  };

  const addFooter = () => {
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(7);
    doc.text(
      `Generated: ${format(new Date(), "dd MMM yyyy HH:mm")} | Page ${currentPage}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );
  };

  addHeader();
  let yPos = 32;

  doc.setTextColor(...darkColor);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Export Summary", margin, yPos);
  yPos += 8;

  const summaryRows: string[][] = [];
  let totalRecords = 0;
  
  for (const tableData of result.tables) {
    const count = tableData.data.length;
    totalRecords += count;
    const status = tableData.error ? `Error: ${tableData.error}` : (count === 0 ? "No data" : `${count} records`);
    summaryRows.push([tableData.name, status]);
  }

  autoTable(doc, {
    startY: yPos,
    head: [["Data Category", "Status"]],
    body: summaryRows,
    margin: { left: margin, right: pageWidth / 2 },
    tableWidth: pageWidth / 2 - margin,
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 2,
    },
    bodyStyles: {
      textColor: darkColor,
      fontSize: 7,
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  const financialY = yPos;
  const financialX = pageWidth / 2 + 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Financial Summary", financialX, financialY);

  const invoicesTable = result.tables.find(t => t.name === "Invoices");
  const expensesTable = result.tables.find(t => t.name === "Expenses");

  const totalRevenue = (invoicesTable?.data || []).reduce((sum: number, r: any) => sum + (Number(r.final_amount) || 0), 0);
  const totalPaid = (invoicesTable?.data || []).reduce((sum: number, r: any) => sum + (Number(r.paid_amount) || 0), 0);
  const totalExpenses = (expensesTable?.data || []).reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

  const financialData = [
    ["Total Invoiced", `₹${formatIndianCurrency(totalRevenue)}`],
    ["Amount Collected", `₹${formatIndianCurrency(totalPaid)}`],
    ["Pending Amount", `₹${formatIndianCurrency(totalRevenue - totalPaid)}`],
    ["Total Expenses", `₹${formatIndianCurrency(totalExpenses)}`],
    ["Net Position", `₹${formatIndianCurrency(totalPaid - totalExpenses)}`],
  ];

  autoTable(doc, {
    startY: financialY + 5,
    head: [["Metric", "Amount"]],
    body: financialData,
    margin: { left: financialX, right: margin },
    tableWidth: pageWidth / 2 - margin - 10,
    headStyles: {
      fillColor: secondaryColor,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 2,
    },
    bodyStyles: {
      textColor: darkColor,
      fontSize: 7,
      cellPadding: 2,
    },
  });

  if (result.failedTables.length > 0) {
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(margin, yPos, pageWidth - margin * 2, 12, 2, 2, "F");
    doc.setTextColor(...warningColor);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(`Warning: Failed to export: ${result.failedTables.join(", ")}`, margin + 5, yPos + 7);
  }

  addFooter();

  for (const config of tableConfigs) {
    const tableData = result.tables.find(t => t.name === config.name);
    if (!tableData || tableData.data.length === 0) continue;

    doc.addPage();
    currentPage++;
    addHeader();

    yPos = 30;
    doc.setTextColor(...darkColor);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(config.name, margin, yPos);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`(${tableData.data.length} records${config.masterData ? " - Master Data" : ""})`, margin + doc.getTextWidth(config.name) + 3, yPos);
    yPos += 6;

    const headers = config.columns.map(c => c.label);
    const rows = tableData.data.map((row: any) => 
      config.columns.map(col => formatValue(getNestedValue(row, col.key), col.key))
    );

    autoTable(doc, {
      startY: yPos,
      head: [headers],
      body: rows,
      margin: { left: margin, right: margin },
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7,
        cellPadding: 2,
      },
      bodyStyles: {
        textColor: darkColor,
        fontSize: 6,
        cellPadding: 1.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      styles: {
        overflow: "linebreak",
        cellWidth: "auto",
      },
      didDrawPage: () => {
        addFooter();
      },
    });
  }

  const timestamp = format(new Date(), "yyyy-MM-dd_HH-mm");
  const rangeFileName = timeRange === "all" ? "Complete" : timeRange.charAt(0).toUpperCase() + timeRange.slice(1);
  doc.save(`DoodhWallah_Backup_${rangeFileName}_${timestamp}.pdf`);
}

export function DataExportDialog() {
  const [open, setOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("monthly");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const { toast } = useToast();

  const handleExport = async () => {
    setExporting(true);
    setExportResult(null);
    
    try {
      const result = await fetchAllData(timeRange);
      setExportResult(result);

      if (exportFormat === "csv") {
        generateCSV(result, timeRange);
      } else {
        await generatePDF(result, timeRange);
      }

      if (result.failedTables.length > 0) {
        toast({
          title: "Export Completed with Warnings",
          description: `Some tables failed: ${result.failedTables.join(", ")}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Export Complete",
          description: exportFormat === "csv" 
            ? "All CSV files have been downloaded." 
            : "Your backup report has been downloaded.",
        });
        setOpen(false);
      }
    } catch (error: any) {
      devError("Export error:", error);
      toast({
        title: "Export Failed",
        description: error?.message || "There was an error exporting your data.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Database className="h-4 w-4" />
          Backup / Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Export Data Backup
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Time Range</label>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Today Only</SelectItem>
                <SelectItem value="weekly">Last 7 Days</SelectItem>
                <SelectItem value="monthly">Last 30 Days</SelectItem>
                <SelectItem value="all">All Data (Complete Backup)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Note: Master data (Cattle, Customers, Employees, Products, etc.) is always exported in full.
              Date filtering applies to transactional records only.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Export Format</label>
            <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    PDF Report (summary + all tables)
                  </span>
                </SelectItem>
                <SelectItem value="csv">
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    CSV Files (for Excel/Sheets)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            <p className="font-medium mb-1">Complete Backup ({tableConfigs.length} data categories):</p>
            <p className="text-xs leading-relaxed">
              Cattle, Milk Production, Customers, Customer Accounts, Customer Products, Customer Vacations, 
              Deliveries, Delivery Items, Invoices, Payments, Employees, Attendance, Employee Shifts, Payroll, 
              Expenses, Health Records, Breeding Records, Feed Inventory, Feed Consumption, Products, Price Rules, 
              Routes, Route Stops, Bottles, Customer Bottles, Bottle Transactions, Customer Ledger, Equipment, 
              Maintenance, Settings, User Profiles, User Roles, Activity Logs, Notifications, Notification Templates, 
              Shifts, Auth Attempts
            </p>
          </div>

          {exportResult && exportResult.failedTables.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Failed to export: {exportResult.failedTables.join(", ")}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export {exportFormat.toUpperCase()}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
