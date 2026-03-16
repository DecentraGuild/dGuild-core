#!/usr/bin/env node
/**
 * Syncs configs/tenants/*.json into Supabase.
 * Restores tenant_config plus module settings (marketplace, raffle, addressbook,
 * watchtower, mint catalog, gates, discord rules, billing, etc.).
 * Run manually when you want to apply file changes to the DB.
 * Fails gracefully (exit 0) if Supabase is unreachable.
 *
 * Usage: node scripts/sync-tenant-config.mjs
 * Or: pnpm db:sync
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or uses supabase status -o json for local)
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIGS_DIR = join(ROOT, 'configs', 'tenants')

function getCredentials() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
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
      key: parsed.SERVICE_ROLE_KEY ?? parsed.service_role_key,
    }
  } catch {
    return null
  }
}

function tenantConfigToRow(config) {
  const branding = config.branding ?? { logo: null, theme: {} }
  const admins = config.admins ?? []
  return {
    id: config.id,
    slug: config.slug ?? config.id,
    name: config.name,
    description: config.description ?? '',
    discord_server_invite_link: config.discordServerInviteLink ?? null,
    default_gate: config.defaultGate ?? null,
    branding,
    modules: config.modules ?? {},
    admins,
    treasury: config.treasury ?? null,
  }
}

async function syncTenant(supabase, config) {
  const tenantId = config.id

  const tenantRow = tenantConfigToRow(config)
  const { error: tcErr } = await supabase.from('tenant_config').upsert(tenantRow, {
    onConflict: 'id',
  })
  if (tcErr) throw tcErr

  if (config.marketplaceSettings !== undefined) {
    const { error } = await supabase.from('marketplace_settings').upsert(
      { tenant_id: tenantId, settings: config.marketplaceSettings ?? {} },
      { onConflict: 'tenant_id' }
    )
    if (error) throw error

    const s = config.marketplaceSettings ?? {}
    const toMint = (c) => (typeof c === 'string' ? c : c?.mint)
    const scopeRows = [
      ...(s.collectionMints ?? []).map((c) => ({ tenant_id: tenantId, mint: toMint(c), source: 'collection', collection_mint: toMint(c) })),
      ...(s.splAssetMints ?? []).map((c) => ({ tenant_id: tenantId, mint: toMint(c), source: 'spl_asset', collection_mint: null })),
      ...(s.currencyMints ?? []).map((c) => ({ tenant_id: tenantId, mint: toMint(c), source: 'currency', collection_mint: null })),
    ].filter((r) => r.mint)
    await supabase.from('marketplace_mint_scope').delete().eq('tenant_id', tenantId)
    if (scopeRows.length) {
      const { error: scopeErr } = await supabase.from('marketplace_mint_scope').insert(scopeRows)
      if (scopeErr) throw scopeErr
    }
  }

  if (config.raffleSettings !== undefined) {
    const { error } = await supabase.from('raffle_settings').upsert(
      { tenant_id: tenantId, settings: config.raffleSettings ?? {} },
      { onConflict: 'tenant_id' }
    )
    if (error) throw error
  }

  if (config.raffleSlots !== undefined) {
    await supabase.from('tenant_raffles').delete().eq('tenant_id', tenantId)
    if (config.raffleSlots.length) {
      const { error } = await supabase.from('tenant_raffles').insert(
        config.raffleSlots.map((r) => ({
          tenant_id: tenantId,
          raffle_pubkey: r.raffle_pubkey,
          created_at: r.created_at ?? new Date().toISOString(),
          closed_at: r.closed_at ?? null,
        }))
      )
      if (error) throw error
    }
  }

  if (config.addressbookSettings !== undefined) {
    const { error } = await supabase.from('addressbook_settings').upsert(
      { tenant_id: tenantId, settings: config.addressbookSettings ?? {} },
      { onConflict: 'tenant_id' }
    )
    if (error) throw error
  }

  const replaceList = async (table, rows, toRow) => {
    if (rows === undefined) return
    await supabase.from(table).delete().eq('tenant_id', tenantId)
    if (rows.length) {
      const { error } = await supabase.from(table).insert(rows.map(toRow))
      if (error) throw error
    }
  }

  await replaceList(
    'watchtower_watches',
    config.watchtowerWatches,
    (r) => ({
      tenant_id: tenantId,
      mint: r.mint,
      track_holders: r.track_holders ?? false,
      track_snapshot: r.track_snapshot ?? false,
      track_transactions: r.track_transactions ?? false,
      enabled_at_holders: r.enabled_at_holders ?? null,
      enabled_at_snapshot: r.enabled_at_snapshot ?? null,
      enabled_at_transactions: r.enabled_at_transactions ?? null,
    })
  )

  await replaceList('tenant_mint_catalog', config.mintCatalog, (r) => ({
    tenant_id: tenantId,
    mint: r.mint,
    kind: r.kind ?? 'SPL',
    label: r.label ?? null,
  }))

  if (config.marketplaceScope !== undefined && config.marketplaceSettings === undefined) {
    const scope = config.marketplaceScope
    const scopeRows = [
      ...(scope.collections ?? []).map((mint) => ({
        tenant_id: tenantId,
        mint,
        source: 'collection',
        collection_mint: mint,
      })),
      ...(scope.splAssets ?? []).map((mint) => ({
        tenant_id: tenantId,
        mint,
        source: 'spl_asset',
        collection_mint: null,
      })),
      ...(scope.currencies ?? []).map((mint) => ({
        tenant_id: tenantId,
        mint,
        source: 'currency',
        collection_mint: null,
      })),
    ]
    await supabase.from('marketplace_mint_scope').delete().eq('tenant_id', tenantId)
    if (scopeRows.length) {
      const { error } = await supabase.from('marketplace_mint_scope').insert(scopeRows)
      if (error) throw error
    }
  } else if (config.marketplaceMintScope !== undefined) {
    await replaceList('marketplace_mint_scope', config.marketplaceMintScope, (r) => ({
      tenant_id: tenantId,
      mint: r.mint,
      source: r.source,
      collection_mint: r.collection_mint ?? null,
    }))
  }

  const gateLists = config.gateLists
  if (gateLists !== undefined) {
    await supabase.from('tenant_gate_lists').delete().eq('tenant_id', tenantId)
    if (gateLists.length) {
      for (const r of gateLists) {
        const address = r.address
        await supabase.from('gate_metadata').upsert(
          {
            address,
            name: r.name ?? 'Gate',
            authority: r.authority ?? '',
            image_url: r.image_url ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'address' }
        )
      }
      const { error } = await supabase.from('tenant_gate_lists').insert(
        gateLists.map((r) => ({ tenant_id: tenantId, address: r.address }))
      )
      if (error) throw error
    }
  }

  await replaceList('tracker_address_book', config.trackerAddressBook, (r) => ({
    tenant_id: tenantId,
    mint: r.mint,
    tier: r.tier ?? 'base',
  }))

  if (config.mintMetadata?.length) {
    const now = new Date().toISOString()
    for (const m of config.mintMetadata) {
      const { error } = await supabase.from('mint_metadata').upsert(
        {
          mint: m.mint,
          name: m.name ?? null,
          symbol: m.symbol ?? null,
          image: m.image ?? null,
          decimals: m.decimals ?? null,
          traits: m.traits ?? null,
          trait_index: m.trait_index ?? null,
          update_authority: m.update_authority ?? null,
          uri: m.uri ?? null,
          seller_fee_basis_points: m.seller_fee_basis_points ?? null,
          primary_sale_happened: m.primary_sale_happened ?? null,
          is_mutable: m.is_mutable ?? null,
          edition_nonce: m.edition_nonce ?? null,
          token_standard: m.token_standard ?? null,
          updated_at: now,
        },
        { onConflict: 'mint' }
      )
      if (error) throw error
    }
  }

  if (config.billingPayments !== undefined) {
    await supabase.from('billing_payments').delete().eq('tenant_id', tenantId)
    if (config.billingPayments.length) {
      const { error } = await supabase.from('billing_payments').insert(
        config.billingPayments.map((p) => ({
          id: p.id,
          tenant_id: tenantId,
          module_id: p.module_id,
          scope_key: p.scope_key ?? '',
          payment_type: p.payment_type,
          amount_usdc: p.amount_usdc,
          billing_period: p.billing_period,
          period_start: p.period_start,
          period_end: p.period_end,
          tx_signature: p.tx_signature ?? null,
          status: p.status ?? 'pending',
          memo: p.memo ?? '',
          payer_wallet: p.payer_wallet,
          conditions_snapshot: p.conditions_snapshot ?? null,
          price_snapshot: p.price_snapshot ?? null,
          confirmed_at: p.confirmed_at ?? null,
          expires_at: p.expires_at,
        }))
      )
      if (error) throw error
    }
  }

  if (config.collectionScope !== undefined) {
    await supabase.from('tenant_collection_scope').delete().eq('tenant_id', tenantId)
    if (config.collectionScope.length) {
      const { error } = await supabase.from('tenant_collection_scope').insert(
        config.collectionScope.map((collection_mint) => ({ tenant_id: tenantId, collection_mint }))
      )
      if (error) throw error
    }
  } else if (config.collectionMembers !== undefined) {
    await supabase.from('tenant_collection_scope').delete().eq('tenant_id', tenantId)
    const collections = [...new Set(config.collectionMembers.map((r) => r.collection_mint))]
    if (collections.length) {
      await supabase.from('tenant_collection_scope').insert(
        collections.map((collection_mint) => ({ tenant_id: tenantId, collection_mint }))
      )
    }
    if (config.collectionMembers.length) {
      const members = config.collectionMembers.map((r) => ({
        collection_mint: r.collection_mint,
        mint: r.mint,
        name: r.name ?? null,
        image: r.image ?? null,
        traits: r.traits ?? null,
        owner: r.owner ?? null,
      }))
      const { error } = await supabase.from('collection_members').upsert(members, {
        onConflict: 'collection_mint,mint',
      })
      if (error) throw error
    }
  }

  if (config.discordServer !== undefined) {
    const ds = config.discordServer
    const { error } = await supabase.from('discord_servers').upsert(
      {
        tenant_id: tenantId,
        discord_guild_id: ds.discord_guild_id,
        guild_name: ds.guild_name ?? null,
        bot_invite_state: ds.bot_invite_state ?? null,
        bot_role_position: ds.bot_role_position ?? null,
      },
      { onConflict: 'tenant_id' }
    )
    if (error) throw error

    if (config.discordRoleRules !== undefined) {
      const guildId = ds.discord_guild_id
      const { data: existingRules } = await supabase
        .from('discord_role_rules')
        .select('id, condition_set_id')
        .eq('discord_guild_id', guildId)
      const existingSetIds = (existingRules ?? []).map((r) => r.condition_set_id).filter(Boolean)
      if (existingRules?.length) {
        await supabase.from('discord_role_rules').delete().eq('discord_guild_id', guildId)
        for (const setId of existingSetIds) {
          await supabase.from('condition_set_conditions').delete().eq('condition_set_id', setId)
          await supabase.from('condition_sets').delete().eq('id', setId)
        }
      }

      for (const rule of config.discordRoleRules) {
        const conditions = rule.conditions ?? []
        const { data: insertedSet, error: setErr } = await supabase
          .from('condition_sets')
          .insert({
            tenant_id: tenantId,
            name: 'Rule for role ' + (rule.discord_role_id ?? ''),
          })
          .select('id')
          .single()
        if (setErr) throw setErr

        if (conditions.length) {
          const { error: condErr } = await supabase.from('condition_set_conditions').insert(
            conditions.map((c) => ({
              condition_set_id: insertedSet.id,
              type: c.type,
              payload: c.payload ?? {},
              logic_to_next: c.logic_to_next ?? null,
            }))
          )
          if (condErr) throw condErr
        }

        const { error: ruleErr } = await supabase.from('discord_role_rules').insert({
          discord_guild_id: guildId,
          discord_role_id: rule.discord_role_id,
          operator: rule.operator ?? 'AND',
          condition_set_id: insertedSet.id,
        })
        if (ruleErr) throw ruleErr
      }
    }
  }
}

async function main() {
  const creds = getCredentials()
  if (!creds?.url || !creds?.key) {
    console.warn(
      '[sync-tenant-config] Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run supabase start.'
    )
    process.exit(0)
  }

  const tenantFiles = readdirSync(CONFIGS_DIR).filter((f) => f.endsWith('.json'))
  if (tenantFiles.length === 0) {
    console.log('[sync-tenant-config] No tenant JSON files in configs/tenants/')
    process.exit(0)
  }

  const configs = []
  for (const file of tenantFiles) {
    const path = join(CONFIGS_DIR, file)
    try {
      const raw = readFileSync(path, 'utf-8')
      const config = JSON.parse(raw)
      if (!config.id || !config.name) {
        console.error(
          `[sync-tenant-config] Invalid config in ${file}: id and name required`
        )
        process.exit(1)
      }
      configs.push(config)
    } catch (err) {
      console.error(`[sync-tenant-config] Failed to read ${path}:`, err.message)
      process.exit(1)
    }
  }

  const supabase = createClient(creds.url, creds.key)

  try {
    for (const config of configs) {
      await syncTenant(supabase, config)
    }
  } catch (err) {
    console.warn('[sync-tenant-config] Supabase unreachable:', err.message)
    process.exit(0)
  }

  console.log('[sync-tenant-config] Synced', configs.map((c) => c.id).join(', '))
}

main()
