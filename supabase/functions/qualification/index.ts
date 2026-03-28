/**
 * Qualification Edge Function.
 * Produces recipient JSON for the Shipment airdrop tool.
 *
 * Actions:
 *   rules-mode-json – Evaluate condition set at snapshot date, output { mint, recipients }.
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { requireTenantAdmin } from '../_shared/auth.ts'
import { getSolanaConnection } from '../_shared/solana-connection.ts'
import { fetchMintMetadata } from '../_shared/mint-metadata.ts'
import {
  evaluateRule,
  type ConditionRow,
  type EvaluationContext,
  type HolderSnapshot,
} from '@decentraguild/condition-engine'
import { Connection, PublicKey } from 'npm:@solana/web3.js@1'

const WHITELIST_PROGRAM_ID =
  Deno.env.get('WHITELIST_PROGRAM_ID') ?? 'WLSTEvb5PEG1HN6M5HAomdWQ6NyR7zFPwSVbzVJKHDZ'

async function fetchGateEntries(connection: Connection, listAddress: string): Promise<string[]> {
  try {
    const programId = new PublicKey(WHITELIST_PROGRAM_ID)
    const listPk = new PublicKey(listAddress)
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [{ memcmp: { offset: 8, bytes: listPk.toBase58() } }],
    })
    const entries: string[] = []
    for (const { account } of accounts) {
      try {
        const data = account.data as Uint8Array
        if (data.length >= 72) {
          const wallet = new PublicKey(data.slice(40, 72)).toBase58()
          entries.push(wallet)
        }
      } catch {
        // skip malformed
      }
    }
    return entries
  } catch {
    return []
  }
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

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  const authHeader = req.headers.get('Authorization')
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', req)
  }

  const action = body.action as string
  const db = getAdminClient()

  if (action === 'rules-mode-json') {
    const authCheck = await requireTenantAdmin(authHeader, body.tenantId as string, db)
    if (!authCheck.ok) return authCheck.response

    const tenantId = body.tenantId as string
    const conditionSetId = body.conditionSetId as number
    const fixedAmount = Number(body.fixedAmount) || 0
    const mint = body.mint as string

    if (!tenantId || !conditionSetId || !mint) {
      return errorResponse('tenantId, conditionSetId, mint required', req)
    }

    const { data: set } = await db
      .from('condition_sets')
      .select('id, tenant_id')
      .eq('id', conditionSetId)
      .maybeSingle()

    if (!set || (set.tenant_id as string) !== tenantId) {
      return errorResponse('Condition set not found or access denied', req, 404)
    }

    const { data: conditions } = await db
      .from('condition_set_conditions')
      .select('type, payload, logic_to_next')
      .eq('condition_set_id', conditionSetId)
      .order('id')

    const conditionRows: ConditionRow[] = (conditions ?? []).map((c) => ({
      type: c.type as ConditionRow['type'],
      payload: (c.payload as Record<string, unknown>) ?? {},
      logic_to_next: (c.logic_to_next as 'AND' | 'OR' | null) ?? null,
    }))

    const requiredRoleIds = conditionRows
      .filter((c) => c.type === 'DISCORD')
      .map((c) => String(c.payload.required_role_id ?? '').trim())
      .filter(Boolean)
    const hasDiscordCondition = requiredRoleIds.length > 0

    const mintsNeeded = new Set<string>()
    const shipmentMints = new Map<string, { begin_date: string; end_date: string }>()
    const snapshotMints = new Map<string, { days: number }>()
    for (const c of conditionRows) {
      if (c.type === 'HOLDING' && c.payload.mint) mintsNeeded.add(c.payload.mint as string)
      if (c.type === 'TRAIT' && (c.payload.mint ?? c.payload.collection_or_mint))
        mintsNeeded.add((c.payload.mint ?? c.payload.collection_or_mint) as string)
      if (c.type === 'SHIPMENT' && c.payload.mint && c.payload.begin_date && c.payload.end_date) {
        mintsNeeded.add(c.payload.mint as string)
        shipmentMints.set(c.payload.mint as string, {
          begin_date: c.payload.begin_date as string,
          end_date: c.payload.end_date as string,
        })
      }
      if (c.type === 'SNAPSHOTS' && c.payload.mint) {
        const days = Math.floor(Number(c.payload.days) || 0)
        if (days >= 1) {
          mintsNeeded.add(c.payload.mint as string)
          snapshotMints.set(c.payload.mint as string, { days })
        }
      }
    }

    function toWalletList(snap: HolderSnapshot): string[] {
      if (!Array.isArray(snap) || snap.length === 0) return []
      return typeof snap[0] === 'string'
        ? (snap as string[])
        : (snap as Array<{ wallet: string }>).map((x) => x.wallet)
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
    for (const m of mintsNeeded) {
      const shipmentRange = shipmentMints.get(m)
      const snapshotRange = snapshotMints.get(m)
      if (shipmentRange) {
        const { data: snaps } = await db
          .from('holder_snapshots')
          .select('holder_wallets')
          .eq('mint', m)
          .gte('snapshot_date', shipmentRange.begin_date)
          .lte('snapshot_date', shipmentRange.end_date)
          .order('snapshot_date', { ascending: true })

        if (snaps?.length) {
          snapshotByAsset.set(m, intersectSnapshots(snaps))
        }
      } else if (snapshotRange) {
        const end = new Date()
        const begin = new Date(end)
        begin.setDate(begin.getDate() - snapshotRange.days + 1)
        const begin_date = begin.toISOString().slice(0, 10)
        const end_date = end.toISOString().slice(0, 10)

        const { data: snaps } = await db
          .from('holder_snapshots')
          .select('holder_wallets')
          .eq('mint', m)
          .gte('snapshot_date', begin_date)
          .lte('snapshot_date', end_date)
          .order('snapshot_date', { ascending: true })

        if (snaps?.length) {
          snapshotByAsset.set(m, intersectSnapshots(snaps))
        }
      } else {
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
    for (const c of conditionRows) {
      if (c.type === 'WHITELIST' && c.payload.list_address) {
        const addr = c.payload.list_address as string
        if (!whitelistMembersByListAddress.has(addr)) {
          const connection = getSolanaConnection()
          const entries = await fetchGateEntries(connection, addr)
          whitelistMembersByListAddress.set(addr, new Set(entries))
        }
      }
    }

    let memberRolesByUserId = new Map<string, string[]>()
    let walletToUserId = new Map<string, string>()
    let userIdToWallets = new Map<string, string[]>()

    if (hasDiscordCondition) {
      const { data: srv } = await db
        .from('discord_servers')
        .select('discord_guild_id')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (!srv?.discord_guild_id) {
        return errorResponse('DISCORD condition requires a linked Discord server', req, 400)
      }
      const guildId = srv.discord_guild_id as string

      const { data: memberRolesRows } = await db
        .from('discord_member_roles')
        .select('discord_user_id, role_ids')
        .eq('discord_guild_id', guildId)
      for (const row of memberRolesRows ?? []) {
        const userId = row.discord_user_id as string
        const roleIds = Array.isArray(row.role_ids) ? (row.role_ids as string[]) : []
        memberRolesByUserId.set(userId, roleIds)
      }

      const { data: links } = await db.from('wallet_discord_links').select('wallet_address, discord_user_id')
      for (const l of links ?? []) {
        const wallet = l.wallet_address as string
        const userId = l.discord_user_id as string
        walletToUserId.set(wallet, userId)
        const list = userIdToWallets.get(userId) ?? []
        list.push(wallet)
        userIdToWallets.set(userId, list)
      }
    }

    const allWallets = new Set<string>()
    for (const snap of snapshotByAsset.values()) {
      if (Array.isArray(snap)) {
        for (const w of snap) {
          if (typeof w === 'string') allWallets.add(w)
          else if (w && typeof w === 'object' && 'wallet' in w) allWallets.add((w as { wallet: string }).wallet)
        }
      }
    }
    for (const members of whitelistMembersByListAddress.values()) {
      for (const w of members) allWallets.add(w)
    }

    if (hasDiscordCondition) {
      for (const [userId, roleIds] of memberRolesByUserId) {
        const hasRequiredRole = requiredRoleIds.some((rid) => roleIds.includes(rid))
        if (hasRequiredRole) {
          for (const w of userIdToWallets.get(userId) ?? []) allWallets.add(w)
        }
      }
    }

    const recipients: Array<{ address: string; amount: number }> = []
    for (const wallet of allWallets) {
      const discordUserId = walletToUserId.get(wallet)
      const discordRoleIds = discordUserId ? (memberRolesByUserId.get(discordUserId) ?? []) : []
      const context: EvaluationContext = {
        linkedWallets: [wallet],
        snapshotByAsset,
        discordRoleIds,
        whitelistMembersByListAddress,
      }
      if (evaluateRule(conditionRows, context)) {
        recipients.push({ address: wallet, amount: fixedAmount })
      }
    }

    return jsonResponse({ mint, recipients }, req)
  }

  if (action === 'weighted-time-json') {
    const authCheck = await requireTenantAdmin(authHeader, body.tenantId as string, db)
    if (!authCheck.ok) return authCheck.response

    const tenantId = body.tenantId as string
    const conditionSetId = body.conditionSetId as number
    const totalAmount = Number(body.totalAmount) || 0
    const mint = (body.mint as string)?.trim()

    if (!tenantId || !conditionSetId || !mint) {
      return errorResponse('tenantId, conditionSetId, mint required', req)
    }
    if (totalAmount <= 0) {
      return errorResponse('totalAmount must be positive', req)
    }

    let decimals: number | null = null
    const { data: metaRow } = await db.from('mint_metadata').select('decimals').eq('mint', mint).maybeSingle()
    if (typeof metaRow?.decimals === 'number' && metaRow.decimals >= 0) {
      decimals = metaRow.decimals
    }
    if (decimals == null) {
      const meta = await fetchMintMetadata(mint, 'SPL')
      decimals = typeof meta?.decimals === 'number' && meta.decimals >= 0 ? meta.decimals : null
    }
    if (decimals == null) {
      return errorResponse('Could not determine mint decimals for distribution', req, 400)
    }

    const { data: set } = await db
      .from('condition_sets')
      .select('id, tenant_id, rule_type')
      .eq('id', conditionSetId)
      .maybeSingle()

    if (!set || (set.tenant_id as string) !== tenantId) {
      return errorResponse('Condition set not found or access denied', req, 404)
    }
    if ((set.rule_type as string) !== 'weighted') {
      return errorResponse('Condition set must be weighted rule type', req, 400)
    }

    const { data: conditions } = await db
      .from('condition_set_conditions')
      .select('type, payload')
      .eq('condition_set_id', conditionSetId)
      .order('id')

    const tw = (conditions ?? []).find((c) => c.type === 'TIME_WEIGHTED')
    if (!tw || (conditions ?? []).length !== 1) {
      return errorResponse('Weighted rule must have exactly one TIME_WEIGHTED condition', req, 400)
    }

    const p = (tw.payload as Record<string, unknown>) ?? {}
    const condMint = (p.mint as string)?.trim()
    const beginSnapshotAt = (p.begin_snapshot_at as string)?.trim()
    const endSnapshotAt = (p.end_snapshot_at as string)?.trim()

    if (!condMint || !beginSnapshotAt) {
      return errorResponse('TIME_WEIGHTED condition must have mint and begin_snapshot_at', req, 400)
    }
    if (endSnapshotAt && beginSnapshotAt > endSnapshotAt) {
      return errorResponse('TIME_WEIGHTED begin_snapshot_at must be <= end_snapshot_at', req, 400)
    }

    let snapQuery = db
      .from('holder_snapshots')
      .select('snapshot_at, holder_wallets')
      .eq('mint', condMint)
      .gte('snapshot_at', beginSnapshotAt)
    if (endSnapshotAt) snapQuery = snapQuery.lte('snapshot_at', endSnapshotAt)
    const { data: snaps } = await snapQuery.order('snapshot_at', { ascending: true })

    if (!snaps?.length) {
      return jsonResponse({ mint, recipients: [], totalAmount: 0 }, req)
    }

    function getAmount(wallet: string | { wallet: string; amount: string }): number {
      if (typeof wallet === 'string') return 1
      return Math.max(0, Number((wallet as { wallet: string; amount: string }).amount) || 0)
    }

    function getWallet(wallet: string | { wallet: string }): string {
      return typeof wallet === 'string' ? wallet : (wallet as { wallet: string }).wallet
    }

    const n = snaps.length
    const intervalDays: number[] = []
    const msPerDay = 24 * 60 * 60 * 1000
    for (let i = 0; i < n; i++) {
      let interval: number
      if (n === 1) {
        interval = 1
      } else if (i === 0) {
        const t0 = new Date(snaps[0]!.snapshot_at as string).getTime()
        const t1 = new Date(snaps[1]!.snapshot_at as string).getTime()
        interval = (t1 - t0) / 2 / msPerDay
      } else if (i === n - 1) {
        const tn1 = new Date(snaps[n - 2]!.snapshot_at as string).getTime()
        const tn = new Date(snaps[n - 1]!.snapshot_at as string).getTime()
        interval = (tn - tn1) / 2 / msPerDay
      } else {
        const tPrev = new Date(snaps[i - 1]!.snapshot_at as string).getTime()
        const tNext = new Date(snaps[i + 1]!.snapshot_at as string).getTime()
        interval = (tNext - tPrev) / 2 / msPerDay
      }
      intervalDays.push(Math.max(0, interval))
    }

    const totalWeightByWallet = new Map<string, number>()
    for (let i = 0; i < snaps.length; i++) {
      const hw = parseHolderWallets(snaps[i]!.holder_wallets)
      const interval = intervalDays[i] ?? 0
      for (const entry of hw) {
        const w = getWallet(entry)
        const amt = getAmount(entry)
        totalWeightByWallet.set(w, (totalWeightByWallet.get(w) ?? 0) + amt * interval)
      }
    }

    const totalAll = [...totalWeightByWallet.values()].reduce((a, b) => a + b, 0)
    if (totalAll <= 0) {
      return jsonResponse({ mint, recipients: [], totalAmount: 0 }, req)
    }

    const multiplier = 10 ** decimals
    const totalAmountRaw = Math.round(totalAmount * multiplier)

    const recipients: Array<{ address: string; amount: number; amountRaw: number }> = []
    let sumAmountRaw = 0
    for (const [wallet, weight] of totalWeightByWallet) {
      if (weight <= 0) continue
      const share = weight / totalAll
      const amountRaw = Math.round(totalAmountRaw * share)
      recipients.push({ address: wallet, amount: 0, amountRaw })
      sumAmountRaw += amountRaw
    }

    while (sumAmountRaw > totalAmountRaw && recipients.length > 0) {
      const maxIdx = recipients.reduce((best, r, i) =>
        r.amountRaw > (recipients[best]?.amountRaw ?? 0) ? i : best,
        0,
      )
      const r = recipients[maxIdx]!
      if (r.amountRaw <= 0) break
      r.amountRaw -= 1
      sumAmountRaw -= 1
    }

    if (sumAmountRaw < totalAmountRaw && recipients.length > 0) {
      const remainder = totalAmountRaw - sumAmountRaw
      const minIdx = recipients.reduce((best, r, i) =>
        r.amountRaw < (recipients[best]?.amountRaw ?? Infinity) ? i : best,
        0,
      )
      const r = recipients[minIdx]!
      r.amountRaw += remainder
      sumAmountRaw += remainder
    }

    function roundToDecimals(value: number, d: number): number {
      const factor = 10 ** d
      return Math.round(value * factor) / factor
    }

    const finalRecipients = recipients.map((r) => {
      const amount = roundToDecimals(r.amountRaw / multiplier, decimals)
      return { address: r.address, amount }
    })
    const finalTotal = roundToDecimals(sumAmountRaw / multiplier, decimals)
    return jsonResponse({ mint, recipients: finalRecipients, totalAmount: finalTotal }, req)
  }

  return errorResponse('Unknown action', req, 400)
})
