#!/usr/bin/env node
/**
 * Generates supabase/seed.sql from configs/tenants/*.json.
 * Run before `supabase db reset` so tenant config (including modules) comes from JSON, not hardcoded SQL.
 *
 * Usage: node scripts/generate-seed.mjs
 * Or: pnpm db:seed (generates then runs db reset)
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIGS_DIR = join(ROOT, 'configs', 'tenants')
const SEED_PATH = join(ROOT, 'supabase', 'seed.sql')

const PLATFORM_OWNER_WALLET =
  process.env.PLATFORM_OWNER_WALLET ?? '4CJYmVAcBrgYL6iX4gUKSMeJxTm4hK3eNAzuzaYBZMCv'

function escapeSqlString(s) {
  if (s == null) return 'NULL'
  return "'" + String(s).replace(/'/g, "''") + "'"
}

function jsonToSql(value) {
  return escapeSqlString(JSON.stringify(value)) + '::jsonb'
}

function buildTenantInsert(config) {
  const branding = config.branding ?? { logo: null, theme: {} }
  const admins = config.admins ?? []
  return `INSERT INTO public.tenant_config (
  id,
  slug,
  name,
  description,
  discord_server_invite_link,
  default_gate,
  branding,
  modules,
  admins,
  treasury
) VALUES (
  ${escapeSqlString(config.id)},
  ${escapeSqlString(config.slug)},
  ${escapeSqlString(config.name)},
  ${escapeSqlString(config.description ?? '')},
  NULL,
  NULL,
  ${jsonToSql(branding)},
  ${jsonToSql(config.modules ?? {})},
  ${jsonToSql(admins)},
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  branding = EXCLUDED.branding,
  modules = EXCLUDED.modules,
  admins = EXCLUDED.admins,
  updated_at = NOW();`
}

function main() {
  const tenantFiles = readdirSync(CONFIGS_DIR).filter((f) => f.endsWith('.json'))
  const inserts = []

  for (const file of tenantFiles) {
    const path = join(CONFIGS_DIR, file)
    try {
      const raw = readFileSync(path, 'utf-8')
      const config = JSON.parse(raw)
      inserts.push(buildTenantInsert(config))
    } catch (err) {
      console.error(`[generate-seed] Failed to read ${path}:`, err.message)
      process.exit(1)
    }
  }

  const sql = `-- Generated from configs/tenants/*.json by scripts/generate-seed.mjs
-- Run: pnpm db:seed (or: node scripts/generate-seed.mjs && pnpm supabase db reset)
--
-- Platform owner: set PLATFORM_OWNER_WALLET env to match supabase/functions/.env
INSERT INTO public.platform_owner (wallet_address) VALUES (${escapeSqlString(PLATFORM_OWNER_WALLET)})
ON CONFLICT (wallet_address) DO NOTHING;

${inserts.join('\n\n')}
`

  writeFileSync(SEED_PATH, sql, 'utf-8')
  console.log('[generate-seed] Wrote supabase/seed.sql from', tenantFiles.join(', '))
}

main()
