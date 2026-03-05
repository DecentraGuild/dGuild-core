# Worker and ops module activation

## Module lifecycle (API worker)

The worker in this repo (`pnpm worker` / `apps/api/src/worker.ts`) runs only the **module lifecycle** job on a schedule. It:

1. Reads the list of tenant **ids** (primary keys) from the DB each run (`getAllTenantIds()`).
2. For each id, loads config from DB via `resolveTenant(id)` (or file in dev). Updates are done with `updateTenant(tenant.id, ...)`. **Canonical key everywhere is tenant id;** slug is display-only and can change.
3. Applies transitions: `active` -> `deactivating` when `deactivatedate` is reached, then `deactivating` -> `off` when `deactivatingUntil` is reached.

**When you activate a module in ops** (PATCH `/api/v1/platform/tenants/:slug/modules`), the API updates `tenant_config` in the DB immediately. The worker does **not** need to be told or restarted. On its next run (every `MODULE_LIFECYCLE_INTERVAL_MINUTES`), it will see the updated module state. No extra step required.

---

## Discord holder sync (separate process)

Discord **holder sync** (fetching SPL/NFT holders for role rules) runs in the **Discord bot** process, which calls the API:

- `POST /api/v1/discord/sync-holders` (cron; syncs all linked guilds), or  
- `POST /api/v1/discord/bot/sync-holders` (per-guild, called by the bot).

For each Discord guild (tenant), the API runs holder sync only for **configured assets**. Configured assets are mints that appear in **discord role conditions** (rules with type SPL, NFT, or TRAIT). Those conditions reference mints that are typically added via the tenant app (Admin > Discord > mint catalog and role rules).

So:

- **Activating the Discord module in ops** only sets `modules.discord.state = 'active'` in the tenant. It does not add mints to the Discord mint catalog or create role rules.
- **Holder sync will do nothing for that tenant** until there are role rules that reference SPL/NFT/TRAIT mints (and those mints are in the catalog / conditions). Once you add mints and rules in the tenant app, the next time the bot triggers sync for that guild, it will see the configured assets and run.

So “worker didn’t start till I re-added the mints into the catalog” is expected: the **Discord holder sync** (not the module-lifecycle worker) only has work to do when there are mints/rules configured. Activating the module in ops does not create those; you add them in the tenant app.

---

## Summary

| What you do in ops | Module lifecycle worker | Discord holder sync |
|--------------------|-------------------------|----------------------|
| Activate a module (e.g. Discord) | Picks up on next cycle from DB; no action needed | Still needs mints + role rules in tenant app to have assets to sync |
| Set end date / subscription | Same; worker only cares about `deactivatedate` for transitions | No effect |
