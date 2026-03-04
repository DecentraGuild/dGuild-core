# Config layout and tenant config source of truth

Reference for where tenant and module configuration lives and how it is loaded.

---

## Tenant config: DB vs file

- **Production:** The database (`tenant_config` table) is the primary source of truth. `resolveTenant(idOrSlug)` in `apps/api/src/db/tenant.ts` tries DB first (by slug, then by id), then falls back to file-based config when DB has no match.
- **Local / non-production:** When `NODE_ENV !== 'production'`, `resolveTenant` tries file-based config first (so you can develop without a DB), then DB. This allows static JSON in `configs/tenants/` to bootstrap or override.
- **File registry:** `apps/api/src/config/registry.ts` reads and writes tenant JSON under `TENANT_CONFIG_PATH` (e.g. `configs/tenants/{slug}.json` or `{id}.json`). Used for bootstrap, local dev, and optional fallback.

**Persistence:** Tenant-level settings (name, description, defaultWhitelist, branding, modules, etc.) are persisted via `tenant-settings` PATCH and stored in `tenant_config`. Default whitelist is stored in `tenant_config.default_whitelist` (JSONB) and set through the single path: Admin General tab → form → PATCH `/api/v1/tenant/:slug/settings` → DB. When using file-based config (`TENANT_CONFIG_PATH`), the same PATCH merges and writes the full tenant JSON (including `defaultWhitelist`). See `docs/whitelist-levels.md` for the three-level whitelist model (dGuild, module, transaction).

---

## Module catalog

- **Source:** `config/module-catalog/*.json` (one JSON file per module). Loaded by `config/src/load-module-catalog.ts`; exposed as `getModuleCatalog()`, `getModuleCatalogEntry(id)`, `getModuleCatalogList()`.
- **Use:** Module ids, names, route paths, pricing models, and condition keys are defined here. The tenant app derives nav and labels from the catalog (`apps/tenant/src/config/modules.ts`). The API uses the catalog for billing (pricing, display names) and validation. Do not duplicate module labels or billing period sets in routes or frontend; use `getModuleDisplayName(moduleId)` and `VALID_BILLING_PERIODS` from `@decentraguild/config`.

---

## Other config paths

- **Marketplace:** Stored in DB (`marketplace_settings`, etc.) with optional file fallback under `MARKETPLACE_CONFIG_PATH` when set.
- **Whitelist lists:** File-based in `configs/whitelist/{tenantId}.json` (see `apps/api/src/config/whitelist-registry.ts`). Keyed by **tenant id** only. API routes resolve tenant from slug (or host) then call `loadWhitelistByTenantId(tenant.id)` so that renaming a slug does not break whitelist data.
