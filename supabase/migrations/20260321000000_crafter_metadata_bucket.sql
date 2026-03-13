-- Crafter metadata storage bucket for dGuild-hosted token metadata JSON.
-- Public so indexers and wallets can fetch metadata by URI.
insert into storage.buckets (id, name, public)
values ('crafter-metadata', 'crafter-metadata', true)
on conflict (id) do nothing;
