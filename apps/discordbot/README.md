Discord bot. `/verify`: wallet–Discord link. Role sync: holder snapshots → rules → add/remove roles. Run locally: `pnpm run dev`. Env: `.env.example`.

## Deploy (Railway)

**Monorepo:** In the service **Settings → Source → Root Directory**, set:

`apps/discordbot`

Use that exact path: **no leading `/`** (not `/apps/discordbot` — that breaks resolution).

**Config as code:** Railway does not apply `railway.json` relative to Root Directory unless you point at it. If builds ignore this folder’s config, set the config file path to **`apps/discordbot/railway.json`** (see [Railway monorepo docs](https://docs.railway.com/guides/monorepo)).

### Railway environment variables (why a green build ≠ Supabase env)

This is the **source** of `SUPABASE_SERVICE_ROLE_KEY is unset` at container start:

1. **Per-service scope** — Railway attaches variables to a **specific service**. Values defined only on another service (Postgres, Supabase plugin, a second web app) are **not** in `process.env` for the Discord bot unless you add them here too. Use **Shared variables** and either share to this service or add a [reference](https://docs.railway.com/guides/variables#reference-variables), e.g. `SUPABASE_SERVICE_ROLE_KEY=${{ shared.SUPABASE_SERVICE_ROLE_KEY }}`.

2. **Docker build vs runtime** — Per [Railway’s Dockerfile guide](https://docs.railway.com/guides/dockerfiles#using-variables-at-build-time), variables are only available **inside** `RUN ...` steps when you declare `ARG` (and wire them through). Our [Dockerfile](./Dockerfile) has **no** `ARG` for Supabase keys; `npm run build` does not read them. So **the image can build successfully while `SUPABASE_SERVICE_ROLE_KEY` was never present during build** — that is expected and does not indicate the variable exists at **runtime**.

3. **Runtime** — When the container runs `node dist/index.js`, Railway injects **this service’s** variables into the process. If `process.env.SUPABASE_SERVICE_ROLE_KEY` is undefined, that key is **not** on this service’s variable list (or the reference resolves to nothing), or [staged variable changes](https://docs.railway.com/deployments/staged-changes) were not deployed.

4. **Deploy path** — GitHub Actions ([`deploy-discordbot.yml`](../../.github/workflows/deploy-discordbot.yml)) only runs `railway up`; it does **not** push secrets from GitHub into the container. Secrets always come from the Railway project for the **target service**.

5. **CLI service name** — The workflow uses `railway up --service "$SERVICE"` (default `Discordbot`). That must be the **same** Railway service where you configured the variables.

**One deploy path:** Use **either** GitHub Actions (`Deploy Discord bot` workflow) **or** Railway’s GitHub connection — not both — or you’ll get duplicate deploys.

**Workflow / CLI:** Actions → **Deploy Discord bot** (secret `RAILWAY_DISCORDBOT_DEPLOY_TOKEN`). Service name defaults to `Discordbot`; override with `RAILWAY_DISCORDBOT_SERVICE` if needed.

**From your machine:** `cd apps/discordbot`, `railway link`, then `pnpm deploy` or from repo root `pnpm deploy:discordbot`.

**Dashboard:** Cmd/Ctrl+K → **Deploy latest commit** (Git-connected service).

Auto-deploy from Git only runs when the connected branch changes; the workflow uploads **this folder** from the branch you choose.

**Required on this service (runtime):** `DISCORD_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `VERIFY_URL_TEMPLATE`, `DISCORD_ROLE_SYNC_INTERVAL_MS`, `DISCORD_APPLICATION_ID`.
