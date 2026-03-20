<template>
  <AppShell
    :mobile-nav-open="mobileNavOpen"
    @update:mobile-nav-open="mobileNavOpen = $event"
  >
    <ClientOnly>
      <div v-if="tenantStore.error" class="tenant-error">
        {{ tenantStore.error }}
        <span class="tenant-error__hint">Ensure the API is running and the tenant slug exists.</span>
      </div>
      <template #fallback />
    </ClientOnly>
    <template v-if="!showTenantGatedMessage" #header>
      <AppHeader
        :logo="headerLogo"
        :name="headerName"
      >
        <template #leading>
          <button
            type="button"
            class="layout-nav-toggle"
            aria-label="Open menu"
            @click="mobileNavOpen = true"
          >
            <Icon icon="lucide:menu" />
          </button>
        </template>
        <template #nav>
          <nav v-if="subnavTabs.length" class="layout-subnav">
            <template v-if="isAdminSubnav">
              <NuxtLink
                v-for="tab in adminPrimaryTabs"
                :key="tab.id"
                :to="tab.path ? linkTo(tab.path) : linkToWithTab(route.path, tab.id)"
                class="layout-subnav__tab"
                :class="{ 'layout-subnav__tab--active': isSubnavTabActive(tab) }"
              >
                {{ tab.label }}
              </NuxtLink>
              <div
                v-if="adminShowMoreDropdown"
                ref="adminMoreWrapRef"
                class="layout-subnav__more-wrap"
                :aria-expanded="adminMoreOpen"
              >
                <button
                  type="button"
                  class="layout-subnav__tab layout-subnav__tab--more"
                  :class="{ 'layout-subnav__tab--active': adminMoreTabs.some((t) => isSubnavTabActive(t)) }"
                  aria-haspopup="true"
                  :aria-expanded="adminMoreOpen"
                  @click="adminMoreOpen = !adminMoreOpen"
                >
                  More
                  <Icon icon="lucide:chevron-down" class="layout-subnav__more-icon" />
                </button>
                <Teleport v-if="adminMoreOpen" to="body">
                  <div
                    class="layout-subnav__dropdown layout-subnav__dropdown--fixed"
                    :style="adminMoreDropdownStyle"
                    @click="closeAdminMore"
                  >
                    <NuxtLink
                      v-for="tab in adminMoreTabs"
                      :key="tab.id"
                      :to="tab.path ? linkTo(tab.path) : linkToWithTab(route.path, tab.id)"
                      class="layout-subnav__dropdown-tab"
                      :class="{ 'layout-subnav__dropdown-tab--active': isSubnavTabActive(tab) }"
                    >
                      {{ tab.label }}
                    </NuxtLink>
                  </div>
                </Teleport>
              </div>
              <NuxtLink
                v-if="adminVouchersTab"
                :to="adminVouchersTab.path ? linkTo(adminVouchersTab.path) : linkToWithTab(route.path, adminVouchersTab.id)"
                class="layout-subnav__tab"
                :class="{ 'layout-subnav__tab--active': isSubnavTabActive(adminVouchersTab) }"
              >
                {{ adminVouchersTab.label }}
              </NuxtLink>
              <NuxtLink
                v-if="adminBillingTab"
                :to="adminBillingTab.path ? linkTo(adminBillingTab.path) : linkToWithTab(route.path, adminBillingTab.id)"
                class="layout-subnav__tab"
                :class="{ 'layout-subnav__tab--active': isSubnavTabActive(adminBillingTab) }"
              >
                {{ adminBillingTab.label }}
              </NuxtLink>
            </template>
            <template v-else>
              <NuxtLink
                v-for="tab in subnavTabs"
                :key="tab.id"
                :to="tab.path ? linkTo(tab.path) : linkToWithTab(route.path, tab.id)"
                class="layout-subnav__tab"
                :class="{ 'layout-subnav__tab--active': isSubnavTabActive(tab) }"
              >
                {{ tab.label }}
              </NuxtLink>
            </template>
          </nav>
        </template>
        <template #actions>
          <AuthWidget />
        </template>
      </AppHeader>
    </template>
    <template v-if="!showTenantGatedMessage" #nav>
      <div class="layout-nav">
        <AppNav>
          <NavLink :to="linkTo('/')" icon="lucide:home">Home</NavLink>
          <NavLink
            v-for="mod in navModules"
            :key="mod.id"
            :to="linkTo(mod.path)"
            :icon="mod.icon"
          >
            {{ mod.label }}
          </NavLink>
        </AppNav>
        <a
          :href="discoverUrl"
          target="_blank"
          rel="noopener"
          class="layout-nav__discover"
        >
          <Icon icon="lucide:compass" class="layout-nav__discover-icon" />
          <span>Discover</span>
        </a>
      </div>
    </template>
    <div v-if="showTenantGatedMessage" class="tenant-gated">
      <p class="tenant-gated__message">This community is gated. You need to be on the whitelist to access it.</p>
    </div>
    <slot v-else />
    <ClientOnly>
      <TransactionToastContainer
        :store="useTransactionNotificationsStore()"
        :get-tx-url="(s) => useExplorerLinks().txUrl(s)"
      />
    </ClientOnly>
  </AppShell>
