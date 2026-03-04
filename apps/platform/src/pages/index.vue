<template>
  <div class="discovery-page">
    <div v-if="loading" class="discovery__loading">Loading...</div>
    <div v-else-if="error" class="discovery__error">{{ error }}</div>
    <div v-else class="discovery">
      <div class="discovery__bar">
        <div class="discovery__search">
          <label for="discovery-search" class="discovery__label">Search</label>
          <input
            id="discovery-search"
            v-model="searchQuery"
            type="search"
            class="discovery__input"
            placeholder="Search dGuilds"
            autocomplete="off"
            aria-label="Search dGuilds"
          />
          <Icon icon="mdi:magnify" class="discovery__search-icon" aria-hidden="true" />
        </div>
        <div class="discovery__filters">
          <div class="discovery__filter">
            <label for="discovery-module" class="discovery__label">Module</label>
            <select
              id="discovery-module"
              :value="moduleFilter ?? ''"
              class="discovery__select"
              aria-label="Filter by module"
              @change="onModuleFilterChange"
            >
              <option value="">Any module</option>
              <option
                v-for="opt in moduleFilterOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="discovery__filter">
            <label for="discovery-access" class="discovery__label">Access</label>
            <select
              id="discovery-access"
              v-model="accessFilter"
              class="discovery__select"
              aria-label="Filter by access"
            >
              <option value="any">Any</option>
              <option value="public">Public</option>
              <option value="whitelist">Whitelist gated</option>
            </select>
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
          :has-whitelist="hasWhitelist(t)"
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
import { useApiBase } from '~/composables/useApiBase'

const config = useRuntimeConfig()
const apiBase = useApiBase()
const tenants = ref<TenantConfig[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await fetch(`${apiBase.value}/api/v1/tenants`)
    if (!res.ok) throw new Error('Failed to fetch')
    const data = await res.json()
    tenants.value = data.tenants ?? []
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
  hasWhitelist,
  activeModulesWithGate,
  moduleFilterOptions,
  filteredTenants,
} = useDiscoveryFilters(tenants)

function onModuleFilterChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value
  moduleFilter.value = val === '' ? null : val
}
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
