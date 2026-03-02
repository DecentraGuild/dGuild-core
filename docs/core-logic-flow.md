# Core logic flow: tenant to billing to web3

Single reference for where core logic lives and how data flows from tenant resolution through config, billing, DB, and on-chain.

---

## Flow overview

```
tenantHost (subdomain / ?tenant=) → coreResolver → tenantConfig
  → moduleCatalog → billingConditions (extractors) → billingEngine (computePrice)
  → billingDb (subscriptions, payments) → apiRoutes → web3Helpers → solanaRpc
```

- **Tenant host** is resolved in the tenant app via `getTenantSlugFromHost` (packages/core).
- **Tenant config** is loaded by the API from DB (`tenant_config`) or file registry; module catalog drives pricing and visibility.
- **Billing conditions** are built per module by extractors; the pricing engine is pure (no I/O).
- **Billing persistence** is in Postgres; payment verification and transfers use shared Solana connection and web3 helpers.

---

## Entry points by area

### Billing and pricing

| Location | Entry point | Purpose |
|----------|-------------|---------|
| `packages/billing/src/engine.ts` | `computePrice(moduleId, conditions, pricingModel, options?)` | Pure pricing; returns `PriceResult`. No I/O. |
| `packages/billing/src/types.ts` | `ConditionSet`, `PriceResult`, `PricingModel`, `BillingPeriod` | Shared types for pricing and conditions. |
| `apps/api/src/billing/conditions.ts` | `getConditions(moduleId, tenantId)` | Builds `ConditionSet` via per-module extractors. |
| `apps/api/src/billing/extractors/*.ts` | `extractMarketplaceConditions`, `extractDiscordConditions`, `extractWhitelistConditions`, slug stub | Load tenant-specific data (DB/file) for pricing. |
| `apps/api/src/billing/prorate.ts` | `calculateCharge`, `calculateExtension` | Period math and proration; uses `PriceResult` and subscription state. |
| `apps/api/src/billing/verify-payment.ts` | `verifyBillingPayment(...)` | Verifies on-chain USDC transfer and memo. |

### Tenant config and module catalog

| Location | Entry point | Purpose |
|----------|-------------|---------|
| `packages/core/src/resolver.ts` | `getTenantSlugFromHost(host, searchParams?)` | Resolve tenant slug from host or `?tenant=`. |
| `packages/core/src/loader.ts` | `loadTenantConfig(slug)` | Load tenant config (used by tenant app; API uses DB/registry). |
| `packages/core/src/types.ts` | `TenantConfig`, `normalizeModules`, `getModuleState`, `getEffectiveWhitelist` | Config shape and module visibility. |
| `config/src/load-module-catalog.ts` | `getModuleCatalog()`, `getModuleCatalogEntry(id)`, `getModuleCatalogList()` | Module catalog; pricing and addons (e.g. slug). |
| `config/module-catalog/*.json` | JSON per module | Module id, status, name, routePath, pricing (e.g. add_unit, conditionKey). |
| `apps/api/src/config/registry.ts` | `loadTenantBySlug`, `loadTenantById`, `loadTenantByIdOrSlug`, `writeTenantBySlug` | File-based tenant config (bootstrap / local dev). |
| `apps/api/src/db/tenant.ts` | `resolveTenant(idOrSlug)`, `getTenantBySlug`, `getTenantById`, `updateTenant`, `mergeTenantPatch`, `rowToTenantConfig` | DB tenant config; merge with file when used. |

### Database and storage

