Discord bot. `/verify`: wallet–Discord link. Role sync: holder snapshots → rules → add/remove roles. Run locally: `pnpm run dev`. Env: `.env.example`.

## Deploy (Railway)

**Root Directory** = `apps/discordbot` (no leading `/`). **Config file** = `apps/discordbot/railway.json` when Railway asks ([monorepo](https://docs.railway.com/guides/monorepo)).

**Builder:** Railpack only — do **not** add a `Dockerfile` here; Railway will switch builders ([config-as-code](https://docs.railway.com/reference/config-as-code)).

### Env on Railway

**Railway** injects service variables into **`process.env`** for the running container and for the build. See [Variables](https://docs.railway.com/guides/variables). **Deploy** after changing variables (staged changes are not live until deployed).

If a **Railpack** build fails with `secret … not found`, see [`.cursor/memory/railway-railpack-secrets.md`](../.cursor/memory/railway-railpack-secrets.md) (BuildKit vs dashboard vars).

**Do not** add an `omit=dev`-style `.npmrc` in this app: the build needs **devDependencies** (`tsup`) to compile; omitting them breaks `npm run build`.

**Required service variables:** `DISCORD_BOT_TOKEN`, `SUPABASE_URL`, and **one** service-role JWT name: `SUPABASE_SERVICE_ROLE_KEY` **or** `SUPABASE_SERVICE_KEY` (same value from Supabase → Settings → API → **service_role**; not the anon key). Optional: `VERIFY_URL_TEMPLATE`, `DISCORD_ROLE_SYNC_INTERVAL_MS`, `DISCORD_APPLICATION_ID`.

**Local Railway CLI:** `pnpm deploy:discordbot` or `cd apps/discordbot && railway up` after `railway link`.
