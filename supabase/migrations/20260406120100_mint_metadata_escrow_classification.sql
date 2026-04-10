ALTER TABLE public.mint_metadata
  ADD COLUMN IF NOT EXISTS spl_token_program TEXT,
  ADD COLUMN IF NOT EXISTS is_mpl_core BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_compressed_nft BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.mint_metadata DROP CONSTRAINT IF EXISTS mint_metadata_spl_token_program_check;
ALTER TABLE public.mint_metadata ADD CONSTRAINT mint_metadata_spl_token_program_check
  CHECK (spl_token_program IS NULL OR spl_token_program IN ('legacy', 'token_2022'));