| Location | Entry point | Purpose |
|----------|-------------|---------|
| `apps/api/src/db/client.ts` | `initPool(databaseUrl)`, `getPool()`, `query<T>(sql, params)`, `withTransaction(pool, fn)` | Postgres pool, query, and transaction helper; billing confirm flows use `withTransaction`. |
| `apps/api/src/db/billing.ts` | `getSubscription`, `upsertSubscription`, `insertPaymentIntent`, `getPaymentById`, `confirmPayment`, `confirmPaymentAndActivate`, `confirmSlugClaimPayment`, `failPayment`, `expireStalePendingPayments`, `listPayments` | Billing subscriptions and payments. |
| `apps/api/src/db/tenant.ts` | As above | Tenant row mapping and CRUD. |
| `apps/api/src/db/migrations/*.sql` | 001–005 | Schema: tenant_config, marketplace_*, billing_*, Discord, whitelist default_whitelist. |

### Web3 and on-chain RPC

| Location | Entry point | Purpose |
|----------|-------------|---------|
| `apps/api/src/solana-connection.ts` | `getSolanaConnection()` | Shared Solana `Connection` for API (DAS/RPC). Billing verify-payment and marketplace-escrows use it. |
| `packages/web3/src/connection.ts` | `createConnection(rpcUrl)` | Browser connection factory; tenant app uses it via `useSolanaConnection()`. |
| `packages/web3/src/das/index.ts` | `getDasRpcUrl()`, `dasRequest`, `fetchAsset`, `fetchAssetsByGroup` | RPC URL and DAS. |
| `packages/web3/src/whitelist/*.ts` | `getWhitelistProgram`, `fetchWhitelist`, `fetchAllWhitelistsByAuthority`, `fetchWhitelistEntries`, `isWalletOnWhitelist`, `buildInitializeWhitelistTransaction`, etc. | Whitelist program and PDAs; all on-chain whitelist ops. |
| `packages/web3/src/billing/transfer.ts` | `buildBillingTransfer`, `USDC_MINT`, `USDC_DECIMALS` | USDC transfer for billing. |
| `packages/contracts` | `ESCROW_PROGRAM_ID`, `WHITELIST_PROGRAM_ID`, IDLs | Program IDs and IDLs. |

### Billing service (API)

| Location | Entry point | Purpose |
|----------|-------------|---------|
| `apps/api/src/billing/service.ts` | `previewPrice`, `createPaymentIntent`, `confirmPayment`, `extendSubscription`, `tenantBillingKey` | High-level billing operations; used by billing routes so handlers stay thin. |

### API routes (core modules)

| Location | Entry point | Purpose |
|----------|-------------|---------|
| `apps/api/src/routes/billing.ts` | GET/POST price-preview | Admin; delegates to billing service `previewPrice`. |
| `apps/api/src/routes/billing-payments.ts` | payment-intent, confirm-payment, payments, invoice, subscription, extend | Full billing flow; delegates to billing service for intent/confirm/extend; auth, validation, verify-payment in route. |
| `apps/api/src/routes/whitelist.ts` | lists (admin), lists/public, CRUD lists, my-memberships, check, is-listed, entries | Whitelist admin and public. All lookups use `tenant.id` after `resolveTenant(slug)`; list data in `configs/whitelist/{tenantId}.json`. |
| `apps/api/src/routes/tenant-settings.ts` | GET/PATCH settings, marketplace-settings, slug check | Tenant and marketplace settings; `requireTenantAdmin`. |

---

## Design rules (for refactors)

1. **Pure logic** (pricing, proration, condition evaluation) stays I/O-free in `packages/` (e.g. `packages/billing`).
2. **External I/O** (DB, RPC, HTTP) goes through dedicated layers in `apps/api` or shared helpers in `packages/web3`.
3. **Route handlers** should be thin: validate, authorize, call a service, return a shaped response.
4. **Tenant identity**: Prefer `tenant.id` for persistence and cross-module keys; slug for URLs and public APIs.
5. **Module catalog** is the source of truth for module ids, pricing models, and condition keys; avoid duplicating labels or period sets in routes or frontend.

---

## Tests

- **Billing engine:** `apps/api/src/billing/price-engine.test.ts` exercises `computePrice` for add_unit, flat_recurring, and null pricing.
