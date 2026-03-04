# Pre-release cleanup checklist

Short checklist to run before each release so the MVP stays lean and free of legacy rubble.

---

## Tenant app

- [ ] **Routes and nav**: Only implemented modules from `IMPLEMENTED_MODULES` appear in nav; no links to `/mint` or other non-MVP routes.
- [ ] **Marketplace flows**: `CreateTradeForm`, browse, and open-trades views use only current marketplace settings (collectionMints, currencyMints, splAssetMints, whitelist, shopFee).
- [ ] **Legacy branches**: No conditionals that only exist to handle old config shapes or removed flows.
- [ ] **Tenant configs**: `configs/tenants/*.json` enable only modules that have real pages; module `settingsjson` is flat (no nested `settingsjson.settingsjson`).

## API backend

- [ ] **Dead routes**: Every route listed in `.cursor/memory/api-routes.md` is called by the tenant app, platform app, or documented external services.
- [ ] **Tenant context**: `/api/v1/tenant-context` returns only fields that the apps read; no legacy compatibility fields.
- [ ] **Marketplace settings**: `tenant-settings` marketplace handlers accept and persist the current marketplace settings shape (no baseCurrency/customCurrencies fallbacks).

## Platform app

- [ ] **Discovery page**: Module filter options reflect implemented modules; copy does not reference non-MVP modules or rooms.
- [ ] **Docs links**: Links under `docs/` and discovery cards point to real, working docs pages.

## Packages and configs

- [ ] **Core types**: `TenantConfig` and `MarketplaceSettings` in `packages/core` match the JSON shapes in `.cursor/memory/config-layout.md`.
- [ ] **Config files**: `configs/marketplace/*.json` and `configs/whitelist/*.json` follow the documented shapes and do not contain unused fields.
- [ ] **Web3 helpers**: Escrow helpers in `packages/web3` are aligned with current on-chain programs; any references to deprecated programs are removed or clearly isolated.

## Memory and docs

- [ ] **Project map**: `.cursor/memory/project-map.md` module table matches `apps/tenant/src/config/modules.ts`.
- [ ] **Config layout**: `.cursor/memory/config-layout.md` examples match real configs under `configs/`.
- [ ] **Cleanup rules**: `.cursor/memory/cleanup-rules.md` still reflects how you want to treat legacy code for this release.

