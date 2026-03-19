Discord bot. `/verify`: wallet–Discord link. Role sync: holder snapshots → rules → add/remove roles. Run locally: `pnpm run dev`. Env: `.env.example`.

## Deploy (Railway)

**Auto:** Pushing to `main` with changes under `apps/discordbot/` runs the deploy workflow. **Manual:** Actions → **Deploy Discord bot** → Run workflow (pick branch). GitHub secret `RAILWAY_DISCORDBOT_DEPLOY_TOKEN` only logs CI into Railway — it does **not** pass app config to the container. **Bot config lives in Railway:** open the **Discordbot** service → **Variables** and set everything from `.env.example` (exact names, e.g. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_BOT_TOKEN`). Railway exposes [service variables to the build step](https://docs.railway.com/guides/variables); if a build still says a secret is missing, the name is wrong, the variable isn’t on **this** service/environment, or staged variable changes weren’t applied (review & deploy pending changes).

Service name is `Discordbot` by default; set GitHub secret `RAILWAY_DISCORDBOT_SERVICE` if yours differs.

**From your machine:** `cd apps/discordbot`, `railway link` once, then `pnpm deploy` or from repo root `pnpm deploy:discordbot`.

**Dashboard:** If the service is still Git-connected, Cmd/Ctrl+K → **Deploy latest commit** uses Git (and watch paths). Prefer **Actions → Deploy Discord bot** or local `pnpm deploy` for CLI uploads.

Auto-deploy from Git only runs when Railway’s connected branch changes; this workflow always uploads **this folder** from the branch you choose.

### “No changes to watched files” on Railway

That message comes from **Railway’s Git deploy** (commit + watch paths), not from `railway up`. If you want deploys **only** from this workflow, open the **Discordbot** service in Railway → **Settings** → **Source** and disconnect the repo so deploys are CLI/uploads only; remove any leftover **watch paths**. Confirm failed deploys aren’t from **Redeploy** of an old Git deployment. Cross-check the GitHub Actions run: if the **Deploy apps/discordbot** step succeeded, the upload deploy should appear separately from any skipped Git deploy.
