-- Create sequences for correlative numbers
CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

-- Add columns to tables
ALTER TABLE public.affiliate_account_movements 
ADD COLUMN receipt_number INTEGER DEFAULT nextval('public.receipt_number_seq');

ALTER TABLE public.invoices 
ADD COLUMN invoice_number INTEGER DEFAULT nextval('public.invoice_number_seq');

-- Note: Existing rows will automatically get a number from the sequence because of the DEFAULT clause when adding the column.
