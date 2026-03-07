-- Store NFT collection traits on address book entries (trait_keys + trait_options, same shape as discord_guild_mints.trait_index).
ALTER TABLE tracker_address_book
  ADD COLUMN IF NOT EXISTS trait_index JSONB;
