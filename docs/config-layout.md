# Config layout and tenant config source of truth

Reference for where tenant and module configuration lives and how it is loaded.

---

## Tenant config: DB vs file

- **When DATABASE_URL is set (production or any env with DB):** The database (`tenant_config` table) is the source of truth. The API does **not** sync from JSON to DB on startup. `resolveTenant(idOrSlug)` uses the DB only in production; in non-production with a DB it still tries file first for reads (see below), but no automatic write from file to DB.
- **Production:** `resolveTenant` uses DB only (no file fallback). Tenant config is only in the DB; populate via explicit `pnpm run seed:tenants` or registration flow when moving config from dev to production.
- **Local dev without DB:** `resolveTenant` uses file-based config from `configs/tenants/` so you can run without a DB.
- **Local dev with DB:** With `DATABASE_URL` set, the API never pushes JSON into the DB. JSON in `configs/tenants/` is for development only. To push dev config into the DB, run `pnpm run seed:tenants` explicitly.
- **File registry:** `apps/api/src/config/registry.ts` reads and writes tenant JSON under `TENANT_CONFIG_PATH`. Used for local dev and for the explicit seed script only; never auto-synced into the DB by the API.

**Persistence:** Tenant-level settings (name, description, defaultWhitelist, branding, modules, etc.) are persisted via `tenant-settings` PATCH and stored in `tenant_config`. Default whitelist is stored in `tenant_config.default_whitelist` (JSONB) and set through the single path: Admin General tab → form → PATCH `/api/v1/tenant/:slug/settings` → DB. When using file-based config (`TENANT_CONFIG_PATH`), the same PATCH merges and writes the full tenant JSON (including `defaultWhitelist`). See `docs/whitelist-levels.md` for the three-level whitelist model (dGuild, module, transaction).

---

## Module catalog

- **Source:** `config/module-catalog/*.json` (one JSON file per module). Loaded by `config/src/load-module-catalog.ts`; exposed as `getModuleCatalog()`, `getModuleCatalogEntry(id)`, `getModuleCatalogList()`.
- **Use:** Module ids, names, route paths, pricing models, and condition keys are defined here. The tenant app derives nav and labels from the catalog (`apps/tenant/src/config/modules.ts`). The API uses the catalog for billing (pricing, display names) and validation. Do not duplicate module labels or billing period sets in routes or frontend; use `getModuleDisplayName(moduleId)` and `VALID_BILLING_PERIODS` from `@decentraguild/config`.

---

## Other config paths

- **Marketplace:** Stored in DB (`marketplace_settings`, etc.) with optional file fallback under `MARKETPLACE_CONFIG_PATH` when set.
- **Whitelist lists:** File-based in `configs/whitelist/{tenantId}.json` (see `apps/api/src/config/whitelist-registry.ts`). Keyed by **tenant id** only. API routes resolve tenant from slug (or host) then call `loadWhitelistByTenantId(tenant.id)` so that renaming a slug does not break whitelist data.
