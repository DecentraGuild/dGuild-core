#!/usr/bin/env node
/**
 * Exports full tenant config from Supabase to configs/tenants/{id}.json.
 * Includes tenant_config plus module settings (marketplace, raffle, addressbook,
 * watchtower, mint catalog, gates, discord rules, billing, etc.).
 * Use after Admin saves to persist settings to the file.
 *
 * Usage: node scripts/export-tenant-config.mjs <tenant-id>
 * Or: pnpm db:export-tenant 0000000
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required for admin-only tables)
 * Fallback: supabase status -o json for local
 */

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIGS_DIR = join(ROOT, 'configs', 'tenants')

function getCredentials() {
  const url = process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY
  if (url && key) return { url, key }

  try {
    const out = execSync('pnpm supabase status -o json', {
      cwd: ROOT,
      encoding: 'utf-8',
    })
    const json = out.trim()
    const start = json.indexOf('{')
    if (start === -1) return null
    const parsed = JSON.parse(json.slice(start))
    return {
      url: parsed.API_URL ?? parsed.api_url,
      key:
        parsed.SERVICE_ROLE_KEY ??
        parsed.service_role_key ??
        parsed.ANON_KEY ??
        parsed.anon_key,
    }
  } catch {
    return null
  }
}

function tenantConfigToJson(row) {
  const out = {
    id: row.id,
    slug: row.slug ?? row.id,
    name: row.name,
    description: row.description ?? '',
    branding: row.branding ?? { logo: null, theme: {} },
    modules: row.modules ?? {},
    admins: row.admins ?? [],
  }
  if (row.discord_server_invite_link != null) {
    out.discordServerInviteLink = row.discord_server_invite_link
  }
  if (row.default_gate != null) {
    out.defaultGate = row.default_gate
  }
  if (row.treasury != null) {
    out.treasury = row.treasury
  }
  return out
}

function pick(obj, keys) {
  const out = {}
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k]
  }
  return out
}

