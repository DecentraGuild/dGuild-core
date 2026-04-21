# Adversarial security audit report — DecentraGuild Platform

**Scope:** Monorepo (`apps/platform`, `apps/tenant`, `apps/discordbot`, `packages/*`, `supabase/functions`, Postgres migrations).  
**Method:** Static code review, RLS policy review, Edge Function routing/auth matrix, dependency audit sample.  
**Date:** 2026-04-21  

**Remediation (2026-04-21 follow-up):** Critical/high items from this report were addressed in code and migration [`supabase/migrations/20260421140000_security_tenant_view_shipment_profiles.sql`](../../supabase/migrations/20260421140000_security_tenant_view_shipment_profiles.sql): marketplace catalog/scope/metadata authz, shipment listing via Edge, `tenant_context_view` without `admins`/`treasury`, removal of blanket `tenant_member_profiles` SELECT, CORS localhost tightening, `tenant_web_manifest` host spoofing, voucher receiving wallet centralized in `@decentraguild/core` with optional `VOUCHER_WALLET` / `NUXT_PUBLIC_VOUCHER_WALLET` overrides.

### Remediation status (not “audit closed”)

| Area | Status |
|------|--------|
| C-1 Marketplace catalog / scope-expand IDOR | **Fixed** (tenant admin + platform paths as implemented) |
| C-2 `mint_metadata` unauth writes | **Fixed** (no upsert on public cache miss; `metadata-refresh` platform-admin) |
| C-3 / C-4 Shipment PostgREST exfil | **Fixed** after migration + Edge `list-shipment-mints` + client change |
| H-1 `admins` / `treasury` in public view | **Fixed** in view + `tenant-sensitive` Edge for admins |
| H-2 Member profiles via PostgREST | **Fixed** (policy removed; Edge still serves `profiles` — see below) |
| H-3 `verify_jwt = false` everywhere | **Open** (architecture / regression risk) |
| H-4 Discord bot = service power | **Open** (secret rotation, least privilege, logging) |
| H-5 Manifest host | **Fixed** (`?host=` removed) |
| H-6 Billing quote / charge abuse | **Open** (rate limits, signed quote token optional) |
| M-1 `member-profile` `profiles` Edge | **Open** (still tenant-wide data if `tenantId` known; product vs privacy) |
| `tenant_config` direct `select('*')` for admins | **Open** (RLS still allows full row for tenant admins) |
| `pnpm audit` / Nuxt → `devalue` | **Open** |
| Rate limits on public Edge / RPC burn | **Open** |
| Section 7 verification checklist | **Open** (must be run on staging/prod after deploy + `db push`) |

**Continuing the audit** means: treat the above **Open** rows as the next backlog, re-run the Edge matrix after any new functions land, and execute section 7 against a real project (or local Supabase after migration).

---

## 1. Vulnerability summary

| Severity | Count | Notes |
|----------|------:|--------|
| Critical | 4 | Confirmed in code/migrations |
| High | 6 | Data exposure, authz gaps, abuse |
| Medium | 7 | Design weaknesses, DoS, info leak |
| Low | 5 | Hardening, operational |
| Informational | 4 | Defense-in-depth, monitoring |

*Several issues stem from the deliberate pattern `verify_jwt = false` on all Edge Functions (see [supabase/config.toml](supabase/config.toml) and [.cursor/memory/quick-refs/api-routes.md](.cursor/memory/quick-refs/api-routes.md)), which places the entire auth boundary in handler code.*

---

## 2. Threat model (Phase 0)

### Attacker profiles

| Profile | Entry points | Goals |
|---------|----------------|-------|
| Anonymous | PostgREST (anon key), `functions.invoke` with anon key, public Nuxt | Harvest PII, enumerate tenants/mints, poison caches, DoS RPC/DB |
| Authenticated wallet | Same + JWT in `Authorization` | Cross-tenant IDOR, marketplace/catalog tampering, billing edge cases |
| Tenant co-admin | Tenant admin APIs | Abuse billing, exfil member data, scope manipulation |
| Platform insider | `platform` Edge actions, ops UI | Full tenant visibility; service role |
| Discord / automation caller | `discord-bot` Edge, bot secret | Forge sync if secret leaks |

