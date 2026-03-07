-- Tracker module: address book of SPL/NFT mints with per-mint tracking tiers.

CREATE TABLE IF NOT EXISTS tracker_address_book (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  mint TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('SPL', 'NFT')),
  tier TEXT NOT NULL DEFAULT 'base' CHECK (tier IN ('base', 'grow', 'pro')),
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, mint)
);

CREATE INDEX IF NOT EXISTS idx_tracker_address_book_tenant
  ON tracker_address_book(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tracker_address_book_tier
  ON tracker_address_book(tenant_id, tier);

-- Holder snapshots for Grow/Pro mints (daily).
CREATE TABLE IF NOT EXISTS tracker_holder_snapshots (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  mint TEXT NOT NULL,
  holder_wallets JSONB NOT NULL DEFAULT '[]',
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, mint, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_tracker_holder_snapshots_tenant_mint
  ON tracker_holder_snapshots(tenant_id, mint);

CREATE INDEX IF NOT EXISTS idx_tracker_holder_snapshots_date
  ON tracker_holder_snapshots(snapshot_date);
