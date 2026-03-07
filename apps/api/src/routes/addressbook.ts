import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireTenantAdmin } from './tenant-settings.js'
import { getWalletFromRequest } from './auth.js'
import { apiError, ErrorCode } from '../api-errors.js'
import { adminWriteRateLimit } from '../rate-limit-strict.js'
import { getPool } from '../db/client.js'
import { isValidTenantId } from '../validate-slug.js'
import { getTenantById } from '../db/tenant.js'
import {
  listAddressBook,
  getAddressBookEntry,
  addAddressBookEntry,
  updateAddressBookTier,
  updateAddressBookTraitIndex,
  removeAddressBookEntry,
  listHolderSnapshots,
  getHolderSnapshotByDate,
  type TrackerMintKind,
  type TrackerTier,
} from '../db/tracker-address-book.js'
import { buildCollectionPreview } from '../discord/collection-preview.js'
import { getAddressbookSettings, upsertAddressbookSettings } from '../db/addressbook-settings.js'
import { getMintMetadata, getMintMetadataBatch, upsertMintMetadata } from '../db/marketplace-metadata.js'
import { getSolanaConnection } from '../solana-connection.js'
import { isWalletOnWhitelist, fetchMintMetadataFromChain } from '@decentraguild/web3'

const VALID_KINDS = new Set<string>(['SPL', 'NFT'])
const ALLOWED_TIERS = new Set<string>(['base', 'grow'])

function isValidMintAddress(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 32 && v.length <= 64
}

/** Allow access based on the address book access level setting. Admins always pass. */
async function requireAddressbookAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  tenantIdParam: string,
): Promise<{ tenant: Awaited<ReturnType<typeof getTenantById>> } | null> {
  const tenantId = tenantIdParam?.trim()
  if (!tenantId || !isValidTenantId(tenantId)) {
    reply.status(400).send(apiError('Invalid tenant id', ErrorCode.BAD_REQUEST))
    return null
  }
  const tenant = await getTenantById(tenantId)
  if (!tenant) {
    reply.status(404).send(apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND))
    return null
  }
  const wallet = await getWalletFromRequest(request)
  if (!wallet) {
    reply.status(401).send(apiError('Authentication required', ErrorCode.UNAUTHORIZED))
    return null
  }
  const admins = tenant.admins ?? []
  if (admins.includes(wallet)) {
    return { tenant }
  }
  const settings = await getAddressbookSettings(tenant.id)
  const access = settings?.access ?? 'admin_only'

  if (access === 'admin_only') {
    reply.status(403).send(apiError('Address book access is restricted to admins', ErrorCode.FORBIDDEN))
    return null
  }

  if (access === 'public') {
    return { tenant }
  }

  // access === 'whitelist'
  const wl = settings?.whitelist ?? null
  if (!wl?.account?.trim()) {
    reply.status(403).send(apiError('Address book access requires admin or member whitelist', ErrorCode.FORBIDDEN))
    return null
  }
  const connection = getSolanaConnection()
  const listed = await isWalletOnWhitelist(connection, wallet, wl.account.trim())
  if (!listed) {
    reply.status(403).send(apiError('Address book access requires admin or member whitelist', ErrorCode.FORBIDDEN))
    return null
  }
  return { tenant }
}

