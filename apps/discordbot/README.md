Discord bot. `/verify`: wallet–Discord link. Role sync: holder snapshots → rules → add/remove roles. Run locally: `pnpm run dev`. Env: `.env.example`.

## Deploy (Railway)

Connect the repo in Railway with **Root Directory** = `apps/discordbot` (no leading `/`). Point **config file** at `apps/discordbot/railway.json` if needed ([monorepo](https://docs.railway.com/guides/monorepo)).

**Builder:** Railpack (`railway.json`). Do **not** add a root `Dockerfile` here — Railway will force Docker instead ([config-as-code](https://docs.railway.com/reference/config-as-code)). Optional local image: `docker build -f Dockerfile.local .`

**Railpack + `SUPABASE_SERVICE_ROLE_KEY: not found`:** Railpack scans the **build context** (respecting [`.dockerignore`](./.dockerignore)) for env-style names and turns them into Docker build secrets. The line `SUPABASE_SERVICE_ROLE_KEY=…` in **`.env.example`** was triggering that even though the bot only needs those vars at **runtime**. `.env.example` is therefore **excluded** from the context (via `.env.*`); the file stays in the repo for humans and local `cp .env.example .env`.

**Required variables** on the Railway service: `DISCORD_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `VERIFY_URL_TEMPLATE`, `DISCORD_ROLE_SYNC_INTERVAL_MS`, `DISCORD_APPLICATION_ID`.

**Local Railway CLI:** from repo root `pnpm deploy:discordbot` or `cd apps/discordbot && railway up` after `railway link`.
