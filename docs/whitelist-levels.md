# Whitelist levels and storage

Whitelist can be set at three levels. Lower levels only apply when higher levels allow it.

---

## 1. Top level: dGuild (admin only)

- **Who sets it:** Admin in **Admin > General** (Default whitelist).
- **Effect:** Default for the whole dGuild. When set, it applies to all modules and transactions unless a module overrides it.
- **Where stored:**
  - **DB:** `tenant_config.default_whitelist` (JSONB). Persisted when admin saves General tab via PATCH `/api/v1/tenant/:slug/settings`.
  - **File (dev):** When `TENANT_CONFIG_PATH` is set, the same PATCH merges and writes the full tenant config to `{TENANT_CONFIG_PATH}/{slug}.json` or `{id}.json`, including `defaultWhitelist`.
- **Loaded:** `resolveTenant(slug)` returns the tenant; `tenant.defaultWhitelist` is used by the app and by `getEffectiveWhitelist(tenant.defaultWhitelist, moduleWhitelist)`.

---

## 2. Mid level: Module (admin only)

- **Who sets it:** Admin in the module’s tab (e.g. **Admin > Marketplace** or **Admin > Raffle**).
- **Effect:** Per-module override. A module can:
  - **Use dGuild default:** “Use default” → no module-specific value; effective = dGuild default.
  - **Own list:** Pick a specific whitelist → effective = that list.
  - **Public (none):** “Public” → effective = no whitelist.
- **Where stored (primary: tenant, so it’s available at first fetch):**
  - **Tenant config:** `tenant_config.modules` (JSONB): `modules.marketplace.settingsjson.whitelist`, `modules.raffles.settingsjson.defaultWhitelist`. Synced when admin saves Marketplace or Raffle tab. This is the source of truth for “can we show / is gated” so the UI does not need to fetch each module separately.
  - **Marketplace (legacy/sync):** DB `marketplace_settings.settings.whitelist` or file `configs/marketplace/{tenantId}.json` — still written for backward compatibility; tenant-context and UI prefer tenant when present.
  - **Raffles (legacy/sync):** DB `raffle_settings.defaultWhitelist` — still written; tenant-context and UI prefer tenant when present.
- **Loaded:** From `tenant` in the first fetch (tenant-context). Use `getModuleWhitelistFromTenant(tenant, 'marketplace' | 'raffles')` then `getEffectiveWhitelist(tenant.defaultWhitelist, moduleWhitelist)`.

---

## 3. Low level: Transaction (user)

- **Who sets it:** User when creating a transaction (e.g. escrow in Marketplace).
- **Rule:** User may only set a whitelist on their transaction **when the module has no whitelist** (effective module whitelist is null). If the module (or dGuild default) has a whitelist set, the user must follow it; the transaction uses the effective whitelist and the user cannot override.
- **Where stored:** On-chain only (e.g. escrow account `onlyWhitelist` + `whitelist`). Not stored in tenant or module JSON/DB.
- **UI:** In Create Trade (escrow), the Whitelist selector is only editable when the effective module whitelist is null; otherwise the effective whitelist is used and the selector is disabled or hidden.

---

## Three-way module value

Admin can set exactly three values per module:

| UI choice | Stored value | Meaning |
|-----------|--------------|--------|
| **Public** | `null` | Module is public (no whitelist). Effective = null. |
| **Use dGuild default** | `undefined` or `'use-default'` | Follow tenant default. Effective = tenant.defaultWhitelist or null. |
| **Specific whitelist** | `{ programId, account }` | Only that list. Effective = that list. |

`getEffectiveWhitelist(tenantDefault, moduleWhitelist)` treats: `moduleWhitelist === null` → public (returns null); `undefined` / `'use-default'` → use tenant default; object with non-empty account → use that list.

## Resolution order

- **Effective for a module:** `getEffectiveWhitelist(tenant.defaultWhitelist, module.whitelist)` → explicit null = public; undefined = tenant default; object = that list.
- **Effective for a user transaction:** If module effective is non-null → use it (user cannot override). If module effective is null → user may optionally set a whitelist on the transaction (e.g. escrow).

---

## References

- `packages/core/src/types.ts`: `getEffectiveWhitelist`, `TenantConfig.defaultWhitelist`, `MarketplaceSettings.whitelist`.
- `apps/api/src/db/tenant.ts`: `default_whitelist` read/write, `mergeTenantPatch`.
- `apps/api/src/routes/tenant-settings.ts`: PATCH settings (defaultWhitelist), PATCH marketplace-settings (whitelist).
- `apps/api/src/db/marketplace-settings.ts`: `settings.whitelist` in DB.
- `apps/api/src/db/raffle.ts`: raffle `defaultWhitelist` (use-default | null | object).