</template>

<script setup lang="ts">
import { AuthWidget, useAuth } from '@decentraguild/auth'
import { Icon } from '@iconify/vue'
import { useThemeStore } from '@decentraguild/ui'
import { useTenantStore } from '~/stores/tenant'
import { isModuleVisibleToMembers, getModuleState } from '@decentraguild/core'
import {
  getModuleSubnavForPath,
  ADMIN_PRIMARY_TAB_IDS,
  ADMIN_MORE_TAB_IDS,
  compareAdminMoreTabsByCatalogOrder,
} from '~/config/modules'
import { onClickOutside, useEventListener } from '@vueuse/core'
import { useEffectiveGate } from '~/composables/gates/useEffectiveGate'
import { useWalletOnList } from '~/composables/gates/useWalletOnList'
import { useExplorerLinks } from '~/composables/core/useExplorerLinks'
import { useNavModules } from '~/composables/core/useNavModules'
import { useTenantInLinks } from '~/composables/core/useTenantInLinks'
import { useTransactionNotificationsStore } from '~/stores/transactionNotifications'

const config = useRuntimeConfig()
const discoverUrl = (config.public.platformBaseUrl as string)?.replace(/\/$/, '') || (import.meta.env.PROD ? 'https://dguild.org' : 'http://localhost:3000')

const route = useRoute()
const tenantStore = useTenantStore()
const themeStore = useThemeStore()
const mobileNavOpen = ref(false)

watch(() => route.path, () => {
  mobileNavOpen.value = false
  adminMoreOpen.value = false
})

const tenant = computed(() => tenantStore.tenant)

// Header branding only after client mount so SSR and first client paint match (avoids hydration mismatch: server span vs client img).
const headerLogo = ref('')
const headerName = ref('dGuild')
const tenantName = computed(() => (themeStore.branding.name ?? tenant.value?.name) || 'dGuild')
const isMarketPath = computed(() => route.path === '/market' || route.path.startsWith('/market/'))
function updateHeaderBranding() {
  headerLogo.value = themeStore.branding.logo ?? ''
  headerName.value = isMarketPath.value
    ? `Marketplace [${tenantName.value}]`
    : tenantName.value
}
onMounted(updateHeaderBranding)
watch(
  () => [themeStore.branding.logo, themeStore.branding.name, tenant.value?.name, route.path],
  updateHeaderBranding
)

const tenantDefaultListAddress = computed(() => {
  const g = tenant.value?.defaultGate
  if (g === 'admin-only') return null
  const acc = g?.account
  return (acc && acc.trim()) || null
})

const tenantDefaultIsAdminOnly = computed(() => tenant.value?.defaultGate === 'admin-only')

const marketplaceSettings = computed(() => tenantStore.marketplaceSettings)
const raffleSettings = computed(() => tenantStore.raffleSettings)

const effectiveMarketplaceWhitelist = useEffectiveGate(tenant, 'marketplace', {
  marketplaceSettings,
  raffleSettings,
})

const effectiveRaffleWhitelist = useEffectiveGate(tenant, 'raffles', {
  marketplaceSettings,
  raffleSettings,
})

