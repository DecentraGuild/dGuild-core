/**
 * Side effects after billing_payments is confirmed (slug is handled inside packages/billing confirm()).
 * Idempotent: safe if called multiple times (reconcile + client).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { verifyBillingPayment } from './billing-verify.ts'

export async function registerTenantFromPaymentIfNeeded(
  db: SupabaseClient,
  paymentId: string,
): Promise<boolean> {
  const { data: pay, error: payErr } = await db
    .from('billing_payments')
    .select('tenant_id, payer_wallet, status, onboarding_org')
    .eq('id', paymentId)
    .maybeSingle()

  if (payErr || !pay) return false
  const row = pay as {
    tenant_id: string
    payer_wallet: string
    status: string
    onboarding_org: Record<string, unknown> | null
  }
  if (row.status !== 'confirmed') return false
  const org = row.onboarding_org
  if (!org || typeof org !== 'object') return false

  const { data: exists } = await db.from('tenant_config').select('id').eq('id', row.tenant_id).maybeSingle()
  if (exists) return false

  const name = typeof org.name === 'string' ? org.name.trim() : ''
  const description = typeof org.description === 'string' ? org.description.trim() : ''
  if (!name || !description) return false
  const logo = typeof org.logo === 'string' ? org.logo.trim() : ''
  const discordInviteLink = typeof org.discordInviteLink === 'string' ? org.discordInviteLink.trim() : ''

  const nowIso = new Date().toISOString()
  const branding = logo ? { logo } : {}
  const wallet = (row.payer_wallet ?? '').trim()
  if (!wallet) return false

  const { error: insertErr } = await db.from('tenant_config').insert({
    id: row.tenant_id,
    slug: null,
    name,
    description,
    discord_server_invite_link: discordInviteLink || null,
    branding,
    modules: { admin: { state: 'active', deactivatedate: null, deactivatingUntil: null, settingsjson: {} } },
    admins: [wallet],
    updated_at: nowIso,
  })

  if (insertErr) return false

  await db.from('billing_payments').update({ onboarding_org: null }).eq('id', paymentId)
  return true
}

export async function finalizeCrafterTokensForMemo(
  db: SupabaseClient,
  params: { tenantId: string; memo: string; txSignature: string },
): Promise<void> {
  const { tenantId, memo, txSignature } = params
  const now = new Date()
  const nowIso = now.toISOString()

  const { data: pay } = await db
    .from('billing_payments')
    .select('id, amount_usdc, payer_wallet, status')
    .eq('tenant_id', tenantId)
    .eq('memo', memo)
    .maybeSingle()

  const p = pay as { id: string; amount_usdc: number; status: string; payer_wallet: string } | null
  if (!p || p.status !== 'confirmed') return

  const amountUsdc = typeof p.amount_usdc === 'number' ? p.amount_usdc : Number(p.amount_usdc)
  const ver = await verifyBillingPayment({
    txSignature,
    expectedAmountUsdc: amountUsdc,
    expectedMemo: memo,
    expectedPayerWallet: p.payer_wallet,
  })
  if (!ver.valid) return

  const { data: pendingRows } = await db
    .from('crafter_pending')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('memo', memo)
    .limit(20)

  const rows = (pendingRows ?? []) as Array<{
    mint: string
    memo: string
    metadata_json: Record<string, unknown>
    authority: string
    expires_at: string
  }>

  for (const pending of rows) {
    if (new Date(pending.expires_at) < now) continue
    const mint = pending.mint

    const { data: existingTok } = await db.from('crafter_tokens').select('id').eq('mint', mint).maybeSingle()
    if (existingTok) {
      await db.from('crafter_pending').delete().eq('mint', mint).eq('memo', memo)
      continue
    }

    const meta = pending.metadata_json ?? {}
    const name = (meta.name as string) ?? ''
    const symbol = (meta.symbol as string) ?? ''
    const decimals = (meta.decimals as number) ?? 6
    const authority = pending.authority

    const { error: tokenErr } = await db.from('crafter_tokens').insert({
      tenant_id: tenantId,
      mint,
      billing_payment_id: p.id,
      name,
      symbol,
      decimals,
      description: null,
      image_url: null,
      metadata_uri: '',
      storage_backend: 'api',
      authority,
    })

    if (tokenErr) continue

    await db.from('mint_metadata').upsert(
      {
        mint,
        name,
        symbol,
        image: null,
        decimals,
        updated_at: nowIso,
      },
      { onConflict: 'mint' },
    )

    await db.from('tenant_mint_catalog').upsert(
      {
        tenant_id: tenantId,
        mint,
        kind: 'SPL',
        label: name || symbol,
        updated_at: nowIso,
      },
      { onConflict: 'tenant_id,mint' },
    )

    await db.from('crafter_pending').delete().eq('mint', mint).eq('memo', memo)
  }
}

export async function runBillingPostConfirm(
  db: SupabaseClient,
  paymentId: string,
  txSignature: string,
): Promise<void> {
  await registerTenantFromPaymentIfNeeded(db, paymentId)
  const { data: pr } = await db.from('billing_payments').select('tenant_id, memo').eq('id', paymentId).maybeSingle()
  const row = pr as { tenant_id: string; memo: string } | null
  if (!row) return
  await finalizeCrafterTokensForMemo(db, {
    tenantId: row.tenant_id,
    memo: row.memo,
    txSignature,
  })
}
