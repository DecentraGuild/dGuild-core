<template>
  <PageSection title="Member lists" module-id="gates">
    <div class="gates-page">
      <div v-if="!gatesVisible" class="gates-page__inactive">
        <p>Member lists is not enabled for this dGuild.</p>
      </div>

      <div v-else-if="gatesGated" class="gates-page__inactive">
        <p>You need to be on the list to view Member lists for this community.</p>
      </div>

      <div v-else class="gates-page__content">
        <div class="gates-page__header">
          <p v-if="!wallet && !loading && memberships.length === 0" class="gates-page__hint">
            Connect your wallet (use the Connect button above) to view your gate memberships.
          </p>
          <p v-else-if="loading" class="gates-page__loading">
            <Icon icon="lucide:loader-2" class="gates-page__spinner" />
            Loading…
          </p>
          <p v-else-if="memberships.length === 0" class="gates-page__empty">
            You are not on any member lists for this community.
          </p>
          <div v-else>
            <h3 class="gates-page__heading">Your memberships</h3>
            <p class="gates-page__intro">You are listed on the following member lists.</p>
          </div>
        </div>

        <div v-if="!loading && memberships.length > 0" class="gates-page__layout layout-split">
          <div class="gates-page__grid layout-split__main admin__card-grid--auto-dense">
            <button
              v-for="m in memberships"
              :key="m.address"
              type="button"
              class="gates-page__card-item"
              :class="{ 'gates-page__card-item--active': m.address === selectedListAddress }"
              :style="cardBackgroundStyle(m)"
              @click="selectList(m)"
            >
              <div class="gates-page__card-overlay" />
              <div class="gates-page__card-content">
                <span class="gates-page__card-name">{{ m.name }}</span>
              </div>
            </button>
          </div>

          <aside v-if="selectedListAddress" class="gates-page__detail layout-split__sidebar">
            <h4 class="gates-page__detail-heading">
              Members of {{ selectedListName }}
            </h4>
            <p v-if="membersLoading" class="gates-page__loading">
              <Icon icon="lucide:loader-2" class="gates-page__spinner" />
              Loading members…
            </p>
            <p v-else-if="memberWallets.length === 0" class="gates-page__empty">
              No wallets on this list yet.
            </p>
            <ul v-else class="gates-page__member-list">
              <li
                v-for="addr in memberWallets"
                :key="addr"
                class="gates-page__member-item"
              >
                <code class="gates-page__address">{{ addr }}</code>
                <button
                  type="button"
                  class="gates-page__copy-btn"
                  @click="copyAddress(addr)"
                >
                  <Icon icon="lucide:copy" class="gates-page__copy-icon" />
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
definePageMeta({ middleware: 'gates-module' })

import { getModuleState, isModuleVisibleToMembers } from '@decentraguild/core'
import { Icon } from '@iconify/vue'
import { useAuth } from '@decentraguild/auth'
import { invokeEdgeFunction } from '@decentraguild/nuxt-composables'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import { useEffectiveGate } from '~/composables/gates/useEffectiveGate'
import { useWalletOnList } from '~/composables/gates/useWalletOnList'

const tenantStore = useTenantStore()
const auth = useAuth()

const tenant = computed(() => tenantStore.tenant)
const tenantId = computed(() => tenantStore.tenantId)
const _slug = computed(() => tenantStore.slug ?? '')
/** Use whichever is available first: connector (adapter) or session (fetchMe). Speeds up load after login. */
const wallet = computed(
  () => auth.connectorState.value?.account ?? auth.wallet.value ?? null
)

const gatesState = computed(() => getModuleState(tenant.value?.modules?.gates))
const gatesVisible = computed(() => isModuleVisibleToMembers(gatesState.value))

