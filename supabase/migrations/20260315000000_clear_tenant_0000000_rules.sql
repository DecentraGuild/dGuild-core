-- Remove all condition sets, conditions, and Discord role rules for tenant 0000000 (fresh reset).
-- Order: delete discord_role_rules first (they reference condition_sets), then condition_sets (cascades to condition_set_conditions).

DELETE FROM public.discord_role_rules
WHERE discord_guild_id IN (
  SELECT discord_guild_id FROM public.discord_servers WHERE tenant_id = '0000000'
);

DELETE FROM public.condition_sets
WHERE tenant_id = '0000000';
