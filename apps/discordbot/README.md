Discord bot. `/verify` + role sync. Local: `pnpm run dev`, copy `.env.example` → `.env`.

## Railway (production)

1. **Service → Settings:** Root directory `apps/discordbot` (no leading slash). Watch [monorepo](https://docs.railway.com/guides/monorepo) if needed.
2. **Service → Variables** — set exactly these, then **Deploy** (staged vars are not live until deployed):

| Variable | Value |
|----------|--------|
| `DISCORD_BOT_TOKEN` | Discord application → Bot → token |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** (long JWT) |

Same `service_role` value may appear in templates as `SUPABASE_SERVICE_KEY`; either name works.

3. **Build:** Railpack, no Dockerfile in this folder. **[`railpack.json`](./railpack.json)** must stay (`secrets: []` avoids a bogus BuildKit error during `npm run build`). **Do not** add `.npmrc` with `omit=dev` — build needs `tsup`.

Optional: `VERIFY_URL_TEMPLATE`, `DISCORD_ROLE_SYNC_INTERVAL_MS`, `DISCORD_APPLICATION_ID`.

**CLI:** `cd apps/discordbot && railway link` then `pnpm deploy:discordbot`.
