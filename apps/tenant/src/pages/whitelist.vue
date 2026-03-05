<template>
  <PageSection title="Whitelist">
    <div class="whitelist-page">
      <div v-if="!whitelistVisible" class="whitelist-page__inactive">
        <p>Whitelist is not enabled for this dGuild.</p>
      </div>

      <div v-else class="whitelist-page__content">
        <div class="whitelist-page__header">
          <p v-if="!wallet" class="whitelist-page__hint">
            Connect your wallet (use the Connect button above) to view your whitelist memberships.
          </p>
          <p v-else-if="loading" class="whitelist-page__loading">
            <Icon icon="mdi:loading" class="whitelist-page__spinner" />
            Loading…
          </p>
          <p v-else-if="memberships.length === 0" class="whitelist-page__empty">
            You are not on any whitelists for this community.
          </p>
          <div v-else>
            <h3 class="whitelist-page__heading">Your memberships</h3>
            <p class="whitelist-page__intro">You are listed on the following whitelists.</p>
          </div>
        </div>

        <div v-if="wallet && !loading && memberships.length > 0" class="whitelist-page__layout">
          <div class="whitelist-page__grid">
            <button
              v-for="m in memberships"
              :key="m.address"
              type="button"
              class="whitelist-page__card-item"
              :class="{ 'whitelist-page__card-item--active': m.address === selectedListAddress }"
              :style="cardBackgroundStyle(m)"
              @click="selectList(m)"
            >
              <div class="whitelist-page__card-overlay" />
              <div class="whitelist-page__card-content">
                <span class="whitelist-page__card-name">{{ m.name }}</span>
              </div>
            </button>
          </div>

          <aside v-if="selectedListAddress" class="whitelist-page__detail">
            <h4 class="whitelist-page__detail-heading">
              Members of {{ selectedListName }}
            </h4>
            <p v-if="membersLoading" class="whitelist-page__loading">
              <Icon icon="mdi:loading" class="whitelist-page__spinner" />
              Loading members…
            </p>
            <p v-else-if="memberWallets.length === 0" class="whitelist-page__empty">
              No wallets on this list yet.
            </p>
            <ul v-else class="whitelist-page__member-list">
              <li
                v-for="addr in memberWallets"
                :key="addr"
                class="whitelist-page__member-item"
              >
                <code class="whitelist-page__address">{{ addr }}</code>
                <button
                  type="button"
                  class="whitelist-page__copy-btn"
                  @click="copyAddress(addr)"
                >
                  <Icon icon="mdi:content-copy" class="whitelist-page__copy-icon" />
                </button>
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
import { getModuleState, isModuleVisibleToMembers } from '@decentraguild/core'
import { PageSection } from '@decentraguild/ui/components'
import { Icon } from '@iconify/vue'
import { useAuth } from '@decentraguild/auth'
import { API_V1 } from '~/utils/apiBase'
import { useApiBase } from '~/composables/useApiBase'
import { useTenantStore } from '~/stores/tenant'

const tenantStore = useTenantStore()
const auth = useAuth()
const apiBase = useApiBase()

const tenant = computed(() => tenantStore.tenant)
const tenantId = computed(() => tenantStore.tenantId)
const slug = computed(() => tenantStore.slug ?? '')
const wallet = computed(() => auth.wallet.value ?? null)

const whitelistState = computed(() => getModuleState(tenant.value?.modules?.whitelist))
const whitelistVisible = computed(() => isModuleVisibleToMembers(whitelistState.value))

interface Membership {
  address: string
  name: string
  imageUrl?: string | null
}

const memberships = ref<Membership[]>([])
const loading = ref(true)
const selectedListAddress = ref<string | null>(null)
const selectedListName = ref<string | null>(null)
const memberWallets = ref<string[]>([])
const membersLoading = ref(false)

function shortenAddress(addr: string): string {
  if (addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

async function fetchMemberships() {
  const id = tenantId.value
  const w = wallet.value
  if (!id || !w) {
    memberships.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${id}/whitelist/my-memberships?wallet=${encodeURIComponent(w)}`,
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

async function fetchMembersForSelected() {
  const id = tenantId.value
  const addr = selectedListAddress.value
  if (!id || !addr) {
    memberWallets.value = []
    return
  }
  membersLoading.value = true
  try {
    const res = await fetch(
      `${apiBase.value}${API_V1}/tenant/${id}/whitelist/lists/${addr}/entries-public`,
      { credentials: 'include' }
    )
    if (!res.ok) {
      memberWallets.value = []
      return
    }
    const data = (await res.json()) as { entries?: { wallet: string }[] }
    memberWallets.value = (data.entries ?? []).map((e) => e.wallet)
  } catch {
    memberWallets.value = []
  } finally {
    membersLoading.value = false
  }
}

function selectList(m: Membership) {
  selectedListAddress.value = m.address
  selectedListName.value = m.name
  fetchMembersForSelected()
}

function cardBackgroundStyle(m: Membership) {
  if (!m.imageUrl) {
    return {}
  }
  return {
    backgroundImage: `url(${m.imageUrl})`,
  }
}

async function copyAddress(addr: string) {
  try {
    await navigator.clipboard.writeText(addr)
  } catch {
    // ignore
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
.whitelist-page__content {
  padding: var(--theme-space-md) 0;
}
.whitelist-page__header {
  margin-bottom: var(--theme-space-md);
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
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.whitelist-page__layout {
  display: flex;
  gap: var(--theme-space-xl);
  align-items: flex-start;
}

.whitelist-page__grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--theme-space-md);
  min-width: 0;
}

.whitelist-page__card-item {
  position: relative;
  overflow: hidden;
  border-radius: var(--theme-radius-md);
  border: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
  background-size: cover;
  background-position: center;
  cursor: pointer;
  padding: 0;
  min-height: 140px;
}

.whitelist-page__card-item--active {
  border-color: var(--theme-primary);
}

.whitelist-page__card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.3));
}

.whitelist-page__card-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  height: 100%;
  padding: var(--theme-space-sm) var(--theme-space-md);
}

.whitelist-page__card-name {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: #fff;
}

.whitelist-page__detail {
  flex-shrink: 0;
  width: 320px;
  padding: var(--theme-space-md);
  border-radius: var(--theme-radius-lg);
  border: var(--theme-border-thin) solid var(--theme-border);
  background: var(--theme-bg-card);
}

.whitelist-page__detail-heading {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-md);
}

.whitelist-page__member-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.whitelist-page__member-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-space-sm);
  padding: var(--theme-space-xs) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.whitelist-page__member-item:last-child {
  border-bottom: none;
}

.whitelist-page__address {
  font-size: var(--theme-font-xs);
  background: var(--theme-bg-secondary);
  padding: 2px var(--theme-space-xs);
  border-radius: var(--theme-radius-sm);
}

.whitelist-page__copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--theme-text-muted);
  cursor: pointer;
}

.whitelist-page__copy-icon {
  font-size: 0.9rem;
}

@media (max-width: 900px) {
  .whitelist-page__layout {
    flex-direction: column;
  }

  .whitelist-page__detail {
    width: 100%;
  }
}
</style>
