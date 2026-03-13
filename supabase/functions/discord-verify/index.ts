/**
 * Discord Verify Edge Function.
 * Handles Discord wallet linking verification flow.
 *
 * Actions:
 *   session-create  – (bot) Create a verify session token for a Discord user.
 *   session-status  – (public) Get verify token status.
 *   link            – (authenticated) Complete wallet link with verify token.
 *   link-additional – (authenticated) Link additional wallet to existing Discord user.
 *   revoke          – (authenticated) Revoke wallet–Discord link.
 *   me              – (authenticated) Get current Discord link and linked wallets.
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { getWalletFromAuthHeader } from '../_shared/auth.ts'

function isBotAuthorized(req: Request): boolean {
  const botSecret = Deno.env.get('DISCORD_BOT_SECRET') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const header = req.headers.get('x-bot-secret') ?? req.headers.get('authorization') ?? ''
  return header === botSecret || header === `Bearer ${botSecret}` || header === `Bearer ${serviceKey}`
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
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

  // ---------------------------------------------------------------------------
  // session-create – create a verify session (bot-only)
  // ---------------------------------------------------------------------------
  if (action === 'session-create') {
    if (!isBotAuthorized(req)) return errorResponse('Unauthorized', req, 401)

    const discordUserId = body.discordUserId as string
    const discordGuildId = body.discordGuildId as string
    if (!discordUserId || !discordGuildId) return errorResponse('discordUserId and discordGuildId required', req)

    const { data: server } = await db
      .from('discord_servers')
      .select('tenant_id')
      .eq('discord_guild_id', discordGuildId)
      .maybeSingle()
    if (!server) {
      return errorResponse('This server is not connected to a community. Ask an admin to connect it first.', req, 404, 'GUILD_NOT_LINKED')
    }

    const { data: tenant } = await db
      .from('tenant_config')
      .select('slug')
      .eq('id', server.tenant_id)
      .maybeSingle()
    const tenantSlug = (tenant?.slug ?? server.tenant_id) as string

    const token = generateToken()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    const { error } = await db.from('discord_verify_sessions').insert({
      token,
      discord_user_id: discordUserId,
      discord_guild_id: discordGuildId,
      expires_at: expiresAt.toISOString(),
    })
    if (error) return errorResponse(error.message, req, 500)

    return jsonResponse(
      { tenant_slug: tenantSlug, verify_token: token, expires_at: expiresAt.toISOString() },
      req,
    )
  }

  // ---------------------------------------------------------------------------
  // session-status – check if a verify token is valid (public)
  // ---------------------------------------------------------------------------
  if (action === 'session-status') {
    const token = body.token as string
    if (!token) return errorResponse('token required', req)

    const { data: session } = await db
      .from('discord_verify_sessions')
      .select('token, discord_user_id, discord_guild_id, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (!session) return jsonResponse({ valid: false, reason: 'not_found' }, req)
    if (new Date(session.expires_at as string) < new Date()) {
      return jsonResponse({ valid: false, reason: 'expired' }, req)
    }
    return jsonResponse({
      valid: true,
      discordUserId: session.discord_user_id,
      discordGuildId: session.discord_guild_id,
    }, req)
  }

  // ---------------------------------------------------------------------------
  // link – complete wallet link with a verify token (must be authenticated)
  // ---------------------------------------------------------------------------
  if (action === 'link') {
    const wallet = await getWalletFromAuthHeader(authHeader)
    if (!wallet) return errorResponse('Unauthenticated', req, 401)

    const token = body.token as string
    if (!token) return errorResponse('token required', req)

    const { data: session } = await db
      .from('discord_verify_sessions')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (!session) return errorResponse('Invalid or expired verify token', req, 404)
    if (new Date(session.expires_at as string) < new Date()) {
      return errorResponse('Verify token has expired', req, 410)
    }

    // Delete session (one-time use)
    await db.from('discord_verify_sessions').delete().eq('token', token)

    const discordUserId = session.discord_user_id as string

    // Check wallet is not already linked to a different Discord user
    const { data: existing } = await db
      .from('wallet_discord_links')
      .select('discord_user_id')
      .eq('wallet_address', wallet)
      .maybeSingle()

    if (existing && (existing.discord_user_id as string) !== discordUserId) {
      return errorResponse('Wallet is already linked to a different Discord account', req, 409)
    }

    await db.from('wallet_discord_links').upsert({
      wallet_address: wallet,
      discord_user_id: discordUserId,
      linked_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address' })

    await db.from('discord_audit_log').insert({
      discord_guild_id: session.discord_guild_id,
      action: 'wallet_linked',
      details: { wallet, discordUserId },
    })

    return jsonResponse({ ok: true, discordUserId }, req)
  }

  // ---------------------------------------------------------------------------
  // link-additional – link another wallet to the same Discord user (authenticated)
  // ---------------------------------------------------------------------------
  if (action === 'link-additional') {
    const wallet = await getWalletFromAuthHeader(authHeader)
    if (!wallet) return errorResponse('Unauthenticated', req, 401)

    const discordUserId = body.discordUserId as string
    if (!discordUserId) return errorResponse('discordUserId required', req)

    // Check wallet is not already linked elsewhere
    const { data: existing } = await db
      .from('wallet_discord_links')
      .select('discord_user_id')
      .eq('wallet_address', wallet)
      .maybeSingle()

    if (existing && (existing.discord_user_id as string) !== discordUserId) {
      return errorResponse('Wallet is already linked to a different Discord account', req, 409)
    }

    await db.from('wallet_discord_links').upsert({
      wallet_address: wallet,
      discord_user_id: discordUserId,
      linked_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address' })

    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // revoke – revoke wallet–Discord link (authenticated)
  // Allows revoking any wallet linked to the same Discord account as the caller.
  // ---------------------------------------------------------------------------
  if (action === 'revoke') {
    const wallet = await getWalletFromAuthHeader(authHeader)
    if (!wallet) return errorResponse('Unauthenticated', req, 401)

    const targetWallet = (body.wallet as string) ?? wallet

    if (targetWallet !== wallet) {
      // Allow revoking other wallets only if they belong to the same Discord account.
      const { data: myLink } = await db
        .from('wallet_discord_links')
        .select('discord_user_id')
        .eq('wallet_address', wallet)
        .maybeSingle()
      const { data: targetLink } = await db
        .from('wallet_discord_links')
        .select('discord_user_id')
        .eq('wallet_address', targetWallet)
        .maybeSingle()
      if (
        !myLink ||
        !targetLink ||
        (myLink.discord_user_id as string) !== (targetLink.discord_user_id as string)
      ) {
        return errorResponse('Cannot revoke a wallet from a different Discord account', req, 403)
      }
    }

    await db.from('wallet_discord_links').delete().eq('wallet_address', targetWallet)
    return jsonResponse({ ok: true }, req)
  }

  // ---------------------------------------------------------------------------
  // me – get current user's Discord link (authenticated)
  // ---------------------------------------------------------------------------
  if (action === 'me') {
    const wallet = await getWalletFromAuthHeader(authHeader)
    if (!wallet) return errorResponse('Unauthenticated', req, 401)

    const { data: link } = await db
      .from('wallet_discord_links')
      .select('discord_user_id, linked_at')
      .eq('wallet_address', wallet)
      .maybeSingle()

    if (!link) return jsonResponse({ linked: false }, req)

    const { data: allWallets } = await db
      .from('wallet_discord_links')
      .select('wallet_address, linked_at')
      .eq('discord_user_id', link.discord_user_id as string)

    return jsonResponse({
      linked: true,
      discordUserId: link.discord_user_id,
      linkedAt: link.linked_at,
      linkedWallets: (allWallets ?? []).map((w) => ({
        wallet: w.wallet_address,
        linkedAt: w.linked_at,
      })),
    }, req)
  }

  return errorResponse(`Unknown action: ${action}`, req, 400)
})