### Trust boundaries

- **Browser ↔ Supabase:** anon key + user JWT (cookies via `@supabase/ssr`).
- **Browser ↔ Edge:** `Authorization` + JSON body; CORS from [_shared/cors.ts](supabase/functions/_shared/cors.ts).
- **Edge ↔ Postgres:** predominantly **service role** ([_shared/supabase-admin.ts](supabase/functions/_shared/supabase-admin.ts)) → **RLS bypass**; every query must enforce tenant and role in code.
- **Cron / pg_net:** [invoke_edge_function](supabase/migrations/20260322100000_initial.sql) (SECURITY DEFINER) → Edge with service semantics.

### Sensitive assets

- `tenant_config.admins`, `treasury`, modules (via `tenant_context_view`).
- Shipment rows, compressed leaves, member profiles (email, phone, Discord links).
- Billing quotes/payments, voucher redemption state.
- `DISCORD_BOT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, RPC URLs.

---

## 3. Edge Function authorization matrix (Phase 1)

| Function | Auth pattern | `tenantId` / scope | Notes / gaps |
|----------|--------------|-------------------|--------------|
| **platform** | `requirePlatformAdmin` per handler | Mixed | Handlers audited: tenants/billing/gates use checks ([handlers/tenants.ts](supabase/functions/platform/handlers/tenants.ts)). |
| **billing** | Service role / webhook secret for jobs; `requireTenantAdmin` for `list-voucher-mints`; `getWalletFromAuthHeader` for `register-create` | Body | `quote`, `voucher-quote`, `charge`, `confirm` have **no** session admin check (by design: UUID quote / on-chain verify). Ensure quote IDs are unguessable. |
| **marketplace** | **Inconsistent** | Body | **Critical gaps** below. |
| **watchtower** | None (public) | `tenantId` required | Anyone with `tenant_id` UUID can read catalog/holders per product rules. |
| **tenant_web_manifest** | None | Host / `?host=` | Host derivation risk (see findings). |
| **member-profile** | Mixed | Body | `profiles` = no auth (by design). |
| **gates** | `requireTenantAdmin` for mutating actions | Body | Review all branches in [gates/index.ts](supabase/functions/gates/index.ts). |
| **discord-server** | `requireTenantAdmin` | Body | OK pattern. |
| **discord-verify** | `getWalletFromAuthHeader` | Per action | Verify each action. |
| **discord-bot** | `isBotAuthorized` ([_shared/bot-auth.ts](supabase/functions/_shared/bot-auth.ts)) | `guildId` | Compromise of secret = full DB write power. |
| **shipment** | `requireTenantAdmin` | Body | OK. |
| **tenant_catalog** | `requireTenantAdmin` | Body | OK. |
| **crafter** | `requireTenantAdmin` | Body | OK. |
| **qualification** | `requireTenantAdmin` | Body | OK. |
| **cron-lifecycle** / **cron-tracker** / **mint-catalog-index** | `isServiceRoleAuthorization` (partial) | N/A | Confirm every entrypoint. |
| **mint-catalog-index** | Platform admin + service for tick | — | [mint-catalog-index/index.ts](supabase/functions/mint-catalog-index/index.ts) |

### Marketplace — confirmed missing authorization (service-role DB)

| Action | Handler | Issue |
|--------|---------|--------|
| `catalog-add` | [catalog.ts](supabase/functions/marketplace/handlers/catalog.ts) | **No** `requireTenantAdmin`. Upserts `tenant_mint_catalog` + `mint_metadata` for arbitrary `tenantId`. |
| `catalog-refresh-traits` | [catalog.ts](supabase/functions/marketplace/handlers/catalog.ts) | Same. |
| `scope-expand` | [scope.ts](supabase/functions/marketplace/handlers/scope.ts) | `_authHeader` ignored. Upserts `collection_members`, `tenant_collection_scope`, `marketplace_mint_scope`. |
| `metadata` | [metadata.ts](supabase/functions/marketplace/handlers/metadata.ts) | Unauthenticated read + **upsert** global `mint_metadata`. |
| `metadata-refresh` | [metadata.ts](supabase/functions/marketplace/handlers/metadata.ts) | Unauthenticated batch upsert (50 mints). |
| `escrows` / `escrow` | [escrows.ts](supabase/functions/marketplace/handlers/escrows.ts) | Intentionally public chain-backed reads; `escrow` has no tenant binding (global pubkey). |
| `scope-sync` | [scope.ts](supabase/functions/marketplace/handlers/scope.ts) | **Has** wallet + tenant admin check. |

---

## 4. Detailed findings

### C-1: Unauthenticated tenant marketplace mutation (IDOR)

- **Severity:** Critical  
- **Component:** [supabase/functions/marketplace/handlers/catalog.ts](supabase/functions/marketplace/handlers/catalog.ts), [scope.ts](supabase/functions/marketplace/handlers/scope.ts)  
- **Description:** `catalog-add`, `catalog-refresh-traits`, and `scope-expand` use the admin Supabase client without verifying the caller is a tenant admin for `tenantId`.  
- **Exploitation:** 1) Discover or guess a victim `tenant_id`. 2) POST to `marketplace` Edge with `action: catalog-add` (or `scope-expand`) and victim `tenantId`. 3) Pollute catalog, expand collections, burn RPC quota, alter marketplace scope.  
- **Impact:** Integrity loss for any tenant; potential DoS (Helius/RPC + DB writes); reputational damage.  
- **Fix:** Call `requireTenantAdmin(authHeader, tenantId, db)` (or equivalent) at the start of each handler; reject missing/invalid `Authorization`.

### C-2: Global `mint_metadata` poisoning (unauthenticated)

- **Severity:** Critical (integrity) / High (downstream XSS if UI trusts `image`/`uri`)  
- **Component:** [metadata.ts](supabase/functions/marketplace/handlers/metadata.ts) — `handleMetadata`, `handleMetadataRefresh`  
- **Description:** Any caller can upsert rows in `mint_metadata` for arbitrary mints (cache miss path + refresh batch).  
- **Exploitation:** Repeatedly invoke `metadata` / `metadata-refresh` with malicious or huge payloads to skew names/images/URIs used across tenants.  
- **Impact:** Cross-tenant cache poisoning; storage/RPC cost; possible XSS if frontends render `image`/`uri` unsafely.  
- **Fix:** Require auth for writes; or write only via tenant-scoped pipeline after admin check; rate-limit per IP/key.

### C-3: PostgREST — cross-tenant read of `shipment_records`

- **Severity:** Critical  
- **Component:** [supabase/migrations/20260403120000_shipment_records_public_read.sql](supabase/migrations/20260403120000_shipment_records_public_read.sql)  
- **Description:** `CREATE POLICY "shipment_records_public_read" ON public.shipment_records FOR SELECT USING (true);` allows **any** role with SELECT (including `anon`) to read **all** tenants’ shipment rows.  
- **Exploitation:** Use Supabase anon key from the app; `from('shipment_records').select('*')` without filter returns global data.  
- **Impact:** Mass PII / operational data exposure across tenants.  
- **Fix:** Drop public policy; scope `SELECT` to `tenant_id` match via signed token claim, or serve public shipment UI only through an Edge function that filters by non-guessable token.

### C-4: PostgREST — cross-tenant read of `shipment_compressed_leaves`

- **Severity:** Critical  
- **Component:** [supabase/migrations/20260404120000_shipment_compressed_leaves.sql](supabase/migrations/20260404120000_shipment_compressed_leaves.sql)  
- **Description:** `shipment_compressed_leaves_public_read` uses `USING (true)`.  
- **Impact:** Recipient wallets, mints, leaf material exposed across tenants.  
- **Fix:** Same as C-3 — remove blanket public read; narrow policy.

### H-1: `tenant_context_view` exposes `admins` and `treasury`

- **Severity:** High  
- **Component:** [supabase/migrations/20260328200000_member_profiles.sql](supabase/migrations/20260328200000_member_profiles.sql) (view definition); RLS on `tenant_config` — `tenant_config_public_read` **USING (true)** in [20260322100000_initial.sql](supabase/migrations/20260322100000_initial.sql)  
- **Description:** Public SELECT on `tenant_config` combined with view columns `tc.admins`, `tc.treasury` leaks wallet addresses and treasury configuration to any anonymous client.  
- **Exploitation:** Query `tenant_context_view` or `tenant_config` via PostgREST as anon.  
- **Impact:** Targeting of admin wallets; social engineering; physical/security correlation.  
- **Fix:** Split public branding view (slug, name, branding, modules **without** admin wallets) from admin-only projection; RLS `SELECT` policies that exclude sensitive columns or use column-level privileges.

### H-2: Member profiles readable globally via RLS

- **Severity:** High  
- **Component:** [20260328200000_member_profiles.sql](supabase/migrations/20260328200000_member_profiles.sql) — `profiles_public_read` **USING (true)**  
- **Description:** All `tenant_member_profiles` rows are SELECTable by anyone with DB access through anon/authenticated.  
- **Redundancy:** [member-profile/index.ts](supabase/functions/member-profile/index.ts) `profiles` action also returns all profiles for `tenantId` without auth (documented as nickname resolver).  
- **Impact:** Email, phone, telegram, linked wallets for every member who filled profile — cross-tenant if tenant IDs known.  
- **Fix:** Restrict RLS to `tenant_id` in JWT claim or remove sensitive columns from public read; Edge `profiles` should require at least a server-secret or signed tenant session if used only server-side.

### H-3: `verify_jwt = false` on all Edge Functions

- **Severity:** High (architectural)  
- **Component:** [supabase/config.toml](supabase/config.toml)  
- **Description:** Gateway does not validate JWT before the Deno handler. Any mistake in a new handler is immediately exploitable.  
- **Impact:** Recurring class of auth bypass bugs (as in marketplace).  
- **Fix:** Central ingress middleware in each function (shared `withAuth`); contract tests per action; where compatible with Supabase Edge, re-enable JWT verification and pass claims; defense-in-depth with user-scoped DB client for reads where possible.

### H-4: Discord bot Edge = full service-role power

- **Severity:** High  
- **Component:** [discord-bot/index.ts](supabase/functions/discord-bot/index.ts), [_shared/bot-auth.ts](supabase/functions/_shared/bot-auth.ts)  
- **Description:** Single shared secret or service role key gates all bot actions on admin client.  
- **Impact:** Secret leak → arbitrary reads/writes across all guild/tenant tables touched by the function.  
- **Fix:** Rotate secrets; per-guild HMAC; minimal SQL RPCs instead of broad upserts; audit log every mutation.

### H-5: `tenant_web_manifest` host fallback

- **Severity:** High (conditional on deployment)  
- **Component:** [tenant_web_manifest/index.ts](supabase/functions/tenant_web_manifest/index.ts)  
- **Description:** Host is taken from `X-Forwarded-Host`, `X-NF-Client-Host`, **`URL ?host=`**, or `Host`. If `?host=` is honored without a trusted edge stripping it, attackers can request manifests for arbitrary `*.dguild.org` tenants.  
- **Fix:** Remove query-param host in production; only trust forwarded headers from known proxies; validate against allowlist.

### H-6: Billing `charge` / `confirm` without session binding

- **Severity:** High (business / fraud) — *mitigated by UUID + on-chain verification*  
- **Component:** [billing/index.ts](supabase/functions/billing/index.ts), [packages/billing/src/engine/charge.ts](packages/billing/src/engine/charge.ts)  
- **Description:** Anyone who obtains a valid `quoteId` can call `charge` and set `payerWallet`. Confirm relies on chain verification.  
- **Impact:** Quote ID leakage (logs, referrer, screenshots) could let a third party bind payment intent; mostly griefing unless combined with leak.  
- **Fix:** Short-lived signed quote token in body; rate-limit `charge` per quoteId; optional `requireTenantAdmin` for non-zero quotes.

### M-1: `member-profile` `profiles` — mass wallet enumeration

- **Severity:** Medium  
- **Component:** Edge + RLS (H-2)  
- **Description:** Public enumeration of wallets per tenant for UX.  
- **Fix:** Rate limit; pagination; optional auth for resolver clients.

### M-2: `watchtower` public actions

- **Severity:** Medium (privacy by design)  
- **Component:** [watchtower/index.ts](supabase/functions/watchtower/index.ts)  
- **Description:** Holder lists and CSV export gated by billing flags but still only need `tenantId`.  
- **Fix:** Ensure `tenant_id` is high-entropy; consider signed URLs for CSV; document privacy stance.

### M-3: CORS — `origin.includes('localhost')`

- **Severity:** Medium  
- **Component:** [_shared/cors.ts](supabase/functions/_shared/cors.ts)  
- **Description:** Any `Origin` containing substring `localhost` is allowed with credentials. Unusual origins could be crafted in edge browsers/extensions.  
- **Fix:** Strict regex `^https?://localhost(:\d+)?$` and `127.0.0.1` variants only.

