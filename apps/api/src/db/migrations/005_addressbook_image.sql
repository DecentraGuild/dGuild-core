-- Add image and name caching to tracker_address_book for the address book browser UI.
ALTER TABLE tracker_address_book
  ADD COLUMN IF NOT EXISTS image TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT;
