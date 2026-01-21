import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, File } from "lucide-react";
import { exportToExcel, exportToPDF, exportToCSV } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";
import { devError } from "@/lib/utils";

interface ExportColumn {
  key: string;
  header: string;
  width?: number;
}

interface ExportButtonProps<T extends Record<string, any>> {
  data: T[];
  columns: ExportColumn[];
  filename: string;
  title: string;
  disabled?: boolean;
}

export function ExportButton<T extends Record<string, any>>({
  data,
  columns,
  filename,
  title,
  disabled = false,
}: ExportButtonProps<T>) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'excel' | 'pdf' | 'csv') => {
    if (data.length === 0) {
      toast({ title: "No data", description: "There's no data to export", variant: "destructive" });
      return;
    }

    setExporting(true);
    try {
      switch (format) {
        case 'excel':
          exportToExcel(data, columns, filename);
          break;
        case 'pdf':
          exportToPDF(data, columns, filename, title, { orientation: columns.length > 6 ? 'landscape' : 'portrait' });
          break;
        case 'csv':
          exportToCSV(data, columns, filename);
          break;
      }
      toast({ title: "Export successful", description: `Data exported as ${format.toUpperCase()}` });
    } catch (error) {
      devError('Export error:', error);
      toast({ title: "Export failed", description: "Failed to export data", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || exporting}>
          <Download className="mr-2 h-4 w-4" />
          {exporting ? "Exporting..." : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('excel')}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Export to Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('pdf')}>
          <FileText className="mr-2 h-4 w-4" />
          Export to PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          <File className="mr-2 h-4 w-4" />
          Export to CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
