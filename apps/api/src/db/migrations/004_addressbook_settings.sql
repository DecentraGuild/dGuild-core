-- Address Book module: settings per tenant (e.g. whitelist for member access).

CREATE TABLE IF NOT EXISTS addressbook_settings (
  tenant_id TEXT PRIMARY KEY,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addressbook_settings_tenant ON addressbook_settings(tenant_id);
