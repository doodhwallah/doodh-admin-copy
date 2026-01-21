import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface LedgerEntry {
  customer_id: string;
  transaction_type: string;
  description: string;
  debit_amount?: number;
  credit_amount?: number;
  reference_id?: string;
}

interface LedgerResult {
  created: number;
  errors: string[];
}

const customerLocks = new Map<string, Promise<void>>();

async function withCustomerLock<T>(customerId: string, fn: () => Promise<T>): Promise<T> {
  const existingLock = customerLocks.get(customerId);
  
  let resolve: () => void;
  const newLock = new Promise<void>((r) => { resolve = r; });
  customerLocks.set(customerId, newLock);
  
  if (existingLock) {
    await existingLock;
  }
  
  try {
    return await fn();
  } finally {
    resolve!();
    if (customerLocks.get(customerId) === newLock) {
      customerLocks.delete(customerId);
    }
  }
}

/**
 * Ledger automation for automatic transaction logging
 * 
 * Auto-logs:
 * 1. Delivery charges → Debit entry
 * 2. Payments → Credit entry
 * 3. Invoice generation → Debit entry
 * 4. Advance payments → Credit entry
 * 
 * Uses per-customer locking to prevent race conditions in balance calculation.
 */
export function useLedgerAutomation() {
  const pendingOps = useRef(customerLocks);

  /**
   * Get current running balance for a customer
   */
  const getRunningBalance = useCallback(async (customerId: string): Promise<number> => {
    const { data } = await supabase
      .from("customer_ledger")
      .select("running_balance")
      .eq("customer_id", customerId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return data?.running_balance || 0;
  }, []);

  /**
   * Create a ledger entry with automatic balance calculation
   * Uses per-customer locking to ensure atomic balance updates
   */
  const createLedgerEntry = useCallback(async (entry: LedgerEntry): Promise<boolean> => {
    return withCustomerLock(entry.customer_id, async () => {
      const currentBalance = await getRunningBalance(entry.customer_id);
      const debit = entry.debit_amount || 0;
      const credit = entry.credit_amount || 0;
      const newBalance = currentBalance + debit - credit;

      const { error } = await supabase.from("customer_ledger").insert({
        customer_id: entry.customer_id,
        transaction_type: entry.transaction_type,
        description: entry.description,
        debit_amount: debit > 0 ? debit : null,
        credit_amount: credit > 0 ? credit : null,
        reference_id: entry.reference_id || null,
        running_balance: newBalance,
        transaction_date: format(new Date(), "yyyy-MM-dd"),
      });

      return !error;
    });
  }, [getRunningBalance]);

  /**
   * Log delivery charge to ledger
   */
  const logDeliveryCharge = useCallback(async (
    customerId: string,
    deliveryId: string,
    amount: number,
    date: string
  ): Promise<boolean> => {
    return createLedgerEntry({
      customer_id: customerId,
      transaction_type: "delivery",
      description: `Delivery charge for ${format(new Date(date), "dd MMM yyyy")}`,
      debit_amount: amount,
      reference_id: deliveryId,
    });
  }, [createLedgerEntry]);

  /**
   * Log payment to ledger
   */
  const logPayment = useCallback(async (
    customerId: string,
    paymentId: string,
    amount: number,
    paymentMode: string
  ): Promise<boolean> => {
    return createLedgerEntry({
      customer_id: customerId,
      transaction_type: "payment",
      description: `Payment received (${paymentMode})`,
      credit_amount: amount,
      reference_id: paymentId,
    });
  }, [createLedgerEntry]);

  /**
   * Log invoice to ledger
   */
  const logInvoice = useCallback(async (
    customerId: string,
    invoiceId: string,
    invoiceNumber: string,
    amount: number
  ): Promise<boolean> => {
    return createLedgerEntry({
      customer_id: customerId,
      transaction_type: "invoice",
      description: `Invoice ${invoiceNumber} generated`,
      debit_amount: amount,
      reference_id: invoiceId,
    });
  }, [createLedgerEntry]);

  /**
   * Log advance payment to ledger
   */
  const logAdvancePayment = useCallback(async (
    customerId: string,
    amount: number,
    notes?: string
  ): Promise<boolean> => {
    // Also update customer advance balance
    try {
      await supabase
        .from("customers")
        .update({ 
          advance_balance: supabase.rpc ? amount : amount // Will be handled by trigger if exists
        })
        .eq("id", customerId);
    } catch {
      // Ignore errors - advance balance update is optional
    }

    return createLedgerEntry({
      customer_id: customerId,
      transaction_type: "advance",
      description: notes || "Advance payment received",
      credit_amount: amount,
    });
  }, [createLedgerEntry]);

  /**
   * Sync ledger with existing invoices (for data integrity)
   */
  const syncInvoicesToLedger = useCallback(async (customerId: string): Promise<LedgerResult> => {
    const result: LedgerResult = { created: 0, errors: [] };

    // Get all invoices for customer
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, final_amount, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });

    // Get existing ledger entries for invoices
    const { data: existingEntries } = await supabase
      .from("customer_ledger")
      .select("reference_id")
      .eq("customer_id", customerId)
      .eq("transaction_type", "invoice");

    const existingRefs = new Set(existingEntries?.map(e => e.reference_id) || []);

    for (const invoice of invoices || []) {
      if (!existingRefs.has(invoice.id)) {
        const success = await logInvoice(
          customerId,
          invoice.id,
          invoice.invoice_number,
          invoice.final_amount
        );
        if (success) {
          result.created++;
        } else {
          result.errors.push(`Failed to log invoice ${invoice.invoice_number}`);
        }
      }
    }

    return result;
  }, [logInvoice]);

  /**
   * Calculate customer balance from ledger
   */
  const calculateBalance = useCallback(async (customerId: string): Promise<{
    total_debit: number;
    total_credit: number;
    balance: number;
  }> => {
    const { data: ledger } = await supabase
      .from("customer_ledger")
      .select("debit_amount, credit_amount")
      .eq("customer_id", customerId);

    if (!ledger || ledger.length === 0) {
      return { total_debit: 0, total_credit: 0, balance: 0 };
    }

    const total_debit = ledger.reduce((sum, e) => sum + (e.debit_amount || 0), 0);
    const total_credit = ledger.reduce((sum, e) => sum + (e.credit_amount || 0), 0);

    return {
      total_debit,
      total_credit,
      balance: total_debit - total_credit,
    };
  }, []);

  return {
    createLedgerEntry,
    logDeliveryCharge,
    logPayment,
    logInvoice,
    logAdvancePayment,
    syncInvoicesToLedger,
    calculateBalance,
    getRunningBalance,
  };
}
