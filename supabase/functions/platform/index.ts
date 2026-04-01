/**
 * Platform Edge Function — thin action router.
 * Each action is handled in handlers/<domain>.ts.
 */
import '../_shared/catalog-internal-dev.ts'
import { handlePreflight, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'

import { handleTenantsList, handleTenantGet, handleTenantSlugCheck, handleTenantAddAdmin, handleTenantCreate, handleTenantSlugSet, handleTenantModule } from './handlers/tenants.ts'
import { handleBillingSummary, handleBillingExtend, handleBillingSetPeriodEnd, handleBillingSetWatchtowerTracks, handleBillingConfirm } from './handlers/billing.ts'
import { handleGateFetchUnbound, handleGateBind, handleGateUnbind } from './handlers/gates.ts'
import { handleRaffleFetchUnbound, handleRaffleBind, handleRaffleBindTenant, handleRaffleCloseTenant, handleRaffleUnbind } from './handlers/raffles.ts'
import { handleCrafterImportToken, handleCrafterRemoveToken } from './handlers/crafter.ts'
import { handleBundleCreate, handleBundleGet, handleBundleUpdate, handleBundlesList } from './handlers/bundles.ts'
import { handleVoucherPrepareMetadata, handleVoucherRegisterDraft, handleVoucherList, handleVoucherRemoveDraft, handleVoucherCreateBundle, handleVoucherCreateIndividual, handleIndividualVoucherGet, handleBundleVoucherGet, handleIndividualVoucherUpdate, handleBundleVoucherUpdate, handleVoucherDetail, handleVoucherSyncMintMetadata, handleVoucherHolders } from './handlers/vouchers.ts'
import { handleMetersList, handleProductsList, handleProductTierDefaults } from './handlers/meters.ts'
import { handleAuditLog } from './handlers/audit.ts'

type Handler = (body: Record<string, unknown>, db: ReturnType<typeof getAdminClient>, authHeader: string | null, req: Request) => Promise<Response>

const ROUTES = new Map<string, Handler>([
  ['tenants-list', handleTenantsList],
  ['tenant-get', handleTenantGet],
  ['tenant-slug-check', handleTenantSlugCheck],
  ['tenant-add-admin', handleTenantAddAdmin],
  ['tenant-create', handleTenantCreate],
  ['tenant-slug-set', handleTenantSlugSet],
  ['tenant-module', handleTenantModule],
  ['billing-summary', handleBillingSummary],
  ['billing-extend', handleBillingExtend],
  ['billing-set-period-end', handleBillingSetPeriodEnd],
  ['billing-set-watchtower-tracks', handleBillingSetWatchtowerTracks],
  ['billing-confirm', handleBillingConfirm],
  ['gate-fetch-unbound', handleGateFetchUnbound],
  ['whitelist-fetch-unbound', handleGateFetchUnbound],
  ['gate-bind', handleGateBind],
  ['whitelist-bind', handleGateBind],
  ['gate-unbind', handleGateUnbind],
  ['whitelist-unbind', handleGateUnbind],
  ['raffle-fetch-unbound', handleRaffleFetchUnbound],
  ['raffle-bind', handleRaffleBind],
  ['raffle-bind-tenant', handleRaffleBindTenant],
  ['raffle-close-tenant', handleRaffleCloseTenant],
  ['raffle-unbind', handleRaffleUnbind],
  ['crafter-import-token', handleCrafterImportToken],
  ['crafter-remove-token', handleCrafterRemoveToken],
  ['bundle-create', handleBundleCreate],
  ['bundle-get', handleBundleGet],
  ['bundle-update', handleBundleUpdate],
  ['voucher-prepare-metadata', handleVoucherPrepareMetadata],
  ['voucher-register-draft', handleVoucherRegisterDraft],
  ['voucher-list', handleVoucherList],
  ['voucher-remove-draft', handleVoucherRemoveDraft],
  ['voucher-create-bundle', handleVoucherCreateBundle],
  ['voucher-create-individual', handleVoucherCreateIndividual],
  ['individual-voucher-get', handleIndividualVoucherGet],
  ['bundle-voucher-get', handleBundleVoucherGet],
  ['individual-voucher-update', handleIndividualVoucherUpdate],
  ['bundle-voucher-update', handleBundleVoucherUpdate],
  ['bundles-list', handleBundlesList],
  ['meters-list', handleMetersList],
  ['products-list', handleProductsList],
  ['product-tier-defaults', handleProductTierDefaults],
  ['voucher-detail', handleVoucherDetail],
  ['voucher-sync-mint-metadata', handleVoucherSyncMintMetadata],
  ['voucher-holders', handleVoucherHolders],
  ['audit-log', handleAuditLog],
])

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
  const handler = ROUTES.get(action)
  if (!handler) return errorResponse(`Unknown action: ${action}`, req, 400)

  const db = getAdminClient()
  return handler(body, db, authHeader, req)
})