const { isListed: isOnTenantDefaultList } = useWalletOnList(tenantDefaultListAddress)

const hasAnyPublicModule = computed(() => {
  if (tenant.value?.modules?.marketplace && isModuleVisibleToMembers(getModuleState(tenant.value.modules.marketplace)) && effectiveMarketplaceWhitelist.value === null) return true
  if (tenant.value?.modules?.raffles && isModuleVisibleToMembers(getModuleState(tenant.value.modules.raffles)) && effectiveRaffleWhitelist.value === null) return true
  return false
})

const isAdmin = computed(() => {
  const w = useAuth().wallet.value
  const admins = tenant.value?.admins ?? []
  return !!(w && admins.includes(w))
})

const showTenantGatedMessage = computed(() => {
  if (tenantDefaultIsAdminOnly.value && isAdmin.value) return false
  if (tenantDefaultIsAdminOnly.value && !isAdmin.value) return true
  if (!tenantDefaultListAddress.value) return false
  if (isOnTenantDefaultList.value === true) return false
  if (hasAnyPublicModule.value) return false
  return true
})

const { navModules } = useNavModules()

const subnavTabs = computed(() => getModuleSubnavForPath(route.path, tenant.value) ?? [])

const isAdminSubnav = computed(() => {
  const tabs = subnavTabs.value
  return tabs.length > 0 && route.path === '/admin'
})

const adminPrimaryTabs = computed(() =>
  subnavTabs.value.filter((t) => ADMIN_PRIMARY_TAB_IDS.includes(t.id))
)
const adminMoreTabs = computed(() =>
  [...subnavTabs.value.filter((t) => ADMIN_MORE_TAB_IDS.includes(t.id))].sort(
    compareAdminMoreTabsByCatalogOrder,
  )
)
const adminVouchersTab = computed(() =>
  subnavTabs.value.find((t) => t.id === 'vouchers')
)
const adminBillingTab = computed(() =>
  subnavTabs.value.find((t) => t.id === 'billing')
)
const adminShowMoreDropdown = computed(() => isAdminSubnav.value && adminMoreTabs.value.length > 0)

const adminMoreOpen = ref(false)
const adminMoreWrapRef = ref<HTMLElement | null>(null)
const adminMoreDropdownPosition = ref({ top: 0, left: 0 })

function updateAdminMoreDropdownPosition() {
  const el = adminMoreWrapRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  adminMoreDropdownPosition.value = {
    top: rect.bottom + 2,
    left: rect.left,
  }
}

const adminMoreDropdownStyle = computed(() => {
  const { top, left } = adminMoreDropdownPosition.value
  return { top: `${top}px`, left: `${left}px` }
})

watch(adminMoreOpen, (open) => {
  if (open) {
    updateAdminMoreDropdownPosition()
  }
})

onClickOutside(adminMoreWrapRef, () => {
  adminMoreOpen.value = false
})

useEventListener('scroll', () => {
  if (adminMoreOpen.value) updateAdminMoreDropdownPosition()
}, true)
useEventListener('resize', () => {
  if (adminMoreOpen.value) updateAdminMoreDropdownPosition()
})

function closeAdminMore() {
  adminMoreOpen.value = false
}

const { shouldAppendTenantToLinks } = useTenantInLinks()

function linkTo(path: string) {
  const slug = tenantStore.slug
  return slug && shouldAppendTenantToLinks.value ? { path, query: { tenant: slug } } : path
}

function linkToWithTab(path: string, tabId: string) {
  const slug = tenantStore.slug
  const query: Record<string, string> = { tab: tabId }
  if (slug && shouldAppendTenantToLinks.value) query.tenant = slug
  return { path, query }
}

function isSubnavTabActive(tab: { id: string; path?: string }): boolean {
  if (tab.path) {
    const p = route.path
    return p === tab.path || (tab.path !== '/' && p.startsWith(tab.path + '/'))
  }
  const tabQuery = route.query.tab as string | undefined
  if (tab.id === 'browse' && (tabQuery === undefined || tabQuery === 'browse')) {
    return route.path === '/market' || route.path.startsWith('/market/')
  }
  return tabQuery === tab.id
}
</script>

