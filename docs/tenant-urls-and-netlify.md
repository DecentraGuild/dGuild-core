# Tenant URLs and Netlify scaling (short-term)

## Current behaviour

### Two ways to reach a tenant

1. **Single-domain + query (default)**  
   All "Visit" links from the platform and post-registration redirects use:
   - `https://dapp.dguild.org?tenant=<slug-or-id>`
   - No subdomains required. Works on Netlify without Pro.  
   - Config: `NUXT_PUBLIC_TENANT_APP_HOST` (platform), default `dapp.dguild.org`.

2. **Subdomain (optional)**  
   When a subdomain is configured in Netlify (e.g. `skull.dguild.org`), users can open:
   - `https://skull.dguild.org/market`
   - Same tenant app; tenant comes from the host.  
   - Netlify Pro is needed for wildcard `*.dguild.org`; otherwise add each subdomain manually (up to ~90 on standard plans).

### No double `?tenant=` on subdomain

When the tenant is already in the host (e.g. `dguild.dguild.org`), internal links and share URLs do **not** add `?tenant=`. So you get:
- `https://dguild.dguild.org/market` (not `.../market?tenant=dguild`).

When the app is served from the single-domain host (e.g. `dapp.dguild.org`), every internal link and share URL **does** add `?tenant=` so the next page load still resolves the tenant.

Logic lives in:
- `apps/tenant/src/composables/useTenantInLinks.ts` (`shouldAppendTenantToLinks`)
- Used in layout `linkTo`, escrow links, admin redirects, etc.

## Short-term scaling without Netlify Pro

1. **Tenant app on one Netlify site** with one custom domain: `dapp.dguild.org` (or similar). No wildcard.
2. **Platform** sets `NUXT_PUBLIC_TENANT_APP_HOST=dapp.dguild.org` so all Visit and onboard redirects go to `https://dapp.dguild.org?tenant=<slug-or-id>`.
3. **Id-only orgs** (`dg_xxxxxxxx`): users use `https://dapp.dguild.org?tenant=dg_xxxxxxxx`.
4. **Slug purchasers**: they can use `https://dapp.dguild.org?tenant=skull` immediately. When you want to give them a subdomain:
   - Add `skull.dguild.org` as a custom domain on the **same** Netlify site (tenant app).
   - Point DNS (CNAME or Netlify DNS) for `skull.dguild.org` to that site.
   - Then `https://skull.dguild.org` works as well; no code change.

## Config summary

| App      | Env                          | Purpose |
|----------|------------------------------|--------|
| Platform | `NUXT_PUBLIC_TENANT_APP_HOST` | Host for Visit and post-registration redirect (default `dapp.dguild.org`). |
| Platform | `NUXT_PUBLIC_TENANT_BASE_DOMAIN` | Base for subdomain *display* (e.g. docs); default `dguild.org`. |
| Tenant   | (none required)              | Single-domain vs subdomain is inferred from current host vs tenant slug. |

## Optional: subdomain-first Visit links

If you later move to Netlify Pro and use wildcard `*.dguild.org`, you can switch the platform back to subdomain Visit links by changing `tenantUrl()` in `apps/platform/src/pages/directory.vue` to use `https://${idOrSlug}.${tenantBaseDomain}` again and keeping onboard redirect to subdomain when desired.