### M-4: Voucher receiving wallet (canonical default + overrides)

- **Severity:** Medium (operational clarity)  
- **Component:** [packages/core/src/voucher-receiving-wallet.ts](packages/core/src/voucher-receiving-wallet.ts), Edge billing / `voucher-verify`, UI redeem flows  
- **Description:** Minted voucher tokens must land in a dedicated receiving wallet (separate from ops signer). A single documented default plus optional `VOUCHER_WALLET` / `NUXT_PUBLIC_VOUCHER_WALLET` overrides reduces drift between Edge and clients.  
- **Fix:** Use `resolveVoucherReceivingWallet()` everywhere; document two-wallet threat model.

### M-5: `invoke_edge_function` (SECURITY DEFINER)

- **Severity:** Medium  
- **Component:** [20260322100000_initial.sql](supabase/migrations/20260322100000_initial.sql)  
- **Description:** DB can call Edge with service key from Vault; misconfiguration enables arbitrary Edge invocation.  
- **Fix:** Vault hygiene; audit `body_json`; network egress restrictions.

### M-6: `getWalletFromToken` decodes JWT without local verify

- **Severity:** Medium (theoretical if Edge invoked without gateway)  
- **Component:** [_shared/auth.ts](supabase/functions/_shared/auth.ts)  
- **Description:** Comment assumes Supabase verifies before Edge; self-hosted / misroutes could weaken this.  
- **Fix:** Use `getUser()` path only, or verify JWT with project secret in Edge for sensitive paths.

