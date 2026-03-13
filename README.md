# DecentraGuild

Web3 Infrastructure as a Service – one dapp, many tenants (dGuilds), modular features on Solana.

## Repo layout

- **apps/platform** – Explore, onboarding, org creation (main domain)
- **apps/tenant** – dGuild portal; all subdomains (e.g. skull.decentraguild.com/market)
- **packages/core** – Tenant resolver and context
- **packages/ui** – Shared Vue components
- **packages/web3** – Wallet and Solana helpers
- **packages/contracts** – Solana programs and IDLs
- **supabase** – Migrations, Edge Functions

Monorepo: Turborepo + pnpm workspaces.

## Running locally

Supabase first, then frontend. See [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md).

```powershell
# Terminal 1
pnpm supabase start; pnpm supabase db reset; pnpm supabase functions serve

# Terminal 2
pnpm dev
```

- Platform: http://localhost:3000
- Tenant: http://localhost:3002 (`?tenant=0000000` on localhost)

## Backend

Supabase (PostgREST + Edge Functions). Solana for on-chain state. Backend for tenant config, Discord links, sync jobs.
