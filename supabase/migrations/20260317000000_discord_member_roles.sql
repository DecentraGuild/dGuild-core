-- Cache Discord member roles for shipment JSON generator (DISCORD conditions).
-- Populated by discord-bot eligible action when the bot syncs.
-- Read by qualification rules-mode-json when generating shipment lists.

CREATE TABLE IF NOT EXISTS public.discord_member_roles (
  discord_guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  role_ids JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (discord_guild_id, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_member_roles_guild
  ON public.discord_member_roles(discord_guild_id);
