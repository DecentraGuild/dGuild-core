/**
 * Discord Bot Edge Function.
 * Called by the Discord bot (Railway) using the service role key.
 * All writes use the admin client (bypasses RLS).
 *
 * Actions:
 *   context          – Return tenant + Discord module state for a guild.
 *   roles-upsert     – Upsert guild roles cache.
 *   eligible         – Compute eligible Discord user IDs per role.
 *   schedule-removals – Schedule role removals.
 *   pending-removals  – Claim and return due role removals.
 *   sync-holders     – Sync NFT/SPL holder snapshots for a guild.
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getSolanaConnection } from '../_shared/solana-connection.ts'
import { Connection, PublicKey } from 'npm:@solana/web3.js@1'
import { TOKEN_PROGRAM_ID } from 'npm:@solana/spl-token@0.4'
import {
  evaluateRule,
  type ConditionRow,
  type HolderSnapshot,
  type HOLDINGPayload,
  type NFTPayload,
  type WHITELISTPayload,
} from '@decentraguild/condition-engine'

// ---------------------------------------------------------------------------
// Bot auth guard: require x-bot-secret or service role Authorization
// ---------------------------------------------------------------------------

function isBotAuthorized(req: Request): boolean {
  const botSecret = Deno.env.get('DISCORD_BOT_SECRET')
  const header = req.headers.get('x-bot-secret') ?? req.headers.get('authorization') ?? ''
  if (botSecret && (header === botSecret || header === `Bearer ${botSecret}`)) return true
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return header === `Bearer ${serviceKey}`
}

// ---------------------------------------------------------------------------
// Holder sync helpers
// ---------------------------------------------------------------------------

const SPL_DATA_SIZE = 165

async function fetchSplHolders(
  connection: Connection,
  mint: string,
): Promise<Array<{ wallet: string; amount: string }>> {
  const mintPk = new PublicKey(mint)
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [
      { dataSize: SPL_DATA_SIZE },
      { memcmp: { offset: 0, bytes: mintPk.toBase58() } },
    ],
  })
  const byWallet = new Map<string, bigint>()
  for (const { account } of accounts) {
    const data = account.data as Uint8Array
    if (data.length < 72) continue
    const owner = new PublicKey(data.slice(32, 64)).toBase58()
    const view = new DataView(data.buffer, data.byteOffset)
    const amount = view.getBigUint64(64, true)
    if (amount > 0n) byWallet.set(owner, (byWallet.get(owner) ?? 0n) + amount)
  }
  return [...byWallet.entries()].map(([wallet, amount]) => ({ wallet, amount: String(amount) }))
}

async function fetchNftHolders(
  mint: string,
): Promise<Array<{ wallet: string; amount: string }>> {
  const rpcUrl = Deno.env.get('HELIUS_RPC_URL') ?? Deno.env.get('SOLANA_RPC_URL')!
  const countByWallet = new Map<string, number>()
  let page = 1
  let hasMore = true
  while (hasMore) {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAssetsByGroup',
        params: { groupKey: 'collection', groupValue: mint, limit: 1000, page },
      }),
    })
    const data = await res.json() as { result?: { items?: Array<{ ownership?: { owner?: string } }> } }
    const items = data.result?.items ?? []
    for (const item of items) {
      const owner = item.ownership?.owner
      if (owner) countByWallet.set(owner, (countByWallet.get(owner) ?? 0) + 1)
    }
    hasMore = items.length === 1000
    page++
  }
  return [...countByWallet.entries()].map(([wallet, amount]) => ({ wallet, amount: String(amount) }))
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  if (!isBotAuthorized(req)) {
    return errorResponse('Unauthorized', req, 401)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', req)
  }

  const action = body.action as string
  const db = getAdminClient()

  // ---------------------------------------------------------------------------
  // context – tenant + Discord module state
  // ---------------------------------------------------------------------------
  if (action === 'context') {
    const guildId = body.guildId as string
    if (!guildId) return errorResponse('guildId required', req)

    const { data: srv } = await db
      .from('discord_servers')
      .select('tenant_id, guild_name, bot_invite_state, bot_role_position')
      .eq('discord_guild_id', guildId)
      .maybeSingle()
    if (!srv) return errorResponse('Guild not linked', req, 404)

    const { data: tenant } = await db
      .from('tenant_config')
      .select('id, name, slug, modules')
      .eq('id', srv.tenant_id)
      .maybeSingle()

    return jsonResponse({ server: srv, tenant }, req)
  }

  // ---------------------------------------------------------------------------
  // roles-upsert – update guild roles cache
  // ---------------------------------------------------------------------------
  if (action === 'roles-upsert') {
    const guildId = body.guildId as string
    const roles = body.roles as Array<{
      role_id: string; name: string; position: number; color?: number; icon?: string; unicode_emoji?: string
    }>
    if (!guildId || !Array.isArray(roles)) return errorResponse('guildId and roles required', req)

    const rows = roles.map((r) => ({ discord_guild_id: guildId, ...r }))
    const { error: upsertErr } = await db.from('discord_guild_roles').upsert(rows, {
      onConflict: 'discord_guild_id,role_id',
    })
    if (upsertErr) return errorResponse(upsertErr.message, req, 500)
    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // eligible – compute eligible users per role
  // ---------------------------------------------------------------------------
  if (action === 'eligible') {
    const guildId = body.guildId as string
    const memberRolesRaw = body.memberRoles as Record<string, string[]> | undefined
    if (!guildId) return errorResponse('guildId required', req)

    // Persist member roles for shipment JSON generator (DISCORD conditions)
    if (memberRolesRaw && Object.keys(memberRolesRaw).length > 0) {
      await db.from('discord_member_roles').delete().eq('discord_guild_id', guildId)
      const rows = Object.entries(memberRolesRaw).map(([discord_user_id, role_ids]) => ({
        discord_guild_id: guildId,
        discord_user_id,
        role_ids: role_ids ?? [],
        updated_at: new Date().toISOString(),
      }))
      if (rows.length > 0) {
        await db.from('discord_member_roles').insert(rows)
      }
    }

    const { data: rules } = await db
      .from('discord_role_rules')
      .select('id, discord_role_id, condition_set_id')
      .eq('discord_guild_id', guildId)
      .not('condition_set_id', 'is', null)
    if (!rules?.length) return jsonResponse({ eligible: [] }, req)

    const setIds = [...new Set((rules ?? []).map((r) => r.condition_set_id).filter(Boolean))]
    const { data: allConditions } = await db
      .from('condition_set_conditions')
      .select('condition_set_id, type, payload, logic_to_next')
      .in('condition_set_id', setIds)

    const conditionsBySetId = new Map<number, ConditionRow[]>()
    for (const c of allConditions ?? []) {
      const sid = c.condition_set_id as number
      const list = conditionsBySetId.get(sid) ?? []
      list.push({ type: c.type, payload: c.payload ?? {}, logic_to_next: c.logic_to_next } as ConditionRow)
      conditionsBySetId.set(sid, list)
    }

    const conditionsByRule = new Map<number, ConditionRow[]>()
    for (const r of rules ?? []) {
      const sid = r.condition_set_id as number
      conditionsByRule.set(r.id as number, conditionsBySetId.get(sid) ?? [])
    }

    const { data: srv } = await db
      .from('discord_servers')
      .select('tenant_id')
      .eq('discord_guild_id', guildId)
      .maybeSingle()
    const tenantId = srv?.tenant_id as string | undefined

    const allAssetIds = new Set<string>()
    const allWhitelistListIds = new Set<string>()
    const shipmentMints = new Map<string, { begin_date: string; end_date: string }>()
    const snapshotMints = new Map<string, { days: number }>()
    const weightedMints = new Map<string, { begin_snapshot_at: string; end_snapshot_at: string }>()
    for (const conditions of conditionsByRule.values()) {
      for (const c of conditions) {
        if ((c.type === 'HOLDING') && (c.payload as HOLDINGPayload).mint) allAssetIds.add((c.payload as HOLDINGPayload).mint)
        if ((c.type === 'TRAIT') && ((c.payload as NFTPayload).mint ?? (c.payload as NFTPayload).collection_or_mint)) {
          allAssetIds.add(((c.payload as NFTPayload).mint ?? (c.payload as NFTPayload).collection_or_mint) as string)
        }
        if (c.type === 'SHIPMENT' && c.payload.mint && c.payload.begin_date && c.payload.end_date) {
          allAssetIds.add(c.payload.mint as string)
          shipmentMints.set(c.payload.mint as string, {
            begin_date: c.payload.begin_date as string,
            end_date: c.payload.end_date as string,
          })
        }
        if (c.type === 'SNAPSHOTS' && c.payload.mint) {
          const days = Math.floor(Number(c.payload.days) || 0)
          if (days >= 1) {
            allAssetIds.add(c.payload.mint as string)
            snapshotMints.set(c.payload.mint as string, { days })
          }
        }
        if (c.type === 'TIME_WEIGHTED' && c.payload.mint && c.payload.begin_snapshot_at && c.payload.end_snapshot_at) {
          allAssetIds.add(c.payload.mint as string)
          weightedMints.set(c.payload.mint as string, {
            begin_snapshot_at: c.payload.begin_snapshot_at as string,
            end_snapshot_at: c.payload.end_snapshot_at as string,
          })
        }
        if (c.type === 'WHITELIST' && (c.payload as WHITELISTPayload).list_address) {
          allWhitelistListIds.add((c.payload as WHITELISTPayload).list_address)
        }
      }
    }

    function toWalletList(snap: HolderSnapshot): string[] {
      if (!Array.isArray(snap) || snap.length === 0) return []
      return typeof snap[0] === 'string'
        ? (snap as string[])
        : (snap as Array<{ wallet: string }>).map((x) => x.wallet)
    }

    function parseHolderWallets(raw: unknown): HolderSnapshot {
      if (!Array.isArray(raw)) return []
      if (raw.length === 0) return []
      const first = raw[0]
      if (typeof first === 'string') return raw as string[]
      if (first && typeof first === 'object' && 'wallet' in first) {
        return raw as Array<{ wallet: string; amount: string }>
      }
      return []
    }

    function intersectSnapshots(snaps: Array<{ holder_wallets: unknown }>): HolderSnapshot {
      if (!snaps?.length) return []
      const walletSets = snaps.map((s) => new Set(toWalletList(parseHolderWallets(s.holder_wallets))))
      const intersection = walletSets[0]
        ? [...walletSets[0]].filter((w) => walletSets.every((set) => set.has(w)))
        : []
      return intersection
    }

    const snapshotByAsset = new Map<string, HolderSnapshot>()
    const weightedShareByRule = new Map<number, Map<string, number>>()

    for (const m of allAssetIds) {
      const weightedRange = weightedMints.get(m)
      const shipmentRange = shipmentMints.get(m)
      const snapshotRange = snapshotMints.get(m)

      if (weightedRange) {
        const { data: snaps } = await db
          .from('holder_snapshots')
          .select('snapshot_at, holder_wallets')
          .eq('mint', m)
          .gte('snapshot_at', weightedRange.begin_snapshot_at)
          .lte('snapshot_at', weightedRange.end_snapshot_at)
          .order('snapshot_at', { ascending: true })
        if (snaps?.length) {
          const n = snaps.length
          const msPerDay = 24 * 60 * 60 * 1000
          const intervalDays: number[] = []
          for (let i = 0; i < n; i++) {
            if (n === 1) {
              intervalDays.push(1)
            } else if (i === 0) {
              const t0 = new Date(snaps[0]!.snapshot_at as string).getTime()
              const t1 = new Date(snaps[1]!.snapshot_at as string).getTime()
              intervalDays.push((t1 - t0) / 2 / msPerDay)
            } else if (i === n - 1) {
              const tn1 = new Date(snaps[n - 2]!.snapshot_at as string).getTime()
              const tn = new Date(snaps[n - 1]!.snapshot_at as string).getTime()
              intervalDays.push((tn - tn1) / 2 / msPerDay)
            } else {
              const tPrev = new Date(snaps[i - 1]!.snapshot_at as string).getTime()
              const tNext = new Date(snaps[i + 1]!.snapshot_at as string).getTime()
              intervalDays.push((tNext - tPrev) / 2 / msPerDay)
            }
          }
          const totalWeightByWallet = new Map<string, number>()
          for (let i = 0; i < snaps.length; i++) {
            const hw = parseHolderWallets(snaps[i]!.holder_wallets)
            const interval = Math.max(0, intervalDays[i] ?? 0)
            for (const entry of hw) {
              const wallet = typeof entry === 'string' ? entry : (entry as { wallet: string }).wallet
              const amt = typeof entry === 'string' ? 1 : Math.max(0, Number((entry as { amount: string }).amount) || 0)
              totalWeightByWallet.set(wallet, (totalWeightByWallet.get(wallet) ?? 0) + amt * interval)
            }
          }
          const totalAll = [...totalWeightByWallet.values()].reduce((a, b) => a + b, 0)
          const shareByWallet = new Map<string, number>()
          if (totalAll > 0) {
            for (const [wallet, weight] of totalWeightByWallet) {
              shareByWallet.set(wallet, (weight / totalAll) * 100)
            }
          }
          for (const rule of rules ?? []) {
            const conditions = conditionsByRule.get(rule.id as number) ?? []
            const hasTw = conditions.some((c) => c.type === 'TIME_WEIGHTED' && (c.payload as { mint?: string }).mint === m)
            if (hasTw) {
              weightedShareByRule.set(rule.id as number, shareByWallet)
            }
          }
        }
      } else if (shipmentRange && tenantId) {
        const { data: snaps } = await db
          .from('tracker_holder_snapshots')
          .select('holder_wallets')
          .eq('tenant_id', tenantId)
          .eq('mint', m)
          .gte('snapshot_date', shipmentRange.begin_date)
          .lte('snapshot_date', shipmentRange.end_date)
          .order('snapshot_date', { ascending: true })
        if (snaps?.length) snapshotByAsset.set(m, intersectSnapshots(snaps))
      } else if (snapshotRange && tenantId) {
        const end = new Date()
        const begin = new Date(end)
        begin.setDate(begin.getDate() - snapshotRange.days + 1)
        const begin_date = begin.toISOString().slice(0, 10)
        const end_date = end.toISOString().slice(0, 10)
        const { data: snaps } = await db
          .from('tracker_holder_snapshots')
          .select('holder_wallets')
          .eq('tenant_id', tenantId)
          .eq('mint', m)
          .gte('snapshot_date', begin_date)
          .lte('snapshot_date', end_date)
          .order('snapshot_date', { ascending: true })
        if (snaps?.length) snapshotByAsset.set(m, intersectSnapshots(snaps))
      } else if (!shipmentRange && !snapshotRange && !weightedRange) {
        const { data: current } = await db
          .from('holder_current')
          .select('holder_wallets')
          .eq('mint', m)
          .maybeSingle()
        if (current?.holder_wallets) {
          snapshotByAsset.set(m, parseHolderWallets(current.holder_wallets))
        }
      }
    }

    const whitelistMembersByListAddress = new Map<string, Set<string>>()
    if (allWhitelistListIds.size > 0) {
      const connection = getSolanaConnection()
      for (const listAddress of allWhitelistListIds) {
        try {
          // Fetch on-chain whitelist entries via whitelist program
          const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/gates`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ action: 'entries', listAddress }),
          })
          if (res.ok) {
            const data = await res.json() as { entries?: string[] }
            whitelistMembersByListAddress.set(listAddress, new Set(data.entries ?? []))
          }
        } catch {
          whitelistMembersByListAddress.set(listAddress, new Set())
        }
      }
    }

    const { data: links } = await db.from('wallet_discord_links').select('wallet_address, discord_user_id')
    const walletsByUserId = new Map<string, string[]>()
    for (const l of links ?? []) {
      const list = walletsByUserId.get(l.discord_user_id as string) ?? []
      list.push(l.wallet_address as string)
      walletsByUserId.set(l.discord_user_id as string, list)
    }

    const memberRolesByUserId = new Map<string, string[]>(
      Object.entries(memberRolesRaw ?? {}),
    )

    const eligible: Array<{ discord_role_id: string; eligible_discord_user_ids: string[] }> = []
    for (const rule of rules) {
      const conditions = conditionsByRule.get(rule.id as number) ?? []
      const walletShareByWallet = weightedShareByRule.get(rule.id as number)
      const eligibleUsers: string[] = []
      for (const [discordUserId, linkedWallets] of walletsByUserId) {
        if (linkedWallets.length === 0) continue
        const context = {
          linkedWallets,
          snapshotByAsset,
          discordRoleIds: memberRolesByUserId.get(discordUserId) ?? [],
          whitelistMembersByListAddress,
          ...(walletShareByWallet && { walletShareByWallet }),
        }
        if (evaluateRule(conditions, context)) eligibleUsers.push(discordUserId)
      }
      eligible.push({ discord_role_id: rule.discord_role_id as string, eligible_discord_user_ids: eligibleUsers })
    }

    return jsonResponse({ eligible }, req)
  }

  // ---------------------------------------------------------------------------
  // schedule-removals – batch schedule role removals
  // ---------------------------------------------------------------------------
  if (action === 'schedule-removals') {
    const guildId = body.guildId as string
    const removals = body.removals as Array<{
      discord_user_id: string; discord_role_id: string; scheduled_remove_at: string
    }>
    if (!guildId || !Array.isArray(removals)) return errorResponse('guildId and removals required', req)

    const rows = removals.map((r) => ({ discord_guild_id: guildId, ...r }))
    await db.from('discord_role_removal_queue').insert(rows)
    return jsonResponse({ scheduled: rows.length }, req)
  }

  // ---------------------------------------------------------------------------
  // pending-removals – claim and return due removals
  // ---------------------------------------------------------------------------
  if (action === 'pending-removals') {
    const guildId = body.guildId as string
    if (!guildId) return errorResponse('guildId required', req)

    const { data: due } = await db
      .from('discord_role_removal_queue')
      .select('id, discord_user_id, discord_role_id')
      .eq('discord_guild_id', guildId)
      .lte('scheduled_remove_at', new Date().toISOString())
      .limit(50)

    if (due?.length) {
      await db.from('discord_role_removal_queue').delete().in('id', due.map((r) => r.id))
    }

    return jsonResponse({ removals: due ?? [] }, req)
  }

  // ---------------------------------------------------------------------------
  // sync-holders – sync NFT/SPL holders for all assets configured in a guild
  // ---------------------------------------------------------------------------
  if (action === 'sync-holders') {
    const guildId = body.guildId as string
    if (!guildId) return errorResponse('guildId required', req)

    // Resolve tenant_id from guild, then fetch mints with track_holders from watchtower_watches
    const { data: srvRow } = await db
      .from('discord_servers')
      .select('tenant_id')
      .eq('discord_guild_id', guildId)
      .maybeSingle()

    if (!srvRow) return jsonResponse({ synced: 0 }, req)

    const { data: watches } = await db
      .from('watchtower_watches')
      .select('mint')
      .eq('tenant_id', srvRow.tenant_id)
      .eq('track_holders', true)

    if (!watches?.length) return jsonResponse({ synced: 0 }, req)

    const mintKeys = watches.map((w) => w.mint as string)
    const { data: catalogRows } = await db
      .from('tenant_mint_catalog')
      .select('mint, kind')
      .eq('tenant_id', srvRow.tenant_id)
      .in('mint', mintKeys)
    const assets = catalogRows ?? []

    const connection = getSolanaConnection()
    let synced = 0

    for (const { mint: asset_id, kind } of assets) {
      try {
        let holders: Array<{ wallet: string; amount: string }>
        if (kind === 'SPL') {
          holders = await fetchSplHolders(connection, asset_id as string)
        } else {
          holders = await fetchNftHolders(asset_id as string)
        }
        await db.from('holder_current').upsert({
          mint: asset_id,
          holder_wallets: holders,
          last_updated: new Date().toISOString(),
        }, { onConflict: 'mint' })
        synced++
      } catch {
        // continue with next asset
      }
    }

    await db.from('discord_audit_log').insert({
      discord_guild_id: guildId,
      action: 'holder_sync',
      details: { synced, total: assets.length },
    })

    return jsonResponse({ synced, total: assets.length }, req)
  }

  return errorResponse(`Unknown action: ${action}`, req, 400)
})
