import type { FastifyInstance } from 'fastify'
import { requireTenantAdmin } from './tenant-settings.js'
import { apiError, ErrorCode } from '../api-errors.js'
import { adminWriteRateLimit } from '../rate-limit-strict.js'
import { getPool } from '../db/client.js'
import { isValidTenantId } from '../validate-slug.js'
import { getTenantById } from '../db/tenant.js'
import {
  listAddressBook,
  addAddressBookEntry,
  updateAddressBookTier,
  removeAddressBookEntry,
  type TrackerMintKind,
  type TrackerTier,
} from '../db/tracker-address-book.js'
import { buildCollectionPreview } from '../discord/collection-preview.js'

const VALID_KINDS = new Set<string>(['SPL', 'NFT'])
const ALLOWED_TIERS = new Set<string>(['base', 'grow'])

function isValidMintAddress(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 32 && v.length <= 64
}

export async function registerTrackerRoutes(app: FastifyInstance) {
  app.get<{ Params: { tenantId: string } }>(
    '/api/v1/tenant/:tenantId/tracker/address-book',
    async (request, reply) => {
      const tenantId = request.params.tenantId?.trim()
      if (!tenantId || !isValidTenantId(tenantId)) {
        return reply.status(400).send(apiError('Invalid tenant id', ErrorCode.BAD_REQUEST))
      }
      const tenant = await getTenantById(tenantId)
      if (!tenant) {
        return reply.status(404).send(apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND))
      }
      if (!getPool()) {
        return { entries: [] }
      }
      const rows = await listAddressBook(tenant.id)
      return {
        entries: rows.map((r) => ({
          id: r.id,
          mint: r.mint,
          kind: r.kind,
          tier: r.tier,
          label: r.label,
          image: r.image,
          name: r.name,
          trait_keys: r.trait_index?.trait_keys ?? null,
          trait_options: r.trait_index?.trait_options ?? null,
          createdAt: r.created_at,
        })),
      }
    },
  )

  app.post<{
    Params: { tenantId: string }
    Body: { mint: string; kind?: string; tier?: string; label?: string }
  }>(
    '/api/v1/tenant/:tenantId/tracker/address-book',
    { preHandler: [adminWriteRateLimit] },
    async (request, reply) => {
      const result = await requireTenantAdmin(request, reply, request.params.tenantId)
      if (!result) return

      if (!getPool()) {
        return reply.status(503).send(apiError('Database required', ErrorCode.SERVICE_UNAVAILABLE))
      }

      const body = (request.body ?? {}) as Record<string, unknown>
      const mint = body.mint
      if (!isValidMintAddress(mint)) {
        return reply.status(400).send(apiError('mint must be a valid base58 address (32-64 chars)', ErrorCode.BAD_REQUEST))
      }

      const kind = (body.kind as string)?.toUpperCase() ?? 'SPL'
      if (!VALID_KINDS.has(kind)) {
        return reply.status(400).send(apiError('kind must be SPL or NFT', ErrorCode.BAD_REQUEST))
      }

      const tier = (body.tier as string)?.toLowerCase() ?? 'base'
      if (!ALLOWED_TIERS.has(tier)) {
        return reply.status(400).send(apiError('tier must be base or grow (pro is not available yet)', ErrorCode.BAD_REQUEST))
      }

      let label = typeof body.label === 'string' ? body.label.trim() || null : null
      let image: string | null = null
      let name: string | null = null
      let traitIndex: { trait_keys: string[]; trait_options: Record<string, string[]> } | null = null

      if (kind === 'NFT') {
        try {
          const collection = await buildCollectionPreview(mint.trim(), request.log, {
            traitsOnly: true,
            maxItems: 2500,
          })
          traitIndex = {
            trait_keys: collection.trait_keys ?? [],
            trait_options: collection.trait_options ?? {},
          }
          if (!label) label = collection.name ?? null
          image = collection.image ?? null
          name = collection.name ?? null
        } catch (err) {
          request.log.debug({ err, mint: mint.trim() }, 'Tracker address book: collection preview failed for NFT; storing without traits')
        }
      }

      const entry = await addAddressBookEntry(
        result.tenant.id,
        mint.trim(),
        kind as TrackerMintKind,
        tier as TrackerTier,
        label,
        image,
        name,
        traitIndex,
      )
      return {
        entry: {
          id: entry.id,
          mint: entry.mint,
          kind: entry.kind,
          tier: entry.tier,
          label: entry.label,
          image: entry.image,
          name: entry.name,
          trait_keys: entry.trait_index?.trait_keys ?? null,
          trait_options: entry.trait_index?.trait_options ?? null,
          createdAt: entry.created_at,
        },
      }
    },
  )

  app.patch<{
    Params: { tenantId: string; mint: string }
    Body: { tier: string }
  }>(
    '/api/v1/tenant/:tenantId/tracker/address-book/:mint',
    { preHandler: [adminWriteRateLimit] },
    async (request, reply) => {
      const result = await requireTenantAdmin(request, reply, request.params.tenantId)
      if (!result) return

      if (!getPool()) {
        return reply.status(503).send(apiError('Database required', ErrorCode.SERVICE_UNAVAILABLE))
      }

      const mint = request.params.mint?.trim()
      if (!isValidMintAddress(mint)) {
        return reply.status(400).send(apiError('Invalid mint address', ErrorCode.BAD_REQUEST))
      }

      const body = (request.body ?? {}) as Record<string, unknown>
      const tier = (body.tier as string)?.toLowerCase()
      if (!tier || !ALLOWED_TIERS.has(tier)) {
        return reply.status(400).send(apiError('tier must be base or grow', ErrorCode.BAD_REQUEST))
      }

      const updated = await updateAddressBookTier(result.tenant.id, mint, tier as TrackerTier)
      if (!updated) {
        return reply.status(404).send(apiError('Address book entry not found', ErrorCode.NOT_FOUND))
      }
      return {
        entry: {
          id: updated.id,
          mint: updated.mint,
          kind: updated.kind,
          tier: updated.tier,
          label: updated.label,
          image: updated.image,
          name: updated.name,
          trait_keys: updated.trait_index?.trait_keys ?? null,
          trait_options: updated.trait_index?.trait_options ?? null,
          createdAt: updated.created_at,
        },
      }
    },
  )

  app.delete<{ Params: { tenantId: string; mint: string } }>(
    '/api/v1/tenant/:tenantId/tracker/address-book/:mint',
    { preHandler: [adminWriteRateLimit] },
    async (request, reply) => {
      const result = await requireTenantAdmin(request, reply, request.params.tenantId)
      if (!result) return

      if (!getPool()) {
        return reply.status(503).send(apiError('Database required', ErrorCode.SERVICE_UNAVAILABLE))
      }

      const mint = request.params.mint?.trim()
      if (!isValidMintAddress(mint)) {
        return reply.status(400).send(apiError('Invalid mint address', ErrorCode.BAD_REQUEST))
      }

      const removed = await removeAddressBookEntry(result.tenant.id, mint)
      if (!removed) {
        return reply.status(404).send(apiError('Address book entry not found', ErrorCode.NOT_FOUND))
      }
      return { success: true }
    },
  )
}