async function main() {
  const tenantId = process.argv[2]
  if (!tenantId) {
    console.error('Usage: node scripts/export-tenant-config.mjs <tenant-id>')
    process.exit(1)
  }

  const creds = getCredentials()
  if (!creds?.url || !creds?.key) {
    console.error(
      '[export-tenant-config] Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run supabase start.'
    )
    process.exit(1)
  }

  const supabase = createClient(creds.url, creds.key)

  const [
    tenantRes,
    marketplaceRes,
    raffleRes,
    addressbookRes,
    watchtowerRes,
    mintCatalogRes,
    mintScopeRes,
    gateListsRes,
    raffleSlotsRes,
    trackerRes,
    collectionMembersRes,
    discordServerRes,
    billingSubsRes,
    billingPaymentsRes,
    billingStateRes,
  ] = await Promise.all([
    supabase.from('tenant_config').select('*').eq('id', tenantId).maybeSingle(),
    supabase.from('marketplace_settings').select('settings').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('raffle_settings').select('settings').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('addressbook_settings').select('settings').eq('tenant_id', tenantId).maybeSingle(),
    supabase
      .from('watchtower_watches')
      .select('mint, track_holders, track_snapshot, track_transactions, enabled_at_holders, enabled_at_snapshot, enabled_at_transactions, created_at')
      .eq('tenant_id', tenantId),
    supabase
      .from('tenant_mint_catalog')
      .select('mint, kind, label')
      .eq('tenant_id', tenantId),
    supabase
      .from('marketplace_mint_scope')
      .select('mint, source, collection_mint')
      .eq('tenant_id', tenantId),
    supabase
      .from('gate_lists')
      .select('address, name, authority, image_url')
      .eq('tenant_id', tenantId),
    supabase
      .from('tenant_raffles')
      .select('raffle_pubkey, created_at, closed_at')
      .eq('tenant_id', tenantId),
    supabase
      .from('tracker_address_book')
      .select('mint, tier')
      .eq('tenant_id', tenantId),
    supabase
      .from('tenant_collection_scope')
      .select('collection_mint')
      .eq('tenant_id', tenantId),
    supabase
      .from('discord_servers')
      .select('discord_guild_id, guild_name, bot_invite_state, bot_role_position')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    supabase.from('billing_subscriptions').select('*').eq('tenant_id', tenantId),
    supabase.from('billing_payments').select('*').eq('tenant_id', tenantId),
    supabase.from('tenant_module_billing_state').select('*').eq('tenant_id', tenantId),
  ])

  if (tenantRes.error) {
    console.error('[export-tenant-config]', tenantRes.error.message)
    process.exit(1)
  }
  if (!tenantRes.data) {
    console.error(`[export-tenant-config] Tenant not found: ${tenantId}`)
    process.exit(1)
  }

  const json = tenantConfigToJson(tenantRes.data)

  if (marketplaceRes.data?.settings) {
    const s = marketplaceRes.data.settings
    json.marketplaceSettings = {
      ...s,
      currencyMints: (s.currencyMints ?? []).map((c) => (typeof c === 'string' ? { mint: c } : { mint: c.mint })),
      splAssetMints: (s.splAssetMints ?? []).map((c) => (typeof c === 'string' ? { mint: c } : { mint: c.mint })),
      collectionMints: (s.collectionMints ?? []).map((c) => (typeof c === 'string' ? { mint: c } : { mint: c.mint })),
    }
  }
  if (raffleRes.data?.settings) {
    json.raffleSettings = raffleRes.data.settings
  }
  if (addressbookRes.data?.settings) {
    json.addressbookSettings = addressbookRes.data.settings
  }
  if (watchtowerRes.data?.length) {
    json.watchtowerWatches = watchtowerRes.data.map((r) =>
      pick(r, ['mint', 'track_holders', 'track_snapshot', 'track_transactions', 'enabled_at_holders', 'enabled_at_snapshot', 'enabled_at_transactions', 'created_at'])
    )
  }
  if (mintCatalogRes.data?.length) {
    json.mintCatalog = mintCatalogRes.data.map((r) =>
      pick(r, ['mint', 'kind', 'label'])
    )
  }
  if (mintScopeRes.data?.length) {
    const scope = mintScopeRes.data
    json.marketplaceScope = {
      collections: [...new Set(scope.filter((r) => r.source === 'collection').map((r) => r.collection_mint ?? r.mint))],
      splAssets: scope.filter((r) => r.source === 'spl_asset').map((r) => r.mint),
      currencies: scope.filter((r) => r.source === 'currency').map((r) => r.mint),
    }
  }
  if (gateListsRes.data?.length) {
    json.gateLists = gateListsRes.data.map((r) =>
      pick(r, ['address', 'name', 'authority', 'image_url'])
    )
  }
  if (raffleSlotsRes.data?.length) {
    json.raffleSlots = raffleSlotsRes.data.map((r) =>
      pick(r, ['raffle_pubkey', 'created_at', 'closed_at'])
    )
  }
  if (trackerRes.data?.length) {
    json.trackerAddressBook = trackerRes.data.map((r) => pick(r, ['mint', 'tier']))
  }
  if (collectionMembersRes.data?.length) {
    json.collectionScope = [...new Set(collectionMembersRes.data.map((r) => r.collection_mint))]
  }

  if (billingSubsRes.data?.length) {
    json.billingSubscriptions = billingSubsRes.data.map((r) =>
      pick(r, ['id', 'module_id', 'scope_key', 'billing_period', 'recurring_amount_usdc', 'period_start', 'period_end', 'conditions_snapshot', 'price_snapshot'])
    )
  }
  if (billingPaymentsRes.data?.length) {
    json.billingPayments = billingPaymentsRes.data.map((r) =>
      pick(r, ['id', 'module_id', 'scope_key', 'payment_type', 'amount_usdc', 'billing_period', 'period_start', 'period_end', 'tx_signature', 'status', 'memo', 'payer_wallet', 'conditions_snapshot', 'price_snapshot', 'confirmed_at', 'expires_at'])
    )
  }
  if (billingStateRes.data?.length) {
    json.billingState = billingStateRes.data.map((r) =>
      pick(r, ['module_id', 'selected_tier_id', 'period_end'])
    )
  }

  const guildId = discordServerRes.data?.discord_guild_id
  if (guildId) {
    json.discordServer = pick(discordServerRes.data, [
      'discord_guild_id',
      'guild_name',
      'bot_invite_state',
      'bot_role_position',
    ])
    const { data: rules } = await supabase
      .from('discord_role_rules')
      .select('id, discord_role_id, operator, condition_set_id')
      .eq('discord_guild_id', guildId)
    const setIds = [...new Set((rules ?? []).map((r) => r.condition_set_id).filter(Boolean))]
    const { data: conditions } =
      setIds.length > 0
        ? await supabase
            .from('condition_set_conditions')
            .select('condition_set_id, type, payload, logic_to_next')
            .in('condition_set_id', setIds)
        : { data: [] }
    const conditionsBySetId = (conditions ?? []).reduce((acc, c) => {
      const sid = c.condition_set_id
      if (!acc[sid]) acc[sid] = []
      acc[sid].push(pick(c, ['type', 'payload', 'logic_to_next']))
      return acc
    }, {})
    json.discordRoleRules = (rules ?? []).map((r) => ({
      discord_role_id: r.discord_role_id,
      operator: r.operator,
      conditions: conditionsBySetId[r.condition_set_id] ?? [],
    }))
  }

  const allMints = new Set()
  for (const r of mintCatalogRes.data ?? []) allMints.add(r.mint)
  for (const r of watchtowerRes.data ?? []) allMints.add(r.mint)
  for (const r of mintScopeRes.data ?? []) {
    allMints.add(r.mint)
    if (r.collection_mint) allMints.add(r.collection_mint)
  }
  for (const r of trackerRes.data ?? []) allMints.add(r.mint)
  for (const r of collectionMembersRes.data ?? []) allMints.add(r.collection_mint)
  const mints = [...allMints].filter(Boolean)
  if (mints.length > 0) {
    const { data: metaRows } = await supabase
      .from('mint_metadata')
      .select('mint, name, symbol, image, decimals, traits, trait_index, update_authority, uri, seller_fee_basis_points, primary_sale_happened, is_mutable, edition_nonce, token_standard')
      .in('mint', mints)
    if (metaRows?.length) {
      json.mintMetadata = metaRows.map((r) =>
        pick(r, ['mint', 'name', 'symbol', 'image', 'decimals', 'traits', 'trait_index', 'update_authority', 'uri', 'seller_fee_basis_points', 'primary_sale_happened', 'is_mutable', 'edition_nonce', 'token_standard'])
      )
    }
  }

  const path = join(CONFIGS_DIR, `${tenantId}.json`)
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n', 'utf-8')
  console.log('[export-tenant-config] Wrote', path)
}

main()
