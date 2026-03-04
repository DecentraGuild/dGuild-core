import type { FastifyInstance } from 'fastify'
import {
  loadWhitelistByTenantId,
  writeWhitelistByTenantId,
  type WhitelistConfig,
  type WhitelistListEntry,
} from '../config/whitelist-registry.js'
import type { WhitelistCreateListBody, WhitelistUpdateListBody } from './types.js'
import { requireTenantAdmin } from './tenant-settings.js'
import { resolveTenant } from '../db/tenant.js'
import { getSolanaConnection } from '../solana-connection.js'
import { fetchWhitelistEntries, isWalletOnWhitelist } from '@decentraguild/web3'
import { normalizeTenantIdentifier } from '../validate-slug.js'
import { apiError, ErrorCode } from '../api-errors.js'

export async function registerWhitelistRoutes(app: FastifyInstance) {
  app.get<{
    Params: { slug: string }
  }>('/api/v1/tenant/:slug/whitelist/lists/public', async (request, reply) => {
    const slug = normalizeTenantIdentifier(request.params.slug)
    if (!slug) {
      return reply.status(400).send(apiError('Invalid tenant', ErrorCode.INVALID_SLUG))
    }
    const tenant = await resolveTenant(slug)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.NOT_FOUND))
    }
    const config = await loadWhitelistByTenantId(tenant.id)
    const lists = config?.lists ?? []
    return {
      lists: lists.map((l) => ({
        address: l.address,
        name: l.name,
        imageUrl: l.imageUrl ?? null,
      })),
    }
  })

  app.get<{
    Params: { slug: string }
  }>('/api/v1/tenant/:slug/whitelist/lists', async (request, reply) => {
    const result = await requireTenantAdmin(request, reply, request.params.slug)
    if (!result) return

    const tenantId = result.tenant.id
    const config = await loadWhitelistByTenantId(tenantId)
    return { lists: config?.lists ?? [] }
  })

  app.post<{
    Params: { slug: string }
    Body: WhitelistCreateListBody
  }>('/api/v1/tenant/:slug/whitelist/lists', async (request, reply) => {
    const result = await requireTenantAdmin(request, reply, request.params.slug)
    if (!result) return

    const body = (request.body ?? {}) as Partial<WhitelistCreateListBody>
    const { address, name, authority, imageUrl } = body
    if (
      !address ||
      !name ||
      !authority ||
      typeof address !== 'string' ||
      typeof name !== 'string' ||
      typeof authority !== 'string'
    ) {
      return reply.status(400).send(
        apiError('address, name, and authority are required', ErrorCode.BAD_REQUEST)
      )
    }

    const tenantId = result.tenant.id
    const config = await loadWhitelistByTenantId(tenantId)
    const lists = config?.lists ?? []
    if (lists.some((l) => l.address === address)) {
      return reply.status(409).send(apiError('List already registered', ErrorCode.BAD_REQUEST))
    }

    const entry: WhitelistListEntry = {
      address,
      name,
      authority,
      imageUrl: typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null,
    }
    const updated: WhitelistConfig = { tenantId, lists: [...lists, entry] }
    await writeWhitelistByTenantId(tenantId, updated)
    return { lists: updated.lists }
  })

  app.delete<{
    Params: { slug: string; address: string }
  }>('/api/v1/tenant/:slug/whitelist/lists/:address', async (request, reply) => {
    const result = await requireTenantAdmin(request, reply, request.params.slug)
    if (!result) return

    const address = request.params.address
    const tenantId = result.tenant.id
    const config = await loadWhitelistByTenantId(tenantId)
    const lists = config?.lists ?? []
    const filtered = lists.filter((l) => l.address !== address)
    if (filtered.length === lists.length) {
      return reply.status(404).send(apiError('List not found', ErrorCode.NOT_FOUND))
    }

    await writeWhitelistByTenantId(tenantId, { tenantId, lists: filtered })
    return { lists: filtered }
  })

  app.patch<{
    Params: { slug: string; address: string }
    Body: WhitelistUpdateListBody
  }>('/api/v1/tenant/:slug/whitelist/lists/:address', async (request, reply) => {
    const result = await requireTenantAdmin(request, reply, request.params.slug)
    if (!result) return

    const tenantId = result.tenant.id
    const address = request.params.address
    const body = (request.body ?? {}) as Partial<WhitelistUpdateListBody>

    const config = await loadWhitelistByTenantId(tenantId)
    const lists = config?.lists ?? []
    const index = lists.findIndex((l) => l.address === address)
    if (index === -1) {
      return reply.status(404).send(apiError('List not found', ErrorCode.NOT_FOUND))
    }

    const current = lists[index]
    const nextImage =
      typeof body.imageUrl === 'string' && body.imageUrl.trim() ? body.imageUrl.trim() : null

    const updatedEntry: WhitelistListEntry = {
      ...current,
      imageUrl: body.imageUrl === undefined ? current.imageUrl ?? null : nextImage,
    }
    const updatedLists = [...lists]
    updatedLists[index] = updatedEntry

    const updated: WhitelistConfig = { tenantId, lists: updatedLists }
    await writeWhitelistByTenantId(tenantId, updated)
    return { lists: updated.lists }
  })

  app.get<{
    Params: { slug: string }
    Querystring: { wallet?: string }
  }>('/api/v1/tenant/:slug/whitelist/my-memberships', async (request, reply) => {
    const slug = normalizeTenantIdentifier(request.params.slug)
    if (!slug) {
      return reply.status(400).send(apiError('Invalid tenant', ErrorCode.INVALID_SLUG))
    }
    const wallet = request.query.wallet?.trim()
    if (!wallet) {
      return reply.status(400).send(apiError('wallet query parameter is required', ErrorCode.BAD_REQUEST))
    }
    const tenant = await resolveTenant(slug)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.NOT_FOUND))
    }
    const config = await loadWhitelistByTenantId(tenant.id)
    const lists = config?.lists ?? []
    if (lists.length === 0) {
      return { memberships: [] }
    }
    const connection = getSolanaConnection()
    const memberships: Array<{ address: string; name: string; imageUrl: string | null }> = []
    for (const list of lists) {
      const onList = await isWalletOnWhitelist(connection, wallet, list.address)
      if (onList) {
        memberships.push({
          address: list.address,
          name: list.name,
          imageUrl: list.imageUrl ?? null,
        })
      }
    }
    return { memberships }
  })

  app.get<{
    Params: { slug: string }
    Querystring: { wallet?: string; list?: string }
  }>('/api/v1/tenant/:slug/whitelist/check', async (request, reply) => {
    const slug = normalizeTenantIdentifier(request.params.slug)
    if (!slug) {
      return reply.status(400).send(apiError('Invalid tenant', ErrorCode.INVALID_SLUG))
    }
    const wallet = request.query.wallet?.trim()
    const listAddress = request.query.list?.trim()
    if (!wallet) {
      return reply.status(400).send(apiError('wallet query parameter is required', ErrorCode.BAD_REQUEST))
    }
    if (!listAddress) {
      return reply.status(400).send(apiError('list query parameter is required', ErrorCode.BAD_REQUEST))
    }
    const config = await loadWhitelistByTenantId(slug)
    const list = config?.lists?.find((l) => l.address === listAddress)
    if (!list) {
      return reply.status(404).send(apiError('List not found', ErrorCode.NOT_FOUND))
    }
    const connection = getSolanaConnection()
    const listed = await isWalletOnWhitelist(connection, wallet, list.address)
    return { listed }
  })

  app.get<{
    Params: { slug: string }
    Querystring: { wallet?: string }
  }>('/api/v1/tenant/:slug/whitelist/is-listed', async (request, reply) => {
    const slug = normalizeTenantIdentifier(request.params.slug)
    if (!slug) {
      return reply.status(400).send(apiError('Invalid tenant', ErrorCode.INVALID_SLUG))
    }

    const wallet = request.query.wallet?.trim()
    if (!wallet) {
      return reply.status(400).send(apiError('wallet query parameter is required', ErrorCode.BAD_REQUEST))
    }

    const tenant = await resolveTenant(slug)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.NOT_FOUND))
    }
    const config = await loadWhitelistByTenantId(tenant.id)
    const lists = config?.lists ?? []
    if (lists.length === 0) {
      return { listed: false }
    }

    const connection = getSolanaConnection()
    for (const list of lists) {
      const onList = await isWalletOnWhitelist(connection, wallet, list.address)
      if (onList) {
        return { listed: true, listName: list.name }
      }
    }
    return { listed: false }
  })

  app.get<{
    Params: { slug: string; address: string }
  }>('/api/v1/tenant/:slug/whitelist/lists/:address/entries', async (request, reply) => {
    const result = await requireTenantAdmin(request, reply, request.params.slug)
    if (!result) return

    const { address } = request.params
    const config = await loadWhitelistByTenantId(result.tenant.id)
    const list = config?.lists?.find((l) => l.address === address)
    if (!list) {
      return reply.status(404).send(apiError('List not found', ErrorCode.NOT_FOUND))
    }

    const connection = getSolanaConnection()
    const entries = await fetchWhitelistEntries(connection, address)
    return {
      list: { address: list.address, name: list.name, authority: list.authority },
      entries: entries.map((e) => ({
        publicKey: e.publicKey.toBase58(),
        wallet: e.account.whitelisted.toBase58(),
      })),
    }
  })

  app.get<{
    Params: { slug: string; address: string }
  }>('/api/v1/tenant/:slug/whitelist/lists/:address/entries-public', async (request, reply) => {
    const slug = normalizeTenantIdentifier(request.params.slug)
    if (!slug) {
      return reply.status(400).send(apiError('Invalid tenant', ErrorCode.INVALID_SLUG))
    }
    const tenant = await resolveTenant(slug)
    if (!tenant) {
      return reply.status(404).send(apiError('Tenant not found', ErrorCode.NOT_FOUND))
    }
    const { address } = request.params
    const config = await loadWhitelistByTenantId(tenant.id)
    const list = config?.lists?.find((l) => l.address === address)
    if (!list) {
      return reply.status(404).send(apiError('List not found', ErrorCode.NOT_FOUND))
    }

    const connection = getSolanaConnection()
    const entries = await fetchWhitelistEntries(connection, address)
    return {
      list: { address: list.address, name: list.name, imageUrl: list.imageUrl ?? null },
      entries: entries.map((e) => ({
        wallet: e.account.whitelisted.toBase58(),
      })),
    }
  })
}
