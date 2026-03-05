# Tenant configs (static JSON)

Registry of dGuild configs. One file per tenant: `{id}.json`. Lookup by id or slug. See `configs/README.md` for conventions.

**Only the API reads these files.** Other apps (platform, tenant) get tenant data via the API:

- `GET /api/v1/tenant-context?slug=...` – single tenant
- `GET /api/v1/tenants` – list (from DB if present, else from this folder)

The API resolves the folder via `TENANT_CONFIG_PATH` (set at startup when run from the monorepo). These files are for development only; the API never syncs them into the DB automatically. When `DATABASE_URL` is set, production uses the DB only. To load config from these files into the DB, run `pnpm run seed:tenants` explicitly (e.g. when moving config to production).
