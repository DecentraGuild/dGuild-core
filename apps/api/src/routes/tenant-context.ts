import type { FastifyInstance } from 'fastify'
import { getTenantSlugFromHost, isModuleVisibleToMembers, getModuleState } from '@decentraguild/core'
import type { TenantConfigDiagnostic } from '../config/registry.js'
import { normalizeTenantIdentifier } from '../validate-slug.js'
import { loadTenantBySlugDiagnostic } from '../config/registry.js'
import { resolveTenant } from '../db/tenant.js'
import { resolveMarketplaceEnriched } from '../marketplace/enrich-config.js'
import { getRaffleSettings } from '../db/raffle.js'
import { getWalletFromRequest } from './auth.js'
import { apiError, ErrorCode } from '../api-errors.js'

const CACHE_MAX_AGE_SECONDS = 60

export async function registerTenantContextRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenant-context', async (request, reply) => {
    const host = request.headers.host ?? ''
    const query = request.query as { slug?: string; debug?: string }
    const urlSearchParams = new URL(request.url, 'http://localhost').searchParams
    // Prefer Fastify's parsed query (works behind proxies that strip query from request.url)
    const slugParam = query.slug?.trim() || urlSearchParams.get('slug') || null
    const debug = query.debug === '1' || query.debug === 'true' || urlSearchParams.get('debug') === '1' || urlSearchParams.get('debug') === 'true'

    const searchParams = urlSearchParams
    const slugFromHost = getTenantSlugFromHost(host, searchParams) ?? null
    // In production, prefer Host-based resolution; fall back to explicit slug when Host does not encode tenant.
    const rawSlug =
      process.env.NODE_ENV === 'production'
        ? (slugFromHost ?? (slugParam || null))
        : (slugParam ?? slugFromHost)
    const slug = rawSlug ? normalizeTenantIdentifier(rawSlug) : null

    if (!slug) {
      return reply.status(404).send(apiError(rawSlug ? 'Invalid tenant identifier' : 'Tenant identifier required', ErrorCode.INVALID_SLUG))
    }

    const tenant = await resolveTenant(slug)
    if (!tenant) {
      request.log.warn({ slug, slugParam, slugFromHost }, 'Tenant not found')
      const body = apiError('Tenant not found', ErrorCode.TENANT_NOT_FOUND)
      if (debug && process.env.NODE_ENV !== 'production') {
        (body as { diagnostic?: TenantConfigDiagnostic }).diagnostic = await loadTenantBySlugDiagnostic(slug)
      }
      return reply.status(404).send(body)
    }

    const wallet = await getWalletFromRequest(request)
    const isAdmin = wallet && Array.isArray(tenant.admins) && tenant.admins.includes(wallet)
    if (!isAdmin) {
      reply.header('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SECONDS}`)
    }

    const isMarketplaceVisible = tenant.id && isModuleVisibleToMembers(getModuleState(tenant.modules?.marketplace))
    const isRafflesVisible = tenant.id && isModuleVisibleToMembers(getModuleState(tenant.modules?.raffles))

    const [marketplaceSettings, raffleSettings] = await Promise.all([
      isMarketplaceVisible ? resolveMarketplaceEnriched(tenant.id) : Promise.resolve(null),
      isRafflesVisible ? getRaffleSettings(tenant.id) : Promise.resolve(null),
    ])

    return { tenant, marketplaceSettings: marketplaceSettings ?? undefined, raffleSettings: raffleSettings ?? undefined }
  })
}
