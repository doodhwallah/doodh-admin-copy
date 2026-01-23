import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Eye, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { devError } from "@/lib/utils";

function isCapacitorNative(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Capacitor = (window as any).Capacitor;
    return Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

async function handleCapacitorPDF(doc: jsPDF, fileName: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Capacitor = (window as any).Capacitor;
    const Filesystem = Capacitor?.Plugins?.Filesystem;
    const Share = Capacitor?.Plugins?.Share;
    const Browser = Capacitor?.Plugins?.Browser;
    
    // Method 1: Use Filesystem + Share plugins if available
    if (Filesystem && Share) {
      const pdfBase64 = doc.output("datauristring").split(",")[1];
      
      const result = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: "CACHE",
      });
      
      await Share.share({
        title: fileName,
        url: result.uri,
        dialogTitle: "Share Invoice PDF",
      });
      return;
    }
    
    // Method 2: Use Browser plugin to open in external browser
    if (Browser) {
      const pdfBlob = doc.output("blob");
      const blobUrl = URL.createObjectURL(pdfBlob);
      await Browser.open({ url: blobUrl });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      return;
    }
    
    // Method 3: Open data URI in external browser using _system target
    const dataUri = doc.output("datauristring");
    const externalWindow = window.open(dataUri, "_system");
    if (externalWindow) {
      return;
    }
    
    // Method 4: Try opening blob URL in external browser
    const pdfBlob = doc.output("blob");
    const blobUrl = URL.createObjectURL(pdfBlob);
    const systemWindow = window.open(blobUrl, "_system");
    if (systemWindow) {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      return;
    }
    
    // Method 5: Use anchor tag with download attribute
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  } catch (error) {
    devError("Capacitor PDF error:", error);
    // Last resort fallback
    doc.save(fileName);
  }
}

function formatIndianCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return amount < 0 ? `-₹${formatted}` : `₹${formatted}`;
}

