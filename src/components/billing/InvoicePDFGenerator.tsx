import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { devError } from "@/lib/utils";

function formatIndianCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return amount < 0 ? `-₹${formatted}` : `₹${formatted}`;
}

interface DairySettings {
  dairy_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  invoice_prefix: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  area: string | null;
}

interface DeliveryItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  delivery_date: string;
}

// Type for Supabase delivery query result
interface DeliveryQueryResult {
  delivery_date: string;
  delivery_items: Array<{
    quantity: number;
    unit_price: number;
    total_amount: number;
    product: { name: string } | null;
  }> | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  billing_period_start: string;
  billing_period_end: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_status: string;
  due_date: string | null;
  created_at: string;
  customer?: {
    id: string;
    name: string;
  };
}

interface InvoicePDFGeneratorProps {
  invoice: Invoice;
  onGenerated?: () => void;
}

export function InvoicePDFGenerator({ invoice, onGenerated }: InvoicePDFGeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);

  const generatePDF = async (action: "download" | "preview" = "download") => {
    setGenerating(true);

    try {
      // Fetch dairy settings
      const { data: settingsData } = await supabase
        .from("dairy_settings")
        .select("*")
        .limit(1)
        .single();

      const settings: DairySettings = settingsData || {
        dairy_name: "Doodh Wallah Dairy",
        address: null,
        phone: null,
        email: null,
        currency: "INR",
        invoice_prefix: "INV",
      };

      // Fetch customer details
      const { data: customerData } = await supabase
        .from("customers")
        .select("*")
        .eq("id", invoice.customer_id)
        .single();

      const customer: Customer = customerData || {
        id: invoice.customer_id,
        name: invoice.customer?.name || "Customer",
        phone: null,
        email: null,
        address: null,
        area: null,
      };

      // Fetch delivery items for this billing period
      const { data: deliveries } = await supabase
        .from("deliveries")
        .select(`
          delivery_date,
          delivery_items (
            quantity,
            unit_price,
            total_amount,
            product:product_id (name)
          )
        `)
        .eq("customer_id", invoice.customer_id)
        .gte("delivery_date", invoice.billing_period_start)
        .lte("delivery_date", invoice.billing_period_end)
        .eq("status", "delivered");

      // Flatten delivery items with proper typing
      const items: DeliveryItem[] = [];
      const typedDeliveries = (deliveries || []) as DeliveryQueryResult[];
      typedDeliveries.forEach((delivery) => {
        (delivery.delivery_items || []).forEach((item) => {
          items.push({
            product_name: item.product?.name || "Product",
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_amount: item.total_amount,
            delivery_date: delivery.delivery_date,
          });
        });
      });

      // Create PDF
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;

      // Colors - Modern gradient theme
      const primaryColor: [number, number, number] = [79, 70, 229]; // Indigo
      const secondaryColor: [number, number, number] = [16, 185, 129]; // Emerald
      const accentColor: [number, number, number] = [245, 158, 11]; // Amber
      const darkColor: [number, number, number] = [30, 41, 59]; // Slate-800
      const lightBg: [number, number, number] = [248, 250, 252]; // Slate-50

      // Header background with gradient effect
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 55, "F");
      
      // Decorative accent stripe
      doc.setFillColor(...secondaryColor);
      doc.rect(0, 55, pageWidth, 3, "F");

      // Company name
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text(settings.dairy_name, margin, 25);

      // Company tagline
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Fresh Dairy Products Delivered Daily", margin, 33);

      // Company contact info
      doc.setFontSize(9);
      const contactParts: string[] = [];
      if (settings.phone) contactParts.push(`Tel: ${settings.phone}`);
      if (settings.email) contactParts.push(`Email: ${settings.email}`);
      if (settings.address) contactParts.push(settings.address);
      doc.text(contactParts.join(" | ") || "Premium Quality Dairy Products", margin, 42);

      // Invoice badge on the right
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(pageWidth - margin - 55, 12, 55, 30, 3, 3, "F");
      
      doc.setTextColor(...primaryColor);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("INVOICE", pageWidth - margin - 27.5, 24, { align: "center" });
      
      doc.setTextColor(...darkColor);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(invoice.invoice_number, pageWidth - margin - 27.5, 32, { align: "center" });

      // Invoice details section
      let yPos = 70;

      // Customer and invoice info boxes
      // Left box - Bill To
      doc.setFillColor(...lightBg);
      doc.roundedRect(margin, yPos, (pageWidth - margin * 2 - 10) / 2, 45, 3, 3, "F");
      
      doc.setTextColor(...primaryColor);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("BILL TO", margin + 8, yPos + 12);
      
      doc.setTextColor(...darkColor);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(customer.name, margin + 8, yPos + 22);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      let customerYPos = yPos + 28;
      if (customer.address) {
        doc.text(customer.address, margin + 8, customerYPos);
        customerYPos += 5;
      }
      if (customer.area) {
        doc.text(`Area: ${customer.area}`, margin + 8, customerYPos);
        customerYPos += 5;
      }
      if (customer.phone) {
        doc.text(`Phone: ${customer.phone}`, margin + 8, customerYPos);
      }

      // Right box - Invoice Details
      const rightBoxX = margin + (pageWidth - margin * 2 - 10) / 2 + 10;
      doc.setFillColor(...lightBg);
      doc.roundedRect(rightBoxX, yPos, (pageWidth - margin * 2 - 10) / 2, 45, 3, 3, "F");

      doc.setTextColor(...primaryColor);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("INVOICE DETAILS", rightBoxX + 8, yPos + 12);

      doc.setTextColor(...darkColor);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      const detailsStartY = yPos + 20;
      const labelX = rightBoxX + 8;
      const valueX = rightBoxX + 50;
      
      doc.setFont("helvetica", "bold");
      doc.text("Date:", labelX, detailsStartY);
      doc.setFont("helvetica", "normal");
      doc.text(format(new Date(invoice.created_at), "dd MMM yyyy"), valueX, detailsStartY);

      doc.setFont("helvetica", "bold");
      doc.text("Period:", labelX, detailsStartY + 6);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${format(new Date(invoice.billing_period_start), "dd MMM")} - ${format(new Date(invoice.billing_period_end), "dd MMM yyyy")}`,
        valueX,
        detailsStartY + 6
      );

      doc.setFont("helvetica", "bold");
      doc.text("Due Date:", labelX, detailsStartY + 12);
      doc.setFont("helvetica", "normal");
      doc.text(
        invoice.due_date ? format(new Date(invoice.due_date), "dd MMM yyyy") : "On Receipt",
        valueX,
        detailsStartY + 12
      );

      // Status badge
      const statusText = invoice.payment_status.toUpperCase();
      let statusColor: [number, number, number];
      switch (invoice.payment_status) {
        case "paid":
          statusColor = [16, 185, 129];
          break;
        case "partial":
          statusColor = [245, 158, 11];
          break;
        case "overdue":
          statusColor = [239, 68, 68];
          break;
        default:
          statusColor = [100, 116, 139];
      }
      
      doc.setFillColor(...statusColor);
      doc.roundedRect(labelX, detailsStartY + 16, 35, 8, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(statusText, labelX + 17.5, detailsStartY + 22, { align: "center" });

      yPos += 55;

      // Items table
      if (items.length > 0) {
        // Group items by product and sum quantities
        const groupedItems = items.reduce((acc: any, item) => {
          const key = item.product_name;
          if (!acc[key]) {
            acc[key] = {
              product_name: item.product_name,
              quantity: 0,
              unit_price: item.unit_price,
              total_amount: 0,
            };
          }
          acc[key].quantity += item.quantity;
          acc[key].total_amount += item.total_amount;
          return acc;
        }, {});

        const tableData = Object.values(groupedItems).map((item: any, index: number) => [
          index + 1,
          item.product_name,
          item.quantity.toFixed(2),
          formatIndianCurrency(item.unit_price),
          formatIndianCurrency(item.total_amount),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [["#", "Product", "Qty", "Unit Price", "Amount"]],
          body: tableData,
          margin: { left: margin, right: margin },
          headStyles: {
            fillColor: primaryColor,
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 10,
            cellPadding: 4,
          },
          bodyStyles: {
            textColor: darkColor,
            fontSize: 9,
            cellPadding: 4,
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          columnStyles: {
            0: { cellWidth: 12, halign: "center" },
            1: { cellWidth: "auto" },
            2: { cellWidth: 25, halign: "right" },
            3: { cellWidth: 30, halign: "right" },
            4: { cellWidth: 30, halign: "right" },
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      } else {
        // No items - show period summary
        doc.setFontSize(10);
        doc.setTextColor(...darkColor);
        doc.text("Billing Summary for the Period", margin, yPos + 10);
        yPos += 20;
      }

      // Summary section
      const summaryX = pageWidth - margin - 80;
      const summaryWidth = 80;

      doc.setFillColor(...lightBg);
      doc.roundedRect(summaryX, yPos, summaryWidth, 55, 3, 3, "F");

      const summaryLabelX = summaryX + 5;
      const summaryValueX = summaryX + summaryWidth - 5;
      let summaryY = yPos + 12;

      doc.setFontSize(9);
      doc.setTextColor(...darkColor);
      
      doc.setFont("helvetica", "normal");
      doc.text("Subtotal:", summaryLabelX, summaryY);
      doc.text(formatIndianCurrency(Number(invoice.total_amount)), summaryValueX, summaryY, { align: "right" });
      
      summaryY += 8;
      doc.text("Discount:", summaryLabelX, summaryY);
      doc.setTextColor(...secondaryColor);
      const discountAmount = Math.abs(Number(invoice.discount_amount));
      doc.text(discountAmount > 0 ? `-${formatIndianCurrency(discountAmount)}` : formatIndianCurrency(0), summaryValueX, summaryY, { align: "right" });
      
      summaryY += 8;
      doc.setTextColor(...darkColor);
      doc.text("Tax:", summaryLabelX, summaryY);
      doc.text(formatIndianCurrency(Number(invoice.tax_amount)), summaryValueX, summaryY, { align: "right" });

      // Divider
      summaryY += 5;
      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.5);
      doc.line(summaryLabelX, summaryY, summaryValueX, summaryY);

      // Grand Total
      summaryY += 10;
      doc.setFillColor(...primaryColor);
      doc.roundedRect(summaryLabelX - 2, summaryY - 6, summaryWidth - 6, 14, 2, 2, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Grand Total:", summaryLabelX + 3, summaryY + 2);
      doc.setFontSize(11);
      doc.text(formatIndianCurrency(Number(invoice.final_amount)), summaryValueX - 3, summaryY + 2, { align: "right" });

      // Payment info box
      yPos += 65;
      if (Number(invoice.paid_amount) > 0) {
        doc.setFillColor(209, 250, 229); // Green light bg
        doc.roundedRect(margin, yPos, pageWidth - margin * 2, 20, 3, 3, "F");
        
        doc.setTextColor(16, 185, 129);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Amount Paid:", margin + 10, yPos + 9);
        doc.text(formatIndianCurrency(Number(invoice.paid_amount)), margin + 55, yPos + 9);
        
        const balance = Number(invoice.final_amount) - Number(invoice.paid_amount);
        if (balance > 0) {
          doc.setTextColor(239, 68, 68);
          doc.text(`Balance Due: ${formatIndianCurrency(balance)}`, pageWidth - margin - 10, yPos + 9, { align: "right" });
        }
        
        yPos += 25;
      }

      // Footer
      const footerY = pageHeight - 30;
      
      // Decorative line
      doc.setFillColor(...secondaryColor);
      doc.rect(0, footerY - 5, pageWidth, 2, "F");

      // Thank you message
      doc.setTextColor(...primaryColor);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Thank you for your business!", pageWidth / 2, footerY + 5, { align: "center" });

      // Footer contact
      doc.setTextColor(...darkColor);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        "For queries, please contact us • Payment is due within 15 days of invoice date",
        pageWidth / 2,
        footerY + 12,
        { align: "center" }
      );

      // Generated timestamp
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Generated on ${format(new Date(), "dd MMM yyyy 'at' HH:mm")}`,
        pageWidth / 2,
        footerY + 18,
        { align: "center" }
      );

      if (action === "download") {
        doc.save(`Invoice_${invoice.invoice_number}_${customer.name.replace(/\s+/g, "_")}.pdf`);
        onGenerated?.();
      } else {
        const dataUrl = doc.output("datauristring");
        setPdfDataUrl(dataUrl);
        setPreviewOpen(true);
      }
    } catch (error) {
      devError("Error generating PDF:", error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => generatePDF("preview")}
          disabled={generating}
        >
          <Eye className="h-3 w-3" />
        </Button>
        <Button
          variant="default"
          size="sm"
          className="gap-1"
          onClick={() => generatePDF("download")}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          PDF
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl h-[90vh]">
          <DialogHeader>
            <DialogTitle>Invoice Preview - {invoice.invoice_number}</DialogTitle>
          </DialogHeader>
          {pdfDataUrl && (
            <iframe
              src={pdfDataUrl}
              className="w-full h-full rounded-lg border"
              title="Invoice Preview"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
