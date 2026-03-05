import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { buildCorsOrigin } from './cors.js'
import { registerTenantContextRoutes } from './routes/tenant-context.js'
import { registerTenantSettingsRoutes } from './routes/tenant-settings.js'
import { registerMarketplaceMetadataRoutes } from './routes/marketplace-metadata.js'
import { registerMarketplaceScopeRoutes } from './routes/marketplace-scope.js'
import { registerMarketplaceEscrowsRoutes } from './routes/marketplace-escrows.js'
import { registerTenantsRoutes } from './routes/tenants.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerDiscordBotRoutes } from './routes/discord-bot.js'
import { registerDiscordVerifyRoutes } from './routes/discord-verify.js'
import { registerDiscordServerRoutes } from './routes/discord-server.js'
import { registerDiscordRulesRoutes } from './routes/discord-rules.js'
import { registerDiscordSyncRoutes } from './routes/discord-sync.js'
import { registerBillingRoutes } from './routes/billing.js'
import { registerBillingPaymentRoutes } from './routes/billing-payments.js'
import { registerRegisterRoutes } from './routes/register.js'
import { registerWhitelistRoutes } from './routes/whitelist.js'
import { registerRaffleRoutes } from './routes/raffle.js'
import { registerPlatformAuthRoutes } from './routes/platform/auth.js'
import { registerPlatformTenantsRoutes } from './routes/platform/tenants.js'
import { registerPlatformTenantModulesRoutes } from './routes/platform/tenants-modules.js'
import { registerPlatformBillingRoutes } from './routes/platform/billing.js'
import { registerPlatformAuditRoutes } from './routes/platform/audit.js'
import { initPool } from './db/client.js'
import { apiError, ErrorCode } from './api-errors.js'
import { runMigrations } from './db/run-migrations.js'
import { normalizeTenantIdentifier } from './validate-slug.js'
import { getTenantConfigDir, loadTenantByIdOrSlug, loadTenantBySlugDiagnostic, listTenantSlugs } from './config/registry.js'
import { loadMarketplaceBySlug, listMarketplaceSlugs } from './config/marketplace-registry.js'
import { ensureConfigPaths } from './config/ensure-paths.js'
import {
  DEFAULT_PORT,
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW,
} from './config/constants.js'
import { setSeedCompleted, isSeedPending } from './seed-state.js'
import { runSeedFromRegistry, seedMintMetadataFromConfig } from './seed-from-registry.js'

ensureConfigPaths()

const app = Fastify({ logger: true })

app.setErrorHandler((err: unknown, request, reply) => {
  const msg = err instanceof Error ? err.message : 'Unhandled error'
  request.log.error({ err }, msg)
  const message = err instanceof Error ? err.message : 'Internal server error'
  const body = apiError(message, ErrorCode.INTERNAL_ERROR)
  if (process.env.NODE_ENV !== 'production' && err instanceof Error && err.stack) {
    (body as Record<string, unknown>).stack = err.stack
  }
  return reply.status(500).send(body)
})

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    app.log.error('DATABASE_URL is required in production')
    process.exit(1)
  }

  await app.register(cors, {
    origin: buildCorsOrigin(),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  const cookie = await import('@fastify/cookie')
  await app.register(cookie)

  const rateLimit = await import('@fastify/rate-limit')
  await app.register(rateLimit.default, {
    max: Number(process.env.RATE_LIMIT_MAX) || DEFAULT_RATE_LIMIT_MAX,
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? DEFAULT_RATE_LIMIT_WINDOW,
  })

  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl) {
    initPool(databaseUrl)
    await runMigrations(app.log)
    // Seed from file registry only when TENANT_CONFIG_PATH is set (local dev or one-off migration).
    // Production: DB is source of truth; populate via pnpm run seed:tenants or registration flow.
    const tenantConfigDir = getTenantConfigDir()
    if (tenantConfigDir) {
      void runSeedFromRegistry(app.log)
        .then(() => setSeedCompleted())
        .catch((e) => {
          app.log.warn({ err: e }, 'Seed failed (scope may be empty)')
          setSeedCompleted()
        })
    } else {
      setSeedCompleted()
    }
  }

  app.get('/', async (_req, reply) => {
    return reply.code(200).send({
      name: 'DecentraGuild API',
      version: '1',
      docs: 'API is under /api/v1/. Use GET /api/v1/health for health check.',
    })
  })
  app.get('/api/v1/health', async () => {
    const tenantConfigPath = getTenantConfigDir()
    const slugs = await listTenantSlugs()
    const tenantConfigOk = Boolean(tenantConfigPath && slugs.length > 0)
    return {
      status: 'ok',
      tenantConfigPath: tenantConfigPath ?? null,
      tenantConfigOk,
      seedPending: databaseUrl ? isSeedPending() : undefined,
    }
  })
  app.get('/api/v1/debug/tenant-config', async (request, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.code(404).send(apiError('Not found', ErrorCode.NOT_FOUND))
    }
    const slugParam = new URL(request.url, 'http://localhost').searchParams.get('slug')?.trim()
    const slugs = await listTenantSlugs()
    const slug = slugParam
      ? normalizeTenantIdentifier(slugParam)
      : (slugs[0] ?? null)
    if (!slug) {
      return reply.code(400).send(
        apiError(
          slugParam ? 'Invalid tenant slug' : 'No tenant configs found; use ?slug=<slug> when configs exist',
          ErrorCode.BAD_REQUEST
        )
      )
    }
    return reply.send(await loadTenantBySlugDiagnostic(slug))
  })
  app.post('/api/v1/debug/seed-metadata', async (request, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.code(404).send(apiError('Not found', ErrorCode.NOT_FOUND))
    }
    const slugs = await listMarketplaceSlugs()
    let seeded = 0
    for (const slug of slugs) {
      const config = await loadMarketplaceBySlug(slug)
      if (config) {
        try {
          await seedMintMetadataFromConfig(config, app.log)
          seeded++
        } catch (e) {
          app.log.warn({ err: e, slug }, 'Mint metadata seed failed')
        }
      }
    }
    return { ok: true, configsSeeded: seeded }
  })
  await registerAuthRoutes(app)
  await registerTenantContextRoutes(app)
  await registerTenantSettingsRoutes(app)
  await registerMarketplaceMetadataRoutes(app)
  await registerMarketplaceScopeRoutes(app)
  await registerMarketplaceEscrowsRoutes(app)
  await registerTenantsRoutes(app)
  await registerDiscordBotRoutes(app)
  await registerDiscordVerifyRoutes(app)
  await registerDiscordServerRoutes(app)
  await registerDiscordRulesRoutes(app)
  await registerDiscordSyncRoutes(app)
  await registerBillingRoutes(app)
  await registerBillingPaymentRoutes(app)
  await registerRegisterRoutes(app)
  await registerWhitelistRoutes(app)
  await registerRaffleRoutes(app)
  await registerPlatformAuthRoutes(app)
  await registerPlatformTenantsRoutes(app)
  await registerPlatformTenantModulesRoutes(app)
  await registerPlatformBillingRoutes(app)
  await registerPlatformAuditRoutes(app)

  const port = Number(process.env.PORT) || DEFAULT_PORT
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info({ port, tenantConfigPath: process.env.TENANT_CONFIG_PATH ?? null }, 'API ready')
  // Scheduled jobs (Discord holder sync, module lifecycle) run in a separate worker process; see src/worker.ts.
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