### M-7: Platform `/ops` — client-side gate only for navigation

- **Severity:** Medium (UX vs security)  
- **Component:** [platform-ops-auth.global.ts](apps/platform/src/middleware/platform-ops-auth.global.ts), [assertPlatformOpsAccess.ts](apps/platform/src/composables/assertPlatformOpsAccess.ts)  
- **Description:** SSR redirects `/ops` to login; real enforcement is `requirePlatformAdmin` on Edge. Safe if all mutations use Edge.  
- **Fix:** Document; avoid adding server routes that skip Edge.

### L-1: Doc markdown `v-html`

- **Severity:** Low  
- **Component:** [DocMarkdown.vue](apps/platform/src/components/DocMarkdown.vue)  
- **Description:** Trusted markdown only — supply chain compromise of docs = XSS.  
- **Fix:** CSP; sanitize pipeline in CI.

### L-2: `billing` `reconcile-usdc-single` webhook secret optional

- **Severity:** Low  
- **Component:** [billing/index.ts](supabase/functions/billing/index.ts) `isBillingUsdcReconcileAuthorized`  
- **Description:** If `BILLING_USDC_WEBHOOK_SECRET` empty, only service role works — OK; if mis-set, weak.  
- **Fix:** Require secret in prod.

### L-3: `handleEscrow` no tenant binding