<style scoped>
.tenant-error {
  padding: var(--theme-space-md);
  background: var(--theme-surface-error);
  color: var(--theme-text-primary);
  border-bottom: var(--theme-border-thin) solid var(--theme-status-error);
  text-align: center;
  font-size: var(--theme-font-sm);
}
.tenant-error__hint {
  display: block;
  margin-top: var(--theme-space-sm);
  opacity: 0.9;
}

.layout-subnav {
  display: flex;
  gap: var(--theme-space-xs);
  align-items: center;
  flex-wrap: nowrap;
  border-bottom: var(--theme-border-thin) solid var(--theme-border);
}

.layout-subnav__tab {
  flex-shrink: 0;
  padding: var(--theme-space-sm) var(--theme-space-md);
  color: var(--theme-text-secondary);
  text-decoration: none;
  border-radius: var(--theme-radius-md);
  font-size: var(--theme-font-sm);
  transition: color 0.15s, background-color 0.15s;
  border: var(--theme-border-thin) solid transparent;
}

.layout-subnav__tab:hover {
  color: var(--theme-text-primary);
  background: var(--theme-bg-card);
  border-color: var(--theme-border);
}

.layout-subnav__tab--active {
  color: var(--theme-primary);
  background: var(--theme-bg-card);
  position: relative;
  border-color: var(--theme-border);
}

.layout-subnav__tab--active::after {
  content: '';
  position: absolute;
  bottom: calc(-1 * var(--theme-border-thin, 1px));
  left: var(--theme-space-md);
  right: var(--theme-space-md);
  height: 2px;
  background: var(--theme-gradient-primary, var(--theme-primary));
  border-radius: var(--theme-radius-full);
}

.layout-subnav__more-wrap {
  position: relative;
  flex-shrink: 0;
}

.layout-subnav__tab--more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font: inherit;
}

.layout-subnav__more-icon {
  font-size: 1rem;
  opacity: 0.8;
  transition: transform 0.15s;
}

.layout-subnav__more-wrap[aria-expanded='true'] .layout-subnav__more-icon {
  transform: rotate(180deg);
}

.layout-subnav__dropdown {
  min-width: 10rem;
  padding: var(--theme-space-xs);
  background: var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  box-shadow: var(--theme-shadow-card);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.layout-subnav__dropdown--fixed {
  position: fixed;
  z-index: 9999;
}

.layout-subnav__dropdown-tab {
  display: block;
  padding: var(--theme-space-sm) var(--theme-space-md);
  color: var(--theme-text-secondary);
  text-decoration: none;
  border-radius: var(--theme-radius-sm);
  font-size: var(--theme-font-sm);
  transition: color 0.15s, background 0.15s;
}

.layout-subnav__dropdown-tab:hover {
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
}

.layout-subnav__dropdown-tab--active {
  color: var(--theme-primary);
  background: var(--theme-bg-secondary);
}

.layout-nav-toggle {
  display: none;
  align-items: center;
  justify-content: center;
  width: var(--theme-input-height);
  height: var(--theme-input-height);
  padding: 0;
  background: none;
  border: none;
  border-radius: var(--theme-radius-md);
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}

.layout-nav-toggle:hover {
  color: var(--theme-text-primary);
  background: var(--theme-bg-card);
}

@media (max-width: var(--theme-breakpoint-md)) {
  .layout-nav-toggle {
    display: flex;
  }
}

.layout-nav {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.layout-nav__discover {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  margin-top: auto;
  padding: var(--theme-space-sm) var(--theme-space-md);
  color: var(--theme-text-secondary);
  text-decoration: none;
  border-radius: var(--theme-radius-md);
  font-size: var(--theme-font-sm);
  transition: background-color 0.15s, color 0.15s;
}

.layout-nav__discover:hover {
  color: var(--theme-primary);
  background-color: var(--theme-bg-card);
}

.layout-nav__discover-icon {
  font-size: 1.25rem;
}

.tenant-gated {
  padding: var(--theme-space-xl);
  text-align: center;
}

.tenant-gated__message {
  margin: 0;
  font-size: var(--theme-font-md);
  color: var(--theme-text-secondary);
}
</style>
