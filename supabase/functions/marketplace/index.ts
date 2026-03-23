/**
 * Marketplace Edge Function — thin action router.
 * Each action is handled in handlers/<domain>.ts.
 */
import { handlePreflight, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'

import { handleMetadata, handleMetadataRefresh, handleMetadataSeedFromConfigs, handleMetadataRefreshAll } from './handlers/metadata.ts'
import { handleResolve, handleResolveFull } from './handlers/resolve.ts'
import { handleEscrows, handleEscrow } from './handlers/escrows.ts'
import { handleScopeSync, handleScopeExpand } from './handlers/scope.ts'
import { handleCollectionPreview, handleSplPreview } from './handlers/preview.ts'
import { handleCatalogAdd, handleCatalogRefreshTraits } from './handlers/catalog.ts'

type Handler = (body: Record<string, unknown>, db: ReturnType<typeof getAdminClient>, authHeader: string | null, req: Request) => Promise<Response>

const ROUTES = new Map<string, Handler>([
  ['metadata', handleMetadata],
  ['metadata-refresh', handleMetadataRefresh],
  ['metadata-seed-from-configs', handleMetadataSeedFromConfigs],
  ['metadata-refresh-all', handleMetadataRefreshAll],
  ['resolve', handleResolve],
  ['resolve-full', handleResolveFull],
  ['escrows', handleEscrows],
  ['escrow', handleEscrow],
  ['scope-sync', handleScopeSync],
  ['scope-expand', handleScopeExpand],
  ['collection-preview', handleCollectionPreview],
  ['spl-preview', handleSplPreview],
  ['catalog-add', handleCatalogAdd],
  ['catalog-refresh-traits', handleCatalogRefreshTraits],
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
