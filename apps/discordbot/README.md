Discord bot. `/verify`: wallet–Discord link. Role sync: holder snapshots → rules → add/remove roles. Run locally: `pnpm run dev`. Env: `.env.example`.

## Deploy (Railway)

**Monorepo:** Service **Settings → Source → Root Directory** = `apps/discordbot` (no leading `/`).

**Config file:** Point Railway at **`apps/discordbot/railway.json`** if it does not pick it up ([monorepo](https://docs.railway.com/guides/monorepo)).

### Builder: Railpack, not Docker (source of missing `SUPABASE_*` in `process.env`)

[Railway’s config-as-code docs](https://docs.railway.com/reference/config-as-code) state: **if a file named `Dockerfile` exists in the repo root for that service, Railway will build with Docker.** A `Dockerfile` in `apps/discordbot` therefore **forced** the Docker builder even when variables were set correctly in the UI. On that path, this service was still starting with **`SUPABASE_SERVICE_ROLE_KEY` undefined** in Node.

This repo **does not ship a root `Dockerfile`** for Railway anymore: use **[`railway.json`](./railway.json)** (`builder`: **RAILPACK**, `npm run build` / `npm start`). Local Docker (optional): `docker build -f Dockerfile.local -t discordbot .`

**Required variables** (same service): `DISCORD_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `VERIFY_URL_TEMPLATE`, `DISCORD_ROLE_SYNC_INTERVAL_MS`, `DISCORD_APPLICATION_ID`.

**If Supabase env is still missing after deploy:** open the deployment in Railway and confirm the **builder** is Railpack (file icon → config). Then check logs for a line listing env **names** containing `SUPA` (no values).

**One deploy path:** GitHub Actions **Deploy Discord bot** **or** Railway GitHub — not both.

**Workflow:** `RAILWAY_DISCORDBOT_DEPLOY_TOKEN`; optional `RAILWAY_DISCORDBOT_SERVICE` (default `Discordbot`).

**Local CLI:** `cd apps/discordbot`, `railway link`, `pnpm deploy` or repo root `pnpm deploy:discordbot`.