async function loadLogoAsBase64(): Promise<string | null> {
  try {
    const response = await fetch('/logo.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
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
  unit: string;
}

// Type for Supabase delivery query result
interface DeliveryQueryResult {
  delivery_date: string;
  delivery_items: Array<{
    quantity: number;
    unit_price: number;
    total_amount: number;
    product: { name: string; unit: string } | null;
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
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    try {
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

      const { data: deliveries } = await supabase
        .from("deliveries")
        .select(`
          delivery_date,
          delivery_items (
            quantity,
            unit_price,
            total_amount,
            product:product_id (name, unit)
          )
        `)
        .eq("customer_id", invoice.customer_id)
        .gte("delivery_date", invoice.billing_period_start)
        .lte("delivery_date", invoice.billing_period_end)
        .eq("status", "delivered");

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
            unit: item.product?.unit || "unit",
          });
        });
      });

      interface GroupedItem {
        product_name: string;
        quantity: number;
        unit_price: number;
        total_amount: number;
        unit: string;
        delivery_count: number;
      }
      const groupedItems = items.reduce((acc: Record<string, GroupedItem>, item) => {
        const key = item.product_name;
        if (!acc[key]) {
          acc[key] = {
            product_name: item.product_name,
            quantity: 0,
            unit_price: item.unit_price,
            total_amount: 0,
            unit: item.unit,
            delivery_count: 0,
          };
        }
        acc[key].quantity += item.quantity;
        acc[key].total_amount += item.total_amount;
        acc[key].delivery_count += 1;
        return acc;
      }, {});

      const totalDeliveries = Object.values(groupedItems).reduce((sum, item) => sum + item.delivery_count, 0);

      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invoice ${invoice.invoice_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
            .header { background: #4f46e5; color: white; padding: 20px; margin: -20px -20px 20px; }
            .header h1 { font-size: 22px; margin-bottom: 5px; }
            .header p { font-size: 12px; opacity: 0.9; }
            .invoice-badge { background: white; color: #4f46e5; padding: 10px 15px; border-radius: 5px; display: inline-block; float: right; }
            .invoice-badge h2 { font-size: 14px; margin-bottom: 3px; }
            .invoice-badge span { font-size: 11px; color: #1e293b; }
            .clearfix::after { content: ""; clear: both; display: table; }
            .section { display: flex; gap: 20px; margin-bottom: 20px; }
            .box { flex: 1; background: #f8fafc; padding: 15px; border-radius: 5px; }
            .box h3 { color: #4f46e5; font-size: 11px; margin-bottom: 10px; text-transform: uppercase; }
            .box p { font-size: 12px; margin-bottom: 4px; }
            .box .name { font-size: 14px; font-weight: bold; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
            th { background: #4f46e5; color: white; padding: 10px; text-align: left; font-size: 11px; }
            td { padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
            tr:nth-child(even) { background: #f8fafc; }
            .text-right { text-align: right; }
            .summary { width: 250px; margin-left: auto; background: #f8fafc; padding: 15px; border-radius: 5px; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; }
            .summary-total { background: #4f46e5; color: white; padding: 10px; border-radius: 5px; margin-top: 10px; }
            .summary-total .summary-row { margin-bottom: 0; font-weight: bold; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #10b981; }
            .footer h4 { color: #4f46e5; margin-bottom: 5px; }
            .footer p { font-size: 10px; color: #64748b; }
            .status { display: inline-block; padding: 4px 12px; border-radius: 3px; font-size: 10px; font-weight: bold; color: white; }
            .status-paid { background: #10b981; }
            .status-partial { background: #f59e0b; }
            .status-pending { background: #64748b; }
            .status-overdue { background: #ef4444; }
            .note { font-size: 10px; color: #64748b; font-style: italic; margin-bottom: 15px; }
            @media print {
              body { padding: 0; }
              .header { margin: 0 0 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header clearfix">
            <div class="invoice-badge">
              <h2>INVOICE</h2>
              <span>${invoice.invoice_number}</span>
            </div>
            <h1>${settings.dairy_name}</h1>
            <p>Fresh Dairy Delivered</p>
            ${settings.phone || settings.email ? `<p style="margin-top:5px">${[settings.phone ? `Tel: ${settings.phone}` : '', settings.email ? `Email: ${settings.email}` : ''].filter(Boolean).join(' | ')}</p>` : ''}
            ${settings.address ? `<p>${settings.address}</p>` : ''}
          </div>
          
          <div class="section">
            <div class="box">
              <h3>Bill To</h3>
              <p class="name">${customer.name}</p>
              ${customer.address ? `<p>${customer.address}</p>` : ''}
              ${customer.area ? `<p>Area: ${customer.area}</p>` : ''}
              ${customer.phone ? `<p>Phone: ${customer.phone}</p>` : ''}
            </div>
            <div class="box">
              <h3>Invoice Details</h3>
              <p><strong>Date:</strong> ${format(new Date(invoice.created_at), "dd MMM yyyy")}</p>
              <p><strong>Period:</strong> ${format(new Date(invoice.billing_period_start), "dd MMM")} - ${format(new Date(invoice.billing_period_end), "dd MMM yyyy")}</p>
              <p><strong>Due Date:</strong> ${invoice.due_date ? format(new Date(invoice.due_date), "dd MMM yyyy") : "On Receipt"}</p>
              <p style="margin-top:8px"><span class="status status-${invoice.payment_status}">${invoice.payment_status.toUpperCase()}</span></p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th class="text-right">Total Qty</th>
                <th class="text-right">Rate</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${Object.values(groupedItems).map((item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${item.product_name}</td>
                  <td class="text-right">${item.quantity.toFixed(2)} ${item.unit}</td>
                  <td class="text-right">${formatIndianCurrency(item.unit_price)}/${item.unit}</td>
                  <td class="text-right">${formatIndianCurrency(item.total_amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <p class="note">* Based on ${totalDeliveries} deliveries during billing period</p>

          <div class="summary">
            <div class="summary-row"><span>Subtotal:</span><span>${formatIndianCurrency(Number(invoice.total_amount))}</span></div>
            <div class="summary-row"><span>Discount:</span><span style="color:#10b981">${Number(invoice.discount_amount) > 0 ? `-${formatIndianCurrency(Math.abs(Number(invoice.discount_amount)))}` : formatIndianCurrency(0)}</span></div>
            <div class="summary-row"><span>Tax:</span><span>${formatIndianCurrency(Number(invoice.tax_amount))}</span></div>
            <div class="summary-total">
              <div class="summary-row"><span>Grand Total:</span><span>${formatIndianCurrency(Number(invoice.final_amount))}</span></div>
            </div>
            ${Number(invoice.paid_amount) > 0 ? `
              <div style="margin-top:10px; padding:10px; background:#d1fae5; border-radius:5px;">
                <div class="summary-row" style="color:#10b981"><span>Amount Paid:</span><span>${formatIndianCurrency(Number(invoice.paid_amount))}</span></div>
                ${Number(invoice.final_amount) - Number(invoice.paid_amount) > 0 ? `
                  <div class="summary-row" style="color:#ef4444"><span>Balance Due:</span><span>${formatIndianCurrency(Number(invoice.final_amount) - Number(invoice.paid_amount))}</span></div>
                ` : ''}
              </div>
            ` : ''}
          </div>

          <div class="footer">
            <h4>Thank you for your business!</h4>
            <p>For queries, please contact us | Payment is due within 15 days of invoice date</p>
            <p style="margin-top:10px; color:#999">Generated on ${format(new Date(), "dd MMM yyyy 'at' HH:mm")}</p>
          </div>
        </body>
        </html>
      `;

      // Use iframe approach for better WebView compatibility
      const existingFrame = document.getElementById('print-frame');
      if (existingFrame) {
        existingFrame.remove();
      }
      
      const iframe = document.createElement('iframe');
      iframe.id = 'print-frame';
      iframe.style.position = 'absolute';
      iframe.style.top = '-10000px';
      iframe.style.left = '-10000px';
      iframe.style.width = '210mm';
      iframe.style.height = '297mm';
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(printContent);
        iframeDoc.close();
        
        // Wait for content to load then print
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            // Fallback: try window.print() which might work in some WebViews
            window.print();
          }
          // Clean up after printing
          setTimeout(() => {
            iframe.remove();
          }, 1000);
        }, 500);
      } else {
        // Fallback if iframe approach fails
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(printContent);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
          }, 250);
        }
      }
    } catch (error) {
      devError("Error printing invoice:", error);
    } finally {
      setPrinting(false);
    }
  };

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
            product:product_id (name, unit)
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
            unit: item.product?.unit || "unit",
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

      // Load logo
      const logoBase64 = await loadLogoAsBase64();

      // Header background with gradient effect
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 60, "F");
      
      // Decorative accent stripe
      doc.setFillColor(...secondaryColor);
      doc.rect(0, 60, pageWidth, 3, "F");

      // Add logo on the left
      const logoSize = 40;
      const logoX = margin;
      const logoY = 10;
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
      }

      // Company name (positioned after logo)
      const textStartX = logoBase64 ? margin + logoSize + 8 : margin;
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text(settings.dairy_name, textStartX, 28);

      // Company tagline
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Fresh Dairy Delivered", textStartX, 36);

      // Company contact info
      doc.setFontSize(8);
      const contactParts: string[] = [];
      if (settings.phone) contactParts.push(`Tel: ${settings.phone}`);
      if (settings.email) contactParts.push(`Email: ${settings.email}`);
      if (contactParts.length > 0) {
        doc.text(contactParts.join(" | "), textStartX, 44);
      }
      if (settings.address) {
        doc.text(settings.address, textStartX, 51);
      }

      // Invoice badge on the right
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(pageWidth - margin - 55, 15, 55, 32, 3, 3, "F");
      
      doc.setTextColor(...primaryColor);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("INVOICE", pageWidth - margin - 27.5, 27, { align: "center" });
      
      doc.setTextColor(...darkColor);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(invoice.invoice_number, pageWidth - margin - 27.5, 36, { align: "center" });

      // Invoice details section
      let yPos = 75;

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
        interface GroupedItem {
          product_name: string;
          quantity: number;
          unit_price: number;
          total_amount: number;
          unit: string;
          delivery_count: number;
        }
        const groupedItems = items.reduce((acc: Record<string, GroupedItem>, item) => {
          const key = item.product_name;
          if (!acc[key]) {
            acc[key] = {
              product_name: item.product_name,
              quantity: 0,
              unit_price: item.unit_price,
              total_amount: 0,
              unit: item.unit,
              delivery_count: 0,
            };
          }
          acc[key].quantity += item.quantity;
          acc[key].total_amount += item.total_amount;
          acc[key].delivery_count += 1;
          return acc;
        }, {});

        const tableData = Object.values(groupedItems).map((item, index) => [
          index + 1,
          item.product_name,
          `${item.quantity.toFixed(2)} ${item.unit}`,
          `${formatIndianCurrency(item.unit_price)}/${item.unit}`,
          formatIndianCurrency(item.total_amount),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [["#", "Product", "Total Qty", "Rate", "Amount"]],
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
            2: { cellWidth: 30, halign: "right" },
            3: { cellWidth: 35, halign: "right" },
            4: { cellWidth: 35, halign: "right" },
          },
        });

        // Add delivery summary below the table
        yPos = (doc as any).lastAutoTable.finalY + 5;
        const totalDeliveries = Object.values(groupedItems).reduce((sum, item) => sum + item.delivery_count, 0);
        doc.setFontSize(8);
        doc.setTextColor(...darkColor);
        doc.setFont("helvetica", "italic");
        doc.text(`* Based on ${totalDeliveries} deliveries during billing period`, margin, yPos);
        yPos += 8;
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

      const fileName = `Invoice_${invoice.invoice_number}_${customer.name.replace(/\s+/g, "_")}.pdf`;
      
      if (action === "download") {
        if (isCapacitorNative()) {
          await handleCapacitorPDF(doc, fileName);
        } else {
          doc.save(fileName);
        }
        onGenerated?.();
      } else {
        if (isCapacitorNative()) {
          await handleCapacitorPDF(doc, fileName);
        } else {
          const dataUrl = doc.output("datauristring");
          setPdfDataUrl(dataUrl);
          setPreviewOpen(true);
        }
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
          disabled={generating || printing}
        >
          <Eye className="h-3 w-3" />
        </Button>
        <Button
          variant="default"
          size="sm"
          className="gap-1"
          onClick={() => generatePDF("download")}
          disabled={generating || printing}
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={handlePrint}
          disabled={generating || printing}
        >
          {printing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Printer className="h-3 w-3" />
          )}
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
