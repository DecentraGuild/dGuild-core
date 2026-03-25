import { setInternalDevTenantIds, resolveInternalDevTenantIdsFromEnv } from '@decentraguild/catalog'

setInternalDevTenantIds(resolveInternalDevTenantIdsFromEnv(Deno.env.get('INTERNAL_DEV_TENANT_IDS')))
