Discord bot. `/verify`: wallet–Discord link. Role sync: holder snapshots → rules → add/remove roles. Run locally: `pnpm run dev`. Env: `.env.example`.

## Deploy (Railway)

**Variables:** In the Railway service, set at least `DISCORD_BOT_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. For **Railpack** builds, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be **available at build time** as well as runtime (in the Variables UI, enable the option that exposes each to the build — Railpack passes them as BuildKit secrets during `npm run build`).

**Auto:** Pushing to `main` with changes under `apps/discordbot/` runs the deploy workflow. **Manual:** Actions → **Deploy Discord bot** → Run workflow (pick branch). Secret: `RAILWAY_DISCORDBOT_DEPLOY_TOKEN`. Service name is `Discordbot` by default; set `RAILWAY_DISCORDBOT_SERVICE` if your Railway service has a different name.

**From your machine:** `cd apps/discordbot`, `railway link` once, then `pnpm deploy` or from repo root `pnpm deploy:discordbot`.

**Dashboard:** Cmd/Ctrl+K → **Deploy latest commit** (if the service is Git-connected).

Auto-deploy from Git only runs when Railway’s connected branch changes; this workflow always uploads **this folder** from the branch you choose.
