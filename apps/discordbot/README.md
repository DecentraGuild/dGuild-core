Discord bot. `/verify`: wallet–Discord link. Role sync: holder snapshots → rules → add/remove roles. Run locally: `pnpm run dev`. Env: `.env.example`.

## Deploy (Railway)

**GitHub “button” (recommended):** Actions → **Deploy Discord bot** → Run workflow. Pick the branch (e.g. `develop`) in the dropdown so you don’t need a fake commit. Add repo secret `RAILWAY_DISCORDBOT_DEPLOY_TOKEN` (Railway project → Settings → Tokens). If the project has more than one service, add `RAILWAY_DISCORDBOT_SERVICE` with the exact service name.

**From your machine:** `cd apps/discordbot`, `railway link` once, then `pnpm deploy` or from repo root `pnpm deploy:discordbot`.

**Dashboard:** Cmd/Ctrl+K → **Deploy latest commit** (if the service is Git-connected).

Auto-deploy from Git only runs when Railway’s connected branch changes; this workflow always uploads **this folder** from the branch you choose.
