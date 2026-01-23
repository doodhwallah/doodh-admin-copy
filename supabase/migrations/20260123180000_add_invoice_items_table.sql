-- Create invoice_items table for storing manual invoice line items
-- This supplements delivery_items for invoices not generated from deliveries

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity DECIMAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unit',
  rate DECIMAL NOT NULL,
  amount DECIMAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster invoice lookups
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- Enable RLS
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoice_items
CREATE POLICY "Enable read for authenticated users" ON invoice_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" ON invoice_items
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON invoice_items
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete for authenticated users" ON invoice_items
  FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE invoice_items IS 'Stores line items for manually created invoices';
