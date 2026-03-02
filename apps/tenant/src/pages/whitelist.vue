<template>
  <PageSection title="Whitelist">
    <div class="whitelist-page">
      <div v-if="!whitelistVisible" class="whitelist-page__inactive">
        <p>Whitelist is not enabled for this dGuild.</p>
      </div>

      <Card v-else class="whitelist-page__card">
        <template v-if="!wallet">
          <p class="whitelist-page__hint">Connect your wallet (use the Connect button above) to view your whitelist memberships.</p>
        </template>

        <template v-else-if="loading">
          <p class="whitelist-page__loading">
            <Icon icon="mdi:loading" class="whitelist-page__spinner" />
            Loading…
          </p>
        </template>

        <template v-else-if="memberships.length === 0">
          <p class="whitelist-page__empty">You are not on any whitelists for this community.</p>
        </template>

        <template v-else>
          <h3 class="whitelist-page__heading">Your memberships</h3>
          <p class="whitelist-page__intro">You are listed on the following whitelists.</p>
          <ul class="whitelist-page__list">
            <li
              v-for="m in memberships"
              :key="m.address"
              class="whitelist-page__item"
            >
              <span class="whitelist-page__name">{{ m.name }}</span>
              <code class="whitelist-page__address">{{ shortenAddress(m.address) }}</code>
            </li>
          </ul>
        </template>
      </Card>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
import { getModuleState, isModuleVisibleToMembers } from '@decentraguild/core'
import { PageSection, Card } from '@decentraguild/ui/components'
import { Icon } from '@iconify/vue'
import { useAuth } from '@decentraguild/auth'
import { API_V1 } from '~/utils/apiBase'
import { useApiBase } from '~/composables/useApiBase'
import { useTenantStore } from '~/stores/tenant'

const tenantStore = useTenantStore()
const auth = useAuth()
const apiBase = useApiBase()

const tenant = computed(() => tenantStore.tenant)
const slug = computed(() => tenantStore.slug ?? '')
const wallet = computed(() => auth.wallet.value ?? null)

const whitelistState = computed(() => getModuleState(tenant.value?.modules?.whitelist))
const whitelistVisible = computed(() => isModuleVisibleToMembers(whitelistState.value))

interface Membership {
  address: string
  name: string
}

const memberships = ref<Membership[]>([])
const loading = ref(true)

function shortenAddress(addr: string): string {
  if (addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

async function fetchMemberships() {
  const s = slug.value
  const w = wallet.value
  if (!s || !w) {
    memberships.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${s}/whitelist/my-memberships?wallet=${encodeURIComponent(w)}`,
      { credentials: 'include' }
    )
    if (!res.ok) {
      memberships.value = []
      return
    }
    const data = (await res.json()) as { memberships?: Membership[] }
    memberships.value = data.memberships ?? []
  } catch {
    memberships.value = []
  } finally {
    loading.value = false
  }
}

watch([slug, wallet], () => fetchMemberships(), { immediate: true })
</script>

<style scoped>
.whitelist-page__inactive,
.whitelist-page__hint,
.whitelist-page__empty {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.whitelist-page__card {
  max-width: 32rem;
}
.whitelist-page__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  margin: 0;
  font-size: var(--theme-font-sm);
}
.whitelist-page__spinner {
  animation: whitelist-page-spin 1s linear infinite;
}
@keyframes whitelist-page-spin {
  to { transform: rotate(360deg); }
}
.whitelist-page__heading {
  font-size: var(--theme-font-lg);
  margin: 0 0 var(--theme-space-sm);
}
.whitelist-page__intro {
  margin: 0 0 var(--theme-space-md);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.whitelist-page__list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.whitelist-page__item {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  padding: var(--theme-space-sm) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}
.whitelist-page__item:last-child {
  border-bottom: none;
}
.whitelist-page__name {
  font-weight: 500;
}
.whitelist-page__address {
  font-size: var(--theme-font-xs);
  background: var(--theme-bg-secondary);
  padding: 2px var(--theme-space-xs);
  border-radius: var(--theme-radius-sm);
}
</style>
