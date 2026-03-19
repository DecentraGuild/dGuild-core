Discord bot. `/verify`: wallet–Discord link. Role sync: holder snapshots → rules → add/remove roles. Run locally: `pnpm run dev`. Env: `.env.example`.

## Deploy (Railway)

**Monorepo:** In the service **Settings → Source → Root Directory**, set:

`apps/discordbot`

Use that exact path: **no leading `/`** (not `/apps/discordbot` — that breaks resolution).

**Config as code:** Railway does not apply `railway.json` relative to Root Directory unless you point at it. If builds ignore this folder’s config, set the config file path to **`apps/discordbot/railway.json`** (see [Railway monorepo docs](https://docs.railway.com/guides/monorepo)).

**Build:** This app uses a **Dockerfile** (not Railpack) so `npm run build` does **not** need Supabase vars at image build time. You still need **`DISCORD_BOT_TOKEN`**, **`SUPABASE_URL`**, and **`SUPABASE_SERVICE_ROLE_KEY`** as normal service variables for **runtime**.

**One deploy path:** Use **either** GitHub Actions (`Deploy Discord bot` workflow) **or** Railway’s GitHub connection — not both — or you’ll get duplicate deploys.

**Workflow / CLI:** Actions → **Deploy Discord bot** (secret `RAILWAY_DISCORDBOT_DEPLOY_TOKEN`). Service name defaults to `Discordbot`; override with `RAILWAY_DISCORDBOT_SERVICE` if needed.

**From your machine:** `cd apps/discordbot`, `railway link`, then `pnpm deploy` or from repo root `pnpm deploy:discordbot`.

**Dashboard:** Cmd/Ctrl+K → **Deploy latest commit** (Git-connected service).

Auto-deploy from Git only runs when the connected branch changes; the workflow uploads **this folder** from the branch you choose.
