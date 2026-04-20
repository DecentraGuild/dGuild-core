<template>
  <div class="tenant-chooser">
    <div v-if="loading" class="tenant-chooser__loading">
      <Skeleton class="h-9 w-full max-w-xs" />
      <div class="mt-4 flex gap-2">
        <Skeleton class="h-9 w-28" />
        <Skeleton class="h-9 w-28" />
      </div>
    </div>
    <div v-else-if="loadError" class="tenant-chooser__error">{{ loadError }}</div>
    <div v-else class="tenant-chooser__inner">
      <h1 class="tenant-chooser__title">Choose your dGuild</h1>
      <div class="tenant-chooser__bar">
        <div class="tenant-chooser__search">
          <Label for="tenant-chooser-search" class="tenant-chooser__label">Search</Label>
          <div class="relative">
            <Icon icon="mdi:magnify" class="tenant-chooser__search-icon" aria-hidden="true" />
            <Input
              id="tenant-chooser-search"
              v-model="searchQuery"
              type="search"
              placeholder="Search dGuilds"
              autocomplete="off"
              aria-label="Search dGuilds"
              class="pl-8"
            />
          </div>
        </div>
        <div class="tenant-chooser__filters">
          <div class="tenant-chooser__filter">
            <Label for="tenant-chooser-module" class="tenant-chooser__label">Module</Label>
            <Select v-model="moduleFilterModel" aria-label="Filter by module">
              <SelectTrigger id="tenant-chooser-module" class="w-[140px]">
                <SelectValue placeholder="Any module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span>Any module</span>
                </SelectItem>
                <SelectItem v-for="opt in moduleFilterOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="tenant-chooser__filter">
            <Label for="tenant-chooser-access" class="tenant-chooser__label">Access</Label>
            <Select v-model="accessFilter" aria-label="Filter by access">
              <SelectTrigger id="tenant-chooser-access" class="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="gates">Gated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div v-if="filteredTenants.length === 0" class="tenant-chooser__empty">
        <p class="tenant-chooser__empty-text">No dGuilds match your search.</p>
        <p class="tenant-chooser__empty-hint">Try clearing the search or filters.</p>
      </div>
      <div v-else class="tenant-chooser__grid">
        <TenantDiscoverCard
          v-for="t in filteredTenants"
          :key="t.id"
          :tenant="t"
          :has-gate="hasGates(t)"
          :active-modules-with-gate="activeModulesWithGate(t)"
          @select="onSelectTenant"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { TenantConfig } from '@decentraguild/core'
import { getBrowserClient } from '@decentraguild/auth'
import { useDiscoveryFilters } from '@decentraguild/discovery'
import TenantDiscoverCard from '~/components/chooser/TenantDiscoverCard.vue'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Skeleton } from '~/components/ui/skeleton'

const config = useRuntimeConfig()
const router = useRouter()
const tenants = ref<TenantConfig[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

onMounted(async () => {
  try {
    const anonKey = (config.public.supabaseAnonKey as string)?.trim()
    if (!anonKey) {
      loadError.value =
        'This app is not configured to load dGuilds. Set NUXT_PUBLIC_SUPABASE_ANON_KEY and redeploy.'
      return
    }
    const supabase = getBrowserClient(
      config.public.supabaseUrl as string,
      config.public.supabaseAnonKey as string,
    )
    const { data, error: dbError } = await supabase
      .from('tenant_config')
      .select('id, slug, name, description, branding, modules')
      .order('id', { ascending: true })
    if (dbError) {
      const msg =
        dbError.code === 'PGRST301' || dbError.message?.includes('401')
          ? 'Invalid or missing Supabase configuration. Check NUXT_PUBLIC_SUPABASE_ANON_KEY.'
          : dbError.message
      throw new Error(msg)
    }
    tenants.value = (data ?? []) as TenantConfig[]
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load dGuilds'
  } finally {
    loading.value = false
  }
})

const {
  searchQuery,
  moduleFilter,
  accessFilter,
  hasGates,
  activeModulesWithGate,
  moduleFilterOptions,
  filteredTenants,
} = useDiscoveryFilters(tenants)

const moduleFilterModel = computed({
  get: () => moduleFilter.value ?? 'all',
  set: (v: string) => {
    moduleFilter.value = v === 'all' ? null : v
  },
})

function onSelectTenant(tenantId: string) {
  void router.replace({ path: '/', query: { tenant: tenantId } })
}
</script>

<style scoped>
.tenant-chooser {
  min-height: 100vh;
  box-sizing: border-box;
  padding: max(var(--theme-space-md), env(safe-area-inset-top))
    max(var(--theme-space-md), env(safe-area-inset-right))
    max(var(--theme-space-xl), env(safe-area-inset-bottom))
    max(var(--theme-space-md), env(safe-area-inset-left));
  background: var(--theme-bg-primary);
}

.tenant-chooser__loading,
.tenant-chooser__error {
  padding: var(--theme-space-md);
  text-align: center;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.tenant-chooser__error {
  color: var(--theme-error);
}

.tenant-chooser__inner {
  max-width: 56rem;
  margin: 0 auto;
}

.tenant-chooser__title {
  margin: 0 0 var(--theme-space-md);
  font-size: var(--theme-font-lg);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.tenant-chooser__bar {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--theme-space-sm);
  margin-bottom: var(--theme-space-md);
}

.tenant-chooser__search {
  position: relative;
  flex: 1;
  min-width: 0;
}

.tenant-chooser__search-icon {
  position: absolute;
  left: var(--theme-space-xs);
  top: 50%;
  transform: translateY(-50%);
  font-size: 1rem;
  color: var(--theme-text-muted);
  pointer-events: none;
}

.tenant-chooser__label {
  display: block;
  font-size: var(--theme-font-xs);
  font-weight: 500;
  color: var(--theme-text-secondary);
  margin-bottom: var(--theme-space-xs);
}

.tenant-chooser__filters {
  display: flex;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
}

.tenant-chooser__filter {
  min-width: 120px;
}

.tenant-chooser__empty {
  padding: var(--theme-space-md);
  text-align: center;
  color: var(--theme-text-muted);
}

.tenant-chooser__empty-text {
  margin: 0 0 0.25rem;
  font-size: var(--theme-font-sm);
}

.tenant-chooser__empty-hint {
  margin: 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.tenant-chooser__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 320px));
  gap: var(--theme-space-md);
  justify-content: start;
}
</style>
