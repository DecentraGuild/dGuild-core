-- Add extended metadata fields to mint_metadata for next-gen marketplace and display.
-- DAS getAsset: update_authority (authorities), uri (content.json_uri), primary_sale_happened (royalty),
-- is_mutable, edition_nonce (metadata), token_standard (interface).

ALTER TABLE public.mint_metadata
  ADD COLUMN IF NOT EXISTS update_authority TEXT,
  ADD COLUMN IF NOT EXISTS uri TEXT,
  ADD COLUMN IF NOT EXISTS primary_sale_happened BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_mutable BOOLEAN,
  ADD COLUMN IF NOT EXISTS edition_nonce INTEGER,
  ADD COLUMN IF NOT EXISTS token_standard TEXT;
