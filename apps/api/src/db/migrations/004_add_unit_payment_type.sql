ALTER TABLE billing_payments DROP CONSTRAINT IF EXISTS billing_payments_payment_type_check;
ALTER TABLE billing_payments ADD CONSTRAINT billing_payments_payment_type_check
  CHECK (payment_type IN ('initial', 'upgrade_prorate', 'renewal', 'extend', 'registration', 'add_unit'));