export async function registerAddressbookRoutes(app: FastifyInstance) {
  app.get<{ Params: { tenantId: string } }>(
    '/api/v1/tenant/:tenantId/addressbook/address-book',
    async (request, reply) => {
      const result = await requireAddressbookAccess(request, reply, request.params.tenantId)
      if (!result) return
      if (!getPool()) {
        return { entries: [] }
      }
      const rows = await listAddressBook(result.tenant.id)
      const metaMap =
        rows.length > 0 ? await getMintMetadataBatch(rows.map((r) => r.mint)) : new Map<string, { name?: string | null; symbol?: string | null; image?: string | null }>()
      return {
        entries: rows.map((r) => {
          const meta = metaMap.get(r.mint) ?? null
          const label = r.label ?? meta?.name ?? meta?.symbol ?? null
          const image = r.image ?? meta?.image ?? null
          const name = r.name ?? meta?.name ?? null
          const symbol = meta?.symbol ?? null
          return {
            id: r.id,
            mint: r.mint,
            kind: r.kind,
            tier: r.tier,
            label,
            image,
            name,
            symbol,
            trait_keys: r.trait_index?.trait_keys ?? null,
            trait_options: r.trait_index?.trait_options ?? null,
            createdAt: r.created_at,
          }
        }),
      }
    },
  )

  app.post<{
    Params: { tenantId: string }
    Body: { mint: string; kind?: string; tier?: string; label?: string }
  }>(
    '/api/v1/tenant/:tenantId/addressbook/address-book',
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
      let image = typeof body.image === 'string' ? body.image.trim() || null : null
      let name = typeof body.name === 'string' ? body.name.trim() || null : null
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
          if (!image) image = collection.image ?? null
          if (!name) name = collection.name ?? null
        } catch (err) {
          request.log.debug({ err, mint: mint.trim() }, 'Address book: collection preview failed for NFT; storing without traits')
        }
      }

      if (kind === 'SPL' && (!label || !image || !name)) {
        let meta = await getMintMetadata(mint.trim()).catch(() => null)
        if (!meta) {
          try {
            const fetched = await fetchMintMetadataFromChain(getSolanaConnection(), mint.trim())
            await upsertMintMetadata(mint.trim(), {
              name: fetched.name,
              symbol: fetched.symbol,
              image: fetched.image,
              decimals: fetched.decimals,
              sellerFeeBasisPoints: fetched.sellerFeeBasisPoints ?? undefined,
            }).catch((e) =>
              request.log.warn({ err: e, mint: mint.trim() }, 'Address book: mint metadata upsert skipped'),
            )
            meta = {
              mint: mint.trim(),
              name: fetched.name,
              symbol: fetched.symbol,
              image: fetched.image,
              decimals: fetched.decimals,
              sellerFeeBasisPoints: fetched.sellerFeeBasisPoints,
            }
          } catch (e) {
            request.log.debug({ err: e, mint: mint.trim() }, 'Address book: SPL metadata fetch failed')
          }
        }
        if (meta) {
          if (!label) label = meta.name ?? meta.symbol ?? null
          if (!image) image = meta.image ?? null
          if (!name) name = meta.name ?? null
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
    '/api/v1/tenant/:tenantId/addressbook/address-book/:mint',
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

  app.patch<{
    Params: { tenantId: string; mint: string }
  }>(
    '/api/v1/tenant/:tenantId/addressbook/address-book/:mint/refresh-traits',
    { preHandler: [adminWriteRateLimit] },
    async (request, reply) => {
      const result = await requireTenantAdmin(request, reply, request.params.tenantId)
      if (!result) return

      if (!getPool()) {
        return reply.status(503).send(apiError('Database not available', ErrorCode.SERVICE_UNAVAILABLE))
      }

      const mint = request.params.mint?.trim()
      if (!isValidMintAddress(mint)) {
        return reply.status(400).send(apiError('Invalid mint address', ErrorCode.BAD_REQUEST))
      }

      const existing = await getAddressBookEntry(result.tenant.id, mint)
      if (!existing) {
        return reply.status(404).send(apiError('Address book entry not found', ErrorCode.NOT_FOUND))
      }
      if (existing.kind !== 'NFT') {
        return reply
          .status(400)
          .send(apiError('Refresh traits is only for NFT/collection entries', ErrorCode.BAD_REQUEST))
      }

      try {
        const collection = await buildCollectionPreview(mint, request.log, {
          traitsOnly: true,
          maxItems: 2500,
        })
        const traitIndex = {
          trait_keys: collection.trait_keys ?? [],
          trait_options: collection.trait_options ?? {},
        }
        const updated = await updateAddressBookTraitIndex(
          result.tenant.id,
          mint,
          traitIndex.trait_keys.length > 0 ? traitIndex : null,
        )
        if (!updated) {
          return reply.status(500).send(apiError('Failed to update entry', ErrorCode.INTERNAL_ERROR))
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
      } catch (err) {
        const isNotFound = err instanceof Error && err.message === 'Asset not found'
        if (isNotFound) {
          return reply.status(404).send(apiError('Asset not found', ErrorCode.NOT_FOUND, { mint }))
        }
        request.log.error({ err, mint }, 'Address book refresh traits failed')
        return reply.status(500).send(
          apiError(
            err instanceof Error ? err.message : 'Failed to load collection traits',
            ErrorCode.INTERNAL_ERROR,
          ),
        )
      }
    },
  )

  app.delete<{ Params: { tenantId: string; mint: string } }>(
    '/api/v1/tenant/:tenantId/addressbook/address-book/:mint',
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

  app.get<{ Params: { tenantId: string } }>(
    '/api/v1/tenant/:tenantId/addressbook/settings',
    async (request, reply) => {
      const result = await requireTenantAdmin(request, reply, request.params.tenantId)
      if (!result) return
      if (!getPool()) {
        return { settings: { access: 'admin_only', whitelist: null } }
      }
      const settings = await getAddressbookSettings(result.tenant.id)
      return { settings: settings ?? { access: 'admin_only', whitelist: null } }
    },
  )

  app.patch<{
    Params: { tenantId: string }
    Body: { access?: string; whitelist?: { programId: string; account: string } | null }
  }>(
    '/api/v1/tenant/:tenantId/addressbook/settings',
    { preHandler: [adminWriteRateLimit] },
    async (request, reply) => {
      const result = await requireTenantAdmin(request, reply, request.params.tenantId)
      if (!result) return
      if (!getPool()) {
        return reply.status(503).send(apiError('Database required', ErrorCode.SERVICE_UNAVAILABLE))
      }
      const body = (request.body ?? {}) as Record<string, unknown>

      const VALID_ACCESS = new Set(['public', 'whitelist', 'admin_only'])
      const rawAccess = typeof body.access === 'string' ? body.access : null
      const access = (rawAccess && VALID_ACCESS.has(rawAccess) ? rawAccess : 'admin_only') as 'public' | 'whitelist' | 'admin_only'

      const wl = body.whitelist
      let whitelist: { programId: string; account: string } | null = null
      if (access === 'whitelist' && wl && typeof wl === 'object' && typeof (wl as Record<string, string>).account === 'string') {
        const acc = (wl as Record<string, string>).account?.trim()
        if (acc) {
          whitelist = {
            programId: ((wl as Record<string, string>).programId ?? 'whi5uDPWK4rAE9Sus6hdxdHwsG1hjDBn6kXM6pyqwTn').trim(),
            account: acc,
          }
        }
      }
      await upsertAddressbookSettings(result.tenant.id, { access, whitelist })
      const settings = await getAddressbookSettings(result.tenant.id)
      return { settings: settings ?? { access: 'public', whitelist: null } }
    },
  )

  app.get<{ Params: { tenantId: string; mint: string } }>(
    '/api/v1/tenant/:tenantId/addressbook/snapshots/:mint',
    async (request, reply) => {
      const result = await requireAddressbookAccess(request, reply, request.params.tenantId)
      if (!result) return
      if (!getPool()) {
        return { snapshots: [] }
      }
      const mint = request.params.mint?.trim()
      if (!mint || mint.length < 32) {
        return reply.status(400).send(apiError('Invalid mint', ErrorCode.BAD_REQUEST))
      }
      const snapshots = await listHolderSnapshots(result.tenant.id, mint)
      return { snapshots }
    },
  )

  app.get<{ Params: { tenantId: string; mint: string; date: string } }>(
    '/api/v1/tenant/:tenantId/addressbook/snapshots/:mint/:date',
    async (request, reply) => {
      const result = await requireAddressbookAccess(request, reply, request.params.tenantId)
      if (!result) return
      if (!getPool()) {
        return reply.status(404).send(apiError('Snapshot not found', ErrorCode.NOT_FOUND))
      }
      const mint = request.params.mint?.trim()
      const date = request.params.date?.trim()
      if (!mint || mint.length < 32 || !date) {
        return reply.status(400).send(apiError('Invalid mint or date', ErrorCode.BAD_REQUEST))
      }
      const holderWallets = await getHolderSnapshotByDate(result.tenant.id, mint, date)
      if (holderWallets === null) {
        return reply.status(404).send(apiError('Snapshot not found', ErrorCode.NOT_FOUND))
      }
      return { date, holderWallets }
    },
  )
}
