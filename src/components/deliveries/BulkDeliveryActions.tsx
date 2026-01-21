import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { devError } from "@/lib/utils";
import { 
  CheckCircle2, 
  Loader2, 
  Truck, 
  AlertTriangle,
  Package
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface PendingDelivery {
  id: string;
  customer_id: string;
  customer_name: string;
  delivery_date: string;
  status: string;
}

interface BulkDeliveryActionsProps {
  selectedDate: string;
  pendingDeliveries: PendingDelivery[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function BulkDeliveryActions({
  selectedDate,
  pendingDeliveries,
  open,
  onOpenChange,
  onComplete,
}: BulkDeliveryActionsProps) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{
    success: number;
    failed: number;
    skipped: number;
  } | null>(null);
  const { toast } = useToast();

  const handleMarkAllDelivered = async () => {
    if (pendingDeliveries.length === 0) {
      toast({
        title: "No pending deliveries",
        description: "All deliveries are already processed",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    setProgress(0);
    setResults(null);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < pendingDeliveries.length; i++) {
      const delivery = pendingDeliveries[i];

      try {
        // Check if customer is on vacation
        const { data: vacationCheck } = await supabase
          .rpc("is_customer_on_vacation", {
            _customer_id: delivery.customer_id,
            _check_date: delivery.delivery_date,
          });

        if (vacationCheck) {
          // Skip customers on vacation
          skipped++;
        } else {
          // Mark as delivered
          const { error } = await supabase
            .from("deliveries")
            .update({
              status: "delivered",
              delivery_time: new Date().toISOString(),
            })
            .eq("id", delivery.id);

          if (error) {
            devError("Error updating delivery:", error);
            failed++;
          } else {
            success++;
          }
        }
      } catch (err) {
        devError("Error processing delivery:", err);
        failed++;
      }

      setProgress(Math.round(((i + 1) / pendingDeliveries.length) * 100));
    }

    setProcessing(false);
    setResults({ success, failed, skipped });

    toast({
      title: "Bulk update complete",
      description: `${success} delivered, ${skipped} skipped (vacation), ${failed} failed`,
    });

    if (success > 0) {
      onComplete();
    }
  };

  const handleClose = () => {
    setResults(null);
    setProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Bulk Delivery Update
          </DialogTitle>
          <DialogDescription>
            Mark all pending deliveries for {format(new Date(selectedDate), "MMMM dd, yyyy")} as delivered
          </DialogDescription>
        </DialogHeader>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="pt-4 text-center">
              <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <div className="text-2xl font-bold">{pendingDeliveries.length}</div>
              <p className="text-sm text-muted-foreground">Pending Deliveries</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
              <div className="text-2xl font-bold text-success">
                {results?.success || 0}
              </div>
              <p className="text-sm text-muted-foreground">Will be Marked</p>
            </CardContent>
          </Card>
        </div>

        {/* Progress */}
        {processing && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Processing deliveries...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {/* Results */}
        {results && (
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Delivered
                  </span>
                  <span className="font-medium">{results.success}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Skipped (Vacation)
                  </span>
                  <span className="font-medium">{results.skipped}</span>
                </div>
                {results.failed > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Failed</span>
                    <span className="font-medium">{results.failed}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info about vacation skip */}
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Customers with active vacation/pause schedules will be automatically skipped
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && (
            <Button
              onClick={handleMarkAllDelivered}
              disabled={processing || pendingDeliveries.length === 0}
            >
              {processing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Mark All Delivered
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
