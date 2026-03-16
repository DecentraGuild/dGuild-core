<template>
  <div class="discovery-page">
    <div v-if="loading" class="discovery__loading">
      <Skeleton class="h-9 w-full max-w-xs" />
      <div class="mt-4 flex gap-2">
        <Skeleton class="h-9 w-28" />
        <Skeleton class="h-9 w-28" />
      </div>
    </div>
    <div v-else-if="error" class="discovery__error">{{ error }}</div>
    <div v-else class="discovery">
      <div class="discovery__bar">
        <div class="discovery__search">
          <Label for="discovery-search">Search</Label>
          <div class="relative">
            <Icon icon="mdi:magnify" class="discovery__search-icon" aria-hidden="true" />
            <Input
              id="discovery-search"
              v-model="searchQuery"
              type="search"
              placeholder="Search dGuilds"
              autocomplete="off"
              aria-label="Search dGuilds"
              class="pl-8"
            />
          </div>
        </div>
        <div class="discovery__filters">
          <div class="discovery__filter">
            <Label for="discovery-module">Module</Label>
            <Select v-model="moduleFilterModel" aria-label="Filter by module">
              <SelectTrigger id="discovery-module" class="w-[140px]">
                <SelectValue placeholder="Any module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  <span>Any module</span>
                </SelectItem>
                <SelectItem
                  v-for="opt in moduleFilterOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="discovery__filter">
            <Label for="discovery-access">Access</Label>
            <Select v-model="accessFilter" aria-label="Filter by access">
              <SelectTrigger id="discovery-access" class="w-[120px]">
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

      <div v-if="filteredTenants.length === 0" class="discovery__empty">
        <p class="discovery__empty-text">No dGuilds match your search.</p>
        <p class="discovery__empty-hint">Try clearing the search or filters.</p>
      </div>
      <div v-else class="discovery__grid">
        <DiscoveryCard
          v-for="t in filteredTenants"
          :key="t.id"
          :tenant="t"
          :tenant-url="tenantUrl"
          :has-gate="hasGates(t)"
          :active-modules-with-gate="activeModulesWithGate(t)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Discover' })
import { Icon } from '@iconify/vue'
import type { TenantConfig } from '@decentraguild/core'
import DiscoveryCard from '~/components/DiscoveryCard.vue'
import { useDiscoveryFilters } from '~/composables/useDiscoveryFilters'
import { useSupabase } from '~/composables/useSupabase'
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
const tenants = ref<TenantConfig[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const supabase = useSupabase()
    const { data, error: dbError } = await supabase
      .from('tenant_config')
      .select('id, slug, name, description, branding, modules')
      .order('created_at', { ascending: false })
    if (dbError) throw new Error(dbError.message)
    tenants.value = (data ?? []) as TenantConfig[]
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load tenants'
  } finally {
    loading.value = false
  }
})

function tenantUrl(idOrSlug: string) {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return `http://localhost:3002?tenant=${encodeURIComponent(idOrSlug)}`
  }
  const tenantAppHost = config.public.tenantAppHost as string
  return `https://${tenantAppHost}?tenant=${encodeURIComponent(idOrSlug)}`
}

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
  get: () => moduleFilter.value ?? '',
  set: (v: string) => { moduleFilter.value = v === '' ? null : v },
})
</script>

<style scoped>
.discovery__loading,
.discovery__error {
  padding: var(--theme-space-md);
  text-align: center;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.discovery__error {
  color: var(--theme-error);
}

.discovery-page {
  padding: 0 0 var(--theme-space-xl) 0;
}

.discovery__bar {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--theme-space-sm);
  margin-top: calc(-1 * var(--theme-space-xl));
  margin-bottom: var(--theme-space-md);
}

.discovery__search {
  position: relative;
  flex: 1;
  min-width: 0;
}

.discovery__search .discovery__input {
  width: 100%;
  padding-left: 2rem;
}

.discovery__search-icon {
  position: absolute;
  left: var(--theme-space-xs);
  top: 50%;
  transform: translateY(-50%);
  font-size: 1rem;
  color: var(--theme-text-muted);
  pointer-events: none;
}

.discovery__label {
  display: block;
  font-size: var(--theme-font-xs);
  font-weight: 500;
  color: var(--theme-text-secondary);
  margin-bottom: 0.25rem;
}

.discovery__input,
.discovery__select {
  padding: 0.375rem var(--theme-space-sm);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-primary);
  background: var(--theme-bg-card);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  min-height: 32px;
}

.discovery__input:focus,
.discovery__select:focus {
  outline: none;
  border-color: var(--theme-primary);
}

.discovery__filters {
  display: flex;
  gap: var(--theme-space-sm);
  flex-wrap: wrap;
}

.discovery__filter {
  min-width: 120px;
}

.discovery__empty {
  padding: var(--theme-space-md);
  text-align: center;
  color: var(--theme-text-muted);
}

.discovery__empty-text {
  margin: 0 0 0.25rem;
  font-size: var(--theme-font-sm);
}

.discovery__empty-hint {
  margin: 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.discovery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 320px));
  gap: var(--theme-space-md);
  justify-content: start;
}
</style>
