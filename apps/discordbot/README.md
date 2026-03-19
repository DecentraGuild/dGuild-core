Discord bot. `/verify`: wallet–Discord link. Role sync: holder snapshots → rules → add/remove roles. Run locally: `pnpm run dev`. Env: `.env.example`.

## Deploy (Railway)

**Auto:** Pushing to `main` with changes under `apps/discordbot/` runs the deploy workflow (same as Supabase/platform). **Manual:** Actions → **Deploy Discord bot** → Run workflow (pick branch). Secrets: `RAILWAY_DISCORDBOT_DEPLOY_TOKEN`; optional `RAILWAY_DISCORDBOT_SERVICE` if multiple services.

**From your machine:** `cd apps/discordbot`, `railway link` once, then `pnpm deploy` or from repo root `pnpm deploy:discordbot`.

**Dashboard:** Cmd/Ctrl+K → **Deploy latest commit** (if the service is Git-connected).

Auto-deploy from Git only runs when Railway’s connected branch changes; this workflow always uploads **this folder** from the branch you choose.
