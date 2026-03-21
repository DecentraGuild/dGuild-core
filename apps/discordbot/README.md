Discord bot. `/verify`: wallet–Discord link. Role sync: holder snapshots → rules → add/remove roles. Run locally: `pnpm run dev`. Env: `.env.example`.

## Deploy (Railway)

**Root Directory** = `apps/discordbot` (no leading `/`). **Config file** = `apps/discordbot/railway.json` when Railway asks ([monorepo](https://docs.railway.com/guides/monorepo)).

**Builder:** Railpack only — do **not** add a `Dockerfile` here; Railway will switch builders ([config-as-code](https://docs.railway.com/reference/config-as-code)).

### How secrets actually get to Node (two layers)

1. **Railway** puts each service variable into **`process.env` at runtime** (and into the build environment for install/build steps). See [Variables](https://docs.railway.com/guides/variables). Apply **staged** variable changes with a **deploy**.

2. **Railpack** may also put some names into a **BuildKit “secret”** list for the image build. That uses a different path than normal env. If the plan expects `secret SUPABASE_SERVICE_ROLE_KEY` but BuildKit does not receive it, the **build fails** even when the variable is set in the dashboard.

**What we do about (2):** [`.dockerignore`](./.dockerignore) keeps `.env.*` out of the upload so template files do not trigger secret detection. [`railpack.json`](./railpack.json) sets `"secrets": []` per [Railpack schema](https://schema.railpack.com). **Source:** [`src/config.ts`](./src/config.ts) (and the rest of `src/`) uses **only** `process.env[dynamicKey]` — no `process.env.SUPABASE_*` / `process.env.DISCORD_*` dotted access, so the Railpack static scan does not add those names to the BuildKit secret list. Full write-up: [`.cursor/memory/railway-railpack-secrets.md`](../.cursor/memory/railway-railpack-secrets.md).

**Required service variables:** `DISCORD_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `VERIFY_URL_TEMPLATE`, `DISCORD_ROLE_SYNC_INTERVAL_MS`, `DISCORD_APPLICATION_ID`.

**Local Railway CLI:** `pnpm deploy:discordbot` or `cd apps/discordbot && railway up` after `railway link`.