- **Severity:** Low / Informational  
- **Component:** [escrows.ts](supabase/functions/marketplace/handlers/escrows.ts)  
- **Description:** Returns on-chain escrow by id — public chain data.  
- **Fix:** Document; no change unless product requires tenant scoping.

### L-4: `pnpm audit` — transitive `devalue` (via Nuxt)

- **Severity:** Low until CVE assessed  
- **Component:** Lockfile / Nuxt dependency tree  
- **Description:** `pnpm audit` reports issues under `apps__platform>nuxt>devalue` (sample run 2026-04-21).  
- **Fix:** `pnpm audit --fix` where safe; bump Nuxt when patched.

### I-1: Public read policies on meters, raffle settings, holder tables

- **Severity:** Informational / product  
- **Component:** [20260322100000_initial.sql](supabase/migrations/20260322100000_initial.sql)  
- **Description:** Many `USING (true)` SELECT policies for catalog-style data.  
- **Action:** Confirm product intent; document data classification.

### I-2: Rate limiting

- **Severity:** Informational  
- **Description:** Edge actions can burn RPC (preview, scope-expand, metadata refresh).  
- **Fix:** Per-key rate limits at API gateway; Supabase function quotas.

---

## 5. Attack chains

*(Historical narratives; mitigations noted where implemented.)*

