/**
 * Discord Server Edge Function.
 * Manages tenant–guild linking and Discord server operations.
 *
 * Actions:
 *   link      – Link a Discord server to the tenant (admin).
 *   unlink    – Unlink the Discord server (admin).
 *   get       – Get the linked Discord server for a tenant (admin).
 *   invite-url – Get the bot invite URL for a tenant (admin).
 *   role-cards – Get public role cards with requirements (public).
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { requireTenantAdmin } from '../_shared/auth.ts'

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
  const tenantId = body.tenantId as string
  const db = getAdminClient()

  // ---------------------------------------------------------------------------
  // link – link Discord server (admin)
  // ---------------------------------------------------------------------------
  if (action === 'link') {
    const authCheck = await requireTenantAdmin(authHeader, tenantId, db)
    if (!authCheck.ok) return authCheck.response

    const guildId = body.guildId as string
    const guildName = body.guildName as string
    if (!guildId) return errorResponse('guildId required', req)

    const { error } = await db.from('discord_servers').upsert({
      tenant_id: tenantId,
      discord_guild_id: guildId,
      guild_name: guildName ?? null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' })

    if (error) return errorResponse(error.message, req, 500)

    const { data: tenant } = await db.from('tenant_config').select('modules').eq('id', tenantId).maybeSingle()
    const prevMods = (tenant?.modules as Record<string, unknown>) ?? {}
    const prev = (prevMods.discord as Record<string, unknown>) ?? {}
    const modules = {
      ...prevMods,
      discord: {
        state: 'active',
        deactivatedate: null,
        deactivatingUntil: null,
        settingsjson: prev.settingsjson ?? {},
      },
    }
    await db.from('tenant_config').update({ modules, updated_at: new Date().toISOString() }).eq('id', tenantId)

    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // unlink – unlink Discord server (admin)
  // ---------------------------------------------------------------------------
  if (action === 'unlink') {
    const authCheck = await requireTenantAdmin(authHeader, tenantId, db)
    if (!authCheck.ok) return authCheck.response

    await db.from('discord_servers').delete().eq('tenant_id', tenantId)
    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // get – get linked server (admin)
  // ---------------------------------------------------------------------------
  if (action === 'get') {
    const authCheck = await requireTenantAdmin(authHeader, tenantId, db)
    if (!authCheck.ok) return authCheck.response

    const { data: srv } = await db
      .from('discord_servers')
      .select('discord_guild_id, guild_name, connected_at, bot_invite_state, bot_role_position')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    return jsonResponse({ server: srv ?? null }, req)
  }

  // ---------------------------------------------------------------------------
  // invite-url – get bot invite URL (admin)
  // ---------------------------------------------------------------------------
  if (action === 'invite-url') {
    const authCheck = await requireTenantAdmin(authHeader, tenantId, db)
    if (!authCheck.ok) return authCheck.response

    const clientId = Deno.env.get('DISCORD_CLIENT_ID') ?? ''
    if (!clientId) return errorResponse('DISCORD_CLIENT_ID not configured', req, 500)

    const permissions = '2415919104' // Manage Roles + application commands
    const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot&permissions=${permissions}`
    return jsonResponse({ url }, req)
  }

  // ---------------------------------------------------------------------------
  // role-cards – public role cards with requirements
  // ---------------------------------------------------------------------------
  if (action === 'role-cards') {
    if (!tenantId) return errorResponse('tenantId required', req)

    const { data: srv } = await db
      .from('discord_servers')
      .select('discord_guild_id')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!srv) return jsonResponse({ cards: [] }, req)
    const guildId = srv.discord_guild_id as string

    const [rulesResult, guildRolesResult, catalogResult, whitelistResult] = await Promise.all([
      db
        .from('discord_role_rules')
        .select('id, discord_role_id, operator, condition_set_id')
        .eq('discord_guild_id', guildId)
        .not('condition_set_id', 'is', null),
      db
        .from('discord_guild_roles')
        .select('role_id, name, position, color, icon, unicode_emoji')
        .eq('discord_guild_id', guildId),
      db
        .from('tenant_mint_catalog')
        .select('mint, label, kind')
        .eq('tenant_id', tenantId),
      db
        .from('gate_lists')
        .select('address, name')
        .eq('tenant_id', tenantId),
    ])

    const rules = rulesResult.data ?? []
    const setIds = [...new Set(rules.map((r) => r.condition_set_id).filter(Boolean))]
    const { data: conditionsData } =
      setIds.length > 0
        ? await db
            .from('condition_set_conditions')
            .select('condition_set_id, type, payload, logic_to_next')
            .in('condition_set_id', setIds)
        : { data: [] }
    const conditionsBySetId = (conditionsData ?? []).reduce(
      (acc, c) => {
        const sid = c.condition_set_id as number
        if (!acc[sid]) acc[sid] = []
        acc[sid].push(c)
        return acc
      },
      {} as Record<number, Array<{ type: string; payload: Record<string, unknown>; logic_to_next: string | null }>>,
    )
    const guildRoles = guildRolesResult.data ?? []
    const catalogRows = catalogResult.data ?? []
    const catalog = new Map(catalogRows.map((r) => [r.mint as string, r.label as string]))
    const catalogKind = new Map(catalogRows.map((r) => [r.mint as string, (r.kind as 'SPL' | 'NFT') ?? 'NFT']))
    const whitelistMap = new Map((whitelistResult.data ?? []).map((r) => [r.address as string, r.name as string]))
    const roleMap = new Map(guildRoles.map((r) => [r.role_id, r]))

    const catalogMints = catalogRows.map((r) => r.mint as string).filter(Boolean)
    const { data: metadataRows } =
      catalogMints.length > 0
        ? await db.from('mint_metadata').select('mint, decimals').in('mint', catalogMints)
        : { data: [] }
    const decimalsByMint = new Map((metadataRows ?? []).map((r) => [r.mint as string, r.decimals as number | null]))

    function formatAmount(rawAmount: number, mint: string): string {
      const kind = catalogKind.get(mint) ?? 'NFT'
      const decimals = kind === 'NFT' ? 0 : (decimalsByMint.get(mint) ?? null)
      if (rawAmount === 0) return '0'
      if (decimals === 0) return String(Math.floor(rawAmount))
      if (decimals == null || !Number.isFinite(decimals)) return String(rawAmount)
      const padded = String(rawAmount).padStart(decimals + 1, '0')
      const intPart = padded.slice(0, -decimals) || '0'
      const decPart = padded.slice(-decimals)
      const human = parseFloat(`${intPart}.${decPart}`) || 0
      const fixed = human.toFixed(Math.min(6, decimals))
      return fixed.replace(/\.?0+$/, '') || '0'
    }

    function conditionToRequirementText(c: {
      type: string
      payload: Record<string, unknown>
      logic_to_next: string | null
    }): string {
      if (c.type === 'DISCORD') {
        const roleId = c.payload.required_role_id as string
        const role = roleMap.get(roleId)
        const name = role?.name ?? roleId ?? '(no role)'
        return `Discord role: ${name}`
      }
      if (c.type === 'WHITELIST') {
        const addr = c.payload.list_address as string
        const name = whitelistMap.get(addr) ?? addr ?? '(no list)'
        return `Memberlist: ${name}`
      }
      const mint = (c.payload.mint ?? c.payload.collection_or_mint ?? '') as string
      const label = catalog.get(mint) ?? mint
      const rawAmount = (c.payload.amount as number) ?? 1
      const amountStr = formatAmount(rawAmount, mint)
      if (c.type === 'SNAPSHOTS') {
        const days = (c.payload.days as number) ?? 1
        return `Holding ${amountStr} ${label} for ${days} day${days === 1 ? '' : 's'}`
      }
      if (c.type === 'TRAIT') {
        const tk = (c.payload.trait_key as string) ?? ''
        const tv = (c.payload.trait_value as string) ?? ''
        return `Holding ${amountStr} ${label} with a ${tk || '?'} of ${tv || '?'}`
      }
      if (c.type === 'TIME_WEIGHTED') {
        const minPct = typeof c.payload.min_percent === 'number' && c.payload.min_percent >= 0
          ? Math.min(100, Math.floor(c.payload.min_percent))
          : 0
        const beginAt = String(c.payload.begin_snapshot_at ?? '').trim()
        const endAt = String(c.payload.end_snapshot_at ?? '').trim()
        const formatDate = (s: string) => {
          if (!s) return '?'
          try {
            const d = new Date(s)
            if (Number.isNaN(d.getTime())) return s.slice(0, 10)
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
          } catch {
            return s.slice(0, 10)
          }
        }
        const supplyLabel = label || '?'
        return `Holding at least ${minPct}% of the total supply of ${supplyLabel} during the period of ${formatDate(beginAt)} and ${formatDate(endAt)}`
      }
      return `Holding ${amountStr} ${label}`
    }

    const cards = rules.map((rule) => {
      const conditions = conditionsBySetId[rule.condition_set_id as number] ?? []
      const requirements: Array<{ type: 'text'; text: string } | { type: 'separator'; label: 'OR' | 'and' }> = []
      for (let i = 0; i < conditions.length; i++) {
        const c = conditions[i]!
        const nextLogic = i < conditions.length - 1 ? c.logic_to_next : null
        requirements.push({ type: 'text', text: conditionToRequirementText(c) })
        if (nextLogic === 'OR') {
          requirements.push({ type: 'separator', label: 'OR' })
        }
      }

      const role = roleMap.get(rule.discord_role_id as string) as { role_id: string; name: string; position?: number; color?: number; icon?: string; unicode_emoji?: string } | undefined
      const card: Record<string, unknown> = {
        role_id: rule.discord_role_id,
        name: role?.name ?? (rule.discord_role_id as string),
        position: role?.position ?? 0,
        color: role?.color,
        icon: role?.icon,
        unicode_emoji: role?.unicode_emoji,
        requirements,
      }
      if (body.includeAdminFields === true) {
        card.rule_id = rule.id
        card.condition_set_id = rule.condition_set_id
      }
      return card
    })

    return jsonResponse({ cards }, req)
  }

  return errorResponse(`Unknown action: ${action}`, req, 400)
})