const marketplaceSettings = computed(() => tenantStore.marketplaceSettings)
const raffleSettings = computed(() => tenantStore.raffleSettings)
const effectiveGatesWhitelist = useEffectiveGate(tenant, 'gates', {
  marketplaceSettings,
  raffleSettings,
})
const gatesListAddress = computed(() => {
  const v = effectiveGatesWhitelist.value
  return v && typeof v === 'object' && v.account ? v.account.trim() || null : null
})
const { isListed: isOnGatesList } = useWalletOnList(gatesListAddress)
const isAdmin = computed(() => {
  const w = wallet.value
  const admins = tenant.value?.admins ?? []
  return !!(w && admins.includes(w))
})
const gatesGated = computed(() => {
  const eff = effectiveGatesWhitelist.value
  if (eff === 'admin-only') return !isAdmin.value
  if (eff && typeof eff === 'object' && eff.account) return !isOnGatesList.value
  return false
})

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

async function fetchMemberships() {
  const id = tenantId.value
  if (!id || !gatesVisible.value) {
    memberships.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const supabase = useSupabase()
    const data = await invokeEdgeFunction<{ memberships?: Membership[] }>(supabase, 'gates', { action: 'my-memberships', tenantId: id })
    memberships.value = data.memberships ?? []
  } catch {
    memberships.value = []
  } finally {
    loading.value = false
  }
}

async function fetchMembersForSelected() {
  const addr = selectedListAddress.value
  if (!addr) {
    memberWallets.value = []
    return
  }
  membersLoading.value = true
  try {
    const supabase = useSupabase()
    const data = await invokeEdgeFunction<{ entries?: string[] }>(supabase, 'gates', { action: 'entries-public', listAddress: addr })
    memberWallets.value = data.entries ?? []
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

watch([tenantId, gatesVisible], () => fetchMemberships(), { immediate: true })
watch(wallet, () => {
  if (wallet.value && gatesVisible.value) void fetchMemberships()
})
</script>

<style scoped>
.gates-page__inactive,
.gates-page__hint,
.gates-page__empty {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}
.gates-page__content {
  padding: var(--theme-space-md) 0;
}
.gates-page__header {
  margin-bottom: var(--theme-space-md);
}
.gates-page__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  margin: 0;
  font-size: var(--theme-font-sm);
}
.gates-page__spinner {
  animation: gates-page-spin 1s linear infinite;
}
@keyframes gates-page-spin {
  to { transform: rotate(360deg); }
}
.gates-page__heading {
  font-size: var(--theme-font-lg);
  margin: 0 0 var(--theme-space-sm);
}
.gates-page__intro {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}


.gates-page__card-item {
  position: relative;
  overflow: hidden;
  border-radius: var(--theme-radius-md);
  border: var(--theme-border-thin) solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
  background-size: cover;
  background-position: center;
  cursor: pointer;
  padding: 0;
  min-height: 140px;
}

.gates-page__card-item:hover {
  border-color: var(--theme-primary);
}

.gates-page__card-item--active {
  border-color: var(--theme-primary);
  box-shadow: var(--theme-shadow-glow);
}

.gates-page__card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.3));
}

.gates-page__card-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  height: 100%;
  padding: var(--theme-space-sm) var(--theme-space-md);
}

.gates-page__card-name {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.gates-page__detail {
  flex-shrink: 0;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: var(--theme-space-md);
  border-radius: var(--theme-radius-lg);
  border: var(--theme-border-thin) solid var(--theme-border);
  background: var(--theme-bg-card);
}

.gates-page__detail-heading {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-md);
}

.gates-page__member-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.gates-page__member-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-space-sm);
  padding: var(--theme-space-xs) 0;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.gates-page__member-item:last-child {
  border-bottom: none;
}

.gates-page__address {
  font-size: var(--theme-font-xs);
  background: var(--theme-bg-secondary);
  padding: 2px var(--theme-space-xs);
  border-radius: var(--theme-radius-sm);
  word-break: break-all;
  overflow-wrap: anywhere;
}

@media (min-width: 1024px) {
  .gates-page__detail {
    max-width: 320px;
  }
}

.gates-page__copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--theme-text-muted);
  cursor: pointer;
}

.gates-page__copy-icon {
  font-size: 0.9rem;
}

</style>
