-- Tenant default whitelist (dGuild General). Base for transactions when no module/transaction override.
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS default_whitelist JSONB;
