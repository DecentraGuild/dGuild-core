/**
 * Member Profile Edge Function.
 * Handles member profile CRUD and admin profile-field configuration.
 *
 * Actions:
 *   profiles                  – All profiles for a tenant (public, for nickname resolver).
 *   admin-get                 – Full profile for a wallet (tenant admin only).
 *   me                        – Own profile + eligibility (auth required).
 *   upsert-me                 – Create or update own profile (auth + on primary list).
 *   admin-update-profile-fields – Update which fields are enabled (admin).
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader, normalizeWallet, requireTenantAdmin } from '../_shared/auth.ts'
import { getSolanaConnection } from '../_shared/solana-connection.ts'
import { fetchGateEntries } from '../_shared/gates.ts'

function generateMemberId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
}

function isValidUrl(url: string): boolean {
  return /^https?:\/\/.+/.test(url)
}

async function getPrimaryListAddress(
  db: ReturnType<typeof getAdminClient>,
  tenantId: string,
): Promise<{ address: string; name: string } | null> {
  const { data } = await db
    .from('gate_lists')
    .select('address, name')
    .eq('tenant_id', tenantId)
    .eq('is_primary', true)
    .maybeSingle()
  if (!data) return null
  return { address: data.address as string, name: data.name as string }
}

async function isWalletEligible(
  primaryListAddress: string,
  wallet: string,
): Promise<boolean> {
  const connection = getSolanaConnection()
  const entries = await fetchGateEntries(connection, primaryListAddress)
  const w = normalizeWallet(wallet)
  return entries.some((e) => normalizeWallet(e.wallet) === w)
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
  const tenantId = body.tenantId as string
  if (!tenantId) return errorResponse('tenantId required', req)

  const db = getAdminClient()

  if (action === 'profiles') {
    const { data, error } = await db
      .from('tenant_member_profiles')
      .select('wallet_address, member_id, nickname')
      .eq('tenant_id', tenantId)

    if (error) return errorResponse(error.message, req, 500)
    return jsonResponse({ profiles: data ?? [] }, req)
  }

  if (action === 'admin-get') {
    const wallet = normalizeWallet(body.wallet as string)
    if (!wallet) return errorResponse('wallet required', req)

    const check = await requireTenantAdmin(authHeader, tenantId, db, req)
    if (!check.ok) return check.response

    const { data: profile } = await db
      .from('tenant_member_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('wallet_address', wallet)
      .maybeSingle()

    if (!profile) return jsonResponse({ profile: null }, req)

    const { data: discordLink } = await db
      .from('wallet_discord_links')
      .select('discord_user_id')
      .eq('wallet_address', wallet)
      .maybeSingle()

    return jsonResponse({
      profile: {
        ...profile,
        discord_user_id: discordLink?.discord_user_id ?? null,
      },
    }, req)
  }

  if (action === 'me') {
    const primaryList = await getPrimaryListAddress(db, tenantId)
    const primaryPayload = primaryList
      ? {
        address: primaryList.address,
        name: typeof primaryList.name === 'string' && primaryList.name.trim()
          ? primaryList.name.trim()
          : null,
      }
      : null

    const wallet = await getWalletFromAuthHeader(authHeader)
    if (!wallet) {
      return jsonResponse({
        profile: null,
        eligible: false,
        primaryList: primaryPayload,
        authenticated: false,
      }, req)
    }

    if (!primaryList) {
      return jsonResponse({
        profile: null,
        eligible: false,
        primaryList: null,
        authenticated: true,
      }, req)
    }

    const eligible = await isWalletEligible(primaryList.address, wallet)

    const { data: profile } = await db
      .from('tenant_member_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('wallet_address', wallet)
      .maybeSingle()

    const { data: discordLink } = await db
      .from('wallet_discord_links')
      .select('discord_user_id')
      .eq('wallet_address', wallet)
      .maybeSingle()

    return jsonResponse({
      profile: profile
        ? { ...profile, discord_user_id: discordLink?.discord_user_id ?? null }
        : null,
      eligible,
      primaryList: primaryPayload,
      authenticated: true,
    }, req)
  }

  if (action === 'upsert-me') {
    const wallet = await getWalletFromAuthHeader(authHeader)
    if (!wallet) return errorResponse('Unauthenticated', req, 401)

    const primaryList = await getPrimaryListAddress(db, tenantId)
    if (!primaryList) return errorResponse('No primary list configured', req, 400)

    const eligible = await isWalletEligible(primaryList.address, wallet)
    if (!eligible) return errorResponse('Not on the primary member list', req, 403)

    const fields = body.fields as Record<string, unknown> | undefined
    if (!fields) return errorResponse('fields required', req)

    const nickname = typeof fields.nickname === 'string'
      ? fields.nickname.trim().slice(0, 32) || null
      : undefined
    const description = typeof fields.description === 'string'
      ? fields.description.trim().slice(0, 500) || null
      : undefined
    const avatarUrl = typeof fields.avatar_url === 'string'
      ? (fields.avatar_url.trim() === '' ? null : fields.avatar_url.trim())
      : undefined
    if (avatarUrl && !isValidUrl(avatarUrl)) {
      return errorResponse('avatar_url must be a valid http(s) URL', req)
    }
    const xHandle = typeof fields.x_handle === 'string'
      ? fields.x_handle.trim() || null
      : undefined
    const telegramHandle = typeof fields.telegram_handle === 'string'
      ? fields.telegram_handle.trim() || null
      : undefined
    const email = typeof fields.email === 'string'
      ? fields.email.trim() || null
      : undefined
    const phone = typeof fields.phone === 'string'
      ? fields.phone.trim() || null
      : undefined
    const linkedWallets = Array.isArray(fields.linked_wallets)
      ? (fields.linked_wallets as string[]).filter(
          (w) => typeof w === 'string' && w.trim().length >= 32 && w.trim().length <= 44
        ).map((w) => w.trim())
      : undefined

    const { data: existing } = await db
      .from('tenant_member_profiles')
      .select('member_id')
      .eq('tenant_id', tenantId)
      .eq('wallet_address', wallet)
      .maybeSingle()

    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (nickname !== undefined) updatePayload.nickname = nickname
    if (description !== undefined) updatePayload.description = description
    if (avatarUrl !== undefined) updatePayload.avatar_url = avatarUrl
    if (xHandle !== undefined) updatePayload.x_handle = xHandle
    if (telegramHandle !== undefined) updatePayload.telegram_handle = telegramHandle
    if (email !== undefined) updatePayload.email = email
    if (phone !== undefined) updatePayload.phone = phone
    if (linkedWallets !== undefined) updatePayload.linked_wallets = linkedWallets

    if (existing) {
      const { error } = await db
        .from('tenant_member_profiles')
        .update(updatePayload)
        .eq('tenant_id', tenantId)
        .eq('wallet_address', wallet)
      if (error) return errorResponse(error.message, req, 500)
    } else {
      const memberId = generateMemberId()
      const { error } = await db
        .from('tenant_member_profiles')
        .insert({
          tenant_id: tenantId,
          wallet_address: wallet,
          member_id: memberId,
          ...updatePayload,
        })
      if (error) return errorResponse(error.message, req, 500)
    }

    const { data: profile } = await db
      .from('tenant_member_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('wallet_address', wallet)
      .maybeSingle()

    return jsonResponse({ profile }, req)
  }

  if (action === 'admin-update-profile-fields') {
    const check = await requireTenantAdmin(authHeader, tenantId, db, req)
    if (!check.ok) return check.response

    const profileFields = body.profileFields as Record<string, boolean> | undefined
    if (!profileFields || typeof profileFields !== 'object') {
      return errorResponse('profileFields required', req)
    }

    const { error } = await db
      .from('tenant_config')
      .update({ profile_fields: profileFields })
      .eq('id', tenantId)
    if (error) return errorResponse(error.message, req, 500)

    return jsonResponse({ ok: true, profileFields }, req)
  }

  return errorResponse(`Unknown action: ${action}`, req, 400)
})
