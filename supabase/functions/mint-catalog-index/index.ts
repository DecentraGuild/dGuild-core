/**
 * Mint catalog index worker — collection members + trait rollup (pg_cron) and Ops refresh entry.
 *
 * pg_cron: mint-catalog-index every 3 min with { mode: "tick" } (service role).
 * Ops: { mode: "ops-refresh", limit?, offset? } (platform admin JWT).
 */

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabase-admin.ts'
import { isServiceRoleAuthorization, requirePlatformAdmin } from '../_shared/auth.ts'
import { getRpcUrl } from '../_shared/rpc-url.ts'
import { runCollectionIndexTick, runOpsMetadataRefreshChunk } from '../_shared/mint-catalog-index-worker.ts'

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  const db = getAdminClient()
  const rpcUrl = getRpcUrl()
  const nowIso = new Date().toISOString()

  let mode: string | null = null
  let limit = 200
  let offset = 0
  try {
    const body = await req.json() as Record<string, unknown>
    mode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : null
    if (typeof body.limit === 'number' && Number.isFinite(body.limit)) limit = body.limit
    if (typeof body.offset === 'number' && Number.isFinite(body.offset)) offset = body.offset
  } catch {
    /* empty body */
  }

  if (mode === 'tick' || mode === '' || mode === null) {
    if (mode === 'tick' && !isServiceRoleAuthorization(req)) {
      return errorResponse('Unauthorized', req, 401)
    }
    if (mode === null && !isServiceRoleAuthorization(req)) {
      return errorResponse('Unauthorized', req, 401)
    }
    const tick = await runCollectionIndexTick(db, rpcUrl, nowIso)
    return jsonResponse(
      {
        mode: 'tick',
        collectionsProcessed: tick.collectionsProcessed,
        pagesProcessed: tick.pagesProcessed,
        completedCollections: tick.completedCollections,
      },
      req,
    )
  }

  if (mode === 'ops-refresh') {
    const check = await requirePlatformAdmin(req.headers.get('Authorization'), req)
    if (!check.ok) return check.response

    limit = Math.min(Math.max(1, limit), 500)
    offset = Math.max(0, offset)
    const chunk = await runOpsMetadataRefreshChunk(db, rpcUrl, offset, limit, nowIso)
    const hasMore = chunk.nextOffset != null
    return jsonResponse(
      {
        refreshed: chunk.refreshed,
        total: chunk.total,
        trackedTotal: chunk.trackedTotal,
        offset: chunk.offset,
        nextOffset: chunk.nextOffset,
        enqueuedCollections: chunk.enqueuedCollections,
        message: hasMore
          ? `Refreshed ${chunk.refreshed} of ${chunk.total} mints (${chunk.trackedTotal} in scope). Enqueued ${chunk.enqueuedCollections} collection index runs. Call with offset=${chunk.nextOffset} to continue.`
          : `Refreshed ${chunk.refreshed} of ${chunk.total} mints (${chunk.trackedTotal} in scope). Enqueued ${chunk.enqueuedCollections} collection index runs. Done.`,
      },
      req,
    )
  }

  return errorResponse(`Unknown mode: ${mode ?? '(none)'}`, req, 400)
})