1. **Public shipment exfiltration:** Anon key from static app → PostgREST `shipment_records` + `shipment_compressed_leaves` → bulk PII export (C-3 + C-4). **Mitigated** by dropping public read policies, member mint list via Edge, admin history via authenticated + RLS.

2. **Marketplace sabotage:** Same anon → `marketplace` `catalog-add` / `scope-expand` for victim `tenantId` → broken catalog + `marketplace_mint_scope` (C-1) → broken trades / UX. **Mitigated** by `requireTenantAdmin` on those handlers.

3. **Admin wallet targeting:** Anon → `tenant_context_view` → collect `admins` + `treasury` → spear phishing / physical threat (H-1). **Mitigated** for the view path; **residual:** `tenant_config` direct wide `select` for authenticated tenant admins (see remediation status table).

4. **Metadata poison + UI:** Unauth `metadata` upsert malicious `image` URL → tenant app loads image in `<img>` (usually OK) or insecure rich preview → elevated if any `v-html` on metadata (H-2 + C-2 chain). **Mitigated** by removing unauthenticated DB upsert on cache miss; batch refresh requires platform admin.

5. **Quote ID leak + griefing:** Leaked `quoteId` from support ticket → attacker calls `charge` with junk `payerWallet` → pending payment noise (H-6 + operational). **Still relevant** (rate limits / signed quotes / ops runbooks).

---

## 6. Secure design recommendations

1. **Treat service-role Edge as root:** Every handler starts with explicit auth helper; deny by default; shared unit tests.  
2. **RLS for defense in depth:** Avoid `USING (true)` on tables with PII or cross-tenant impact; split views for public vs admin.  
3. **Revisit `verify_jwt`:** Use Supabase-verified JWT where Deno runtime allows; otherwise verify JWT in shared middleware with project JWT secret.  
4. **Marketplace:** ~~Add `requireTenantAdmin` to `catalog-add`, `catalog-refresh-traits`, `scope-expand`; gate `metadata` writes~~ **Done** in remediation; add regression tests when adding new marketplace actions.  
5. **Secrets:** Canonical voucher vault in `@decentraguild/core` + env overrides; rotate and document all production secrets.  
6. **Observability:** Structured audit logs for Edge mutations ([_shared/audit-log.ts](supabase/functions/_shared/audit-log.ts) where used) with `tenantId`, action, wallet hash.  
7. **Dependency hygiene:** Regular `pnpm audit`; track Nuxt/devalue advisories.

---

## 7. Verification checklist (post-remediation)

Run against **deployed** Edge + DB after migration `20260421140000_security_tenant_view_shipment_profiles.sql`:

- [ ] PostgREST anon: cannot `select` across tenants from `shipment_records` / `shipment_compressed_leaves` (expect deny or empty except intended policies).  
- [ ] PostgREST / `tenant_context_view`: no `admins` or `treasury` columns; signed-in tenant admin receives them via `member-profile` `tenant-sensitive`.  
- [ ] `marketplace` `catalog-add` / `catalog-refresh-traits` / `scope-expand` return 401/403 without tenant admin JWT.  
- [ ] `tenant_web_manifest`: no `?host=` bypass (spoofed host not accepted where proxies are correct).  
- [ ] `pnpm audit` clean or documented exceptions.  
- [ ] Spot-check: `list-shipment-mints`, `watchtower`, `billing` `charge`/`confirm` still behave for real tenants.

---

*This report is based on repository state at audit time. Re-run after significant merges.*
