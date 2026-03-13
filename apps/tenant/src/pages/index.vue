<template>
  <PageSection>
    <div class="home">
      <div class="home__brand">
        <img
          v-if="brandLogo"
          :src="brandLogo"
          :alt="displayName"
          class="home__logo"
        >
        <span v-else class="home__logo-placeholder">{{ displayName.charAt(0) }}</span>
        <h1 class="home__name">{{ displayName }}</h1>
      </div>
      <p v-if="showDescription" class="home__desc">{{ tenant?.description }}</p>
      <section v-if="displayModules.length" class="home__modules" aria-label="Module list">
        <div class="home__grid">
          <NuxtLink
            v-for="entry in displayModules"
            :key="entry.id"
            :to="moduleLink(entry)"
            class="home__card"
          >
            <span class="home__card-bg-icon" aria-hidden="true">
              <Icon :icon="entry.icon" height="none" class="home__card-bg-icon-svg" />
            </span>
            <span class="home__card-trigger">
              <span class="home__card-header">
                <span class="home__card-heading">
                  <span class="home__card-name-row">
                    <span class="home__card-name">{{ entry.name }}</span>
                    <span v-if="entry.status === 'coming_soon'" class="home__card-badge">Coming soon</span>
                  </span>
                </span>
              </span>
              <p v-if="entry.shortDescription" class="home__card-preview">
                {{ entry.shortDescription }}
              </p>
              <span class="home__card-chevron" aria-hidden="true">
                <Icon icon="mdi:chevron-right" class="home__card-chevron-icon" />
              </span>
            </span>
          </NuxtLink>
        </div>
      </section>
      <div v-if="showConnectCta" class="home__cta">
        <Button variant="default" @click="auth.openConnectModal()">
          Connect wallet
        </Button>
      </div>
    </div>
  </PageSection>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Icon } from '@iconify/vue'
import { useThemeStore } from '@decentraguild/ui'
import { getModuleCatalogEntry } from '@decentraguild/config'
import type { ModuleCatalogEntry } from '@decentraguild/config'
import { useTenantStore } from '~/stores/tenant'
import { useNavModules } from '~/composables/core/useNavModules'
import { useTenantInLinks } from '~/composables/core/useTenantInLinks'
import { useAuth } from '@decentraguild/auth'

const themeStore = useThemeStore()
const tenantStore = useTenantStore()
const auth = useAuth()
const tenant = computed(() => tenantStore.tenant)
const { navModules } = useNavModules()

const displayName = ref('dGuild')
const brandLogo = ref('')
const showDescription = ref(false)

const showConnectCta = computed(() => !auth.wallet.value)

const displayModules = computed(() => {
  return navModules.value
    .map((m) => getModuleCatalogEntry(m.id))
    .filter((e): e is ModuleCatalogEntry => !!e?.routePath)
})

function applyTenant() {
  const t = tenantStore.tenant
  displayName.value = (themeStore.branding.name ?? t?.name) || 'dGuild'
  brandLogo.value = themeStore.branding.logo ?? t?.branding?.logo ?? ''
  showDescription.value = Boolean(t?.description)
}
onMounted(applyTenant)
watch([tenant, () => themeStore.branding], applyTenant)

const { shouldAppendTenantToLinks } = useTenantInLinks()

function moduleLink(entry: ModuleCatalogEntry) {
  const path = entry.routePath?.startsWith('/') ? entry.routePath : `/${entry.routePath}`
  if (tenantStore.slug && shouldAppendTenantToLinks.value) {
    return { path, query: { tenant: tenantStore.slug } }
  }
  return { path }
}
</script>

<style scoped>
.home {
  max-width: 56rem;
}

.home__brand {
  display: flex;
  align-items: center;
  gap: var(--theme-space-md);
  margin-bottom: var(--theme-space-md);
}

.home__logo,
.home__logo-placeholder {
  width: 3rem;
  height: 3rem;
  border-radius: var(--theme-radius-md);
  object-fit: cover;
}

.home__logo-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
  font-size: var(--theme-font-xl);
  font-weight: 600;
}

.home__name {
  font-size: var(--theme-font-2xl);
  font-weight: 600;
  margin: 0;
}

.home__desc {
  color: var(--theme-text-secondary);
  margin: 0 0 var(--theme-space-lg);
  font-size: var(--theme-font-sm);
}

.home__modules {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  margin-top: var(--theme-space-md);
}

.home__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--theme-space-md);
}

@media (min-width: var(--theme-breakpoint-sm)) {
  .home__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: var(--theme-breakpoint-lg)) {
  .home__grid {
    grid-template-columns: repeat(4, 1fr);
    gap: var(--theme-space-lg);
  }
}

.home__card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: radial-gradient(circle at top right, rgba(255, 255, 255, 0.04), transparent 55%),
    var(--theme-bg-card);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  text-decoration: none;
  color: inherit;
}

.home__card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
}

.home__card-bg-icon {
  position: absolute;
  right: 10;
  bottom: -2;
  width: 150%;
  height: 150%;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  pointer-events: none;
}

.home__card-bg-icon-svg {
  display: block;
  width: 100%;
  height: 100%;
  color: var(--theme-border-light);
  opacity: 0.4;
}

.home__card-bg-icon-svg :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.home__card-trigger {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  width: 100%;
  padding: var(--theme-space-md);
  background: none;
  border: none;
  color: var(--theme-text-primary);
  transition: background-color 0.15s ease;
}

.home__card:hover .home__card-trigger {
  background: var(--theme-bg-secondary);
}

.home__card-header {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  width: 100%;
}

.home__card-heading {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
}

.home__card-name-row {
  display: flex;
  align-items: center;
  gap: var(--theme-space-xs);
  flex-wrap: wrap;
}

.home__card-badge {
  font-size: 0.6rem;
  line-height: 1.2;
  color: var(--theme-text-muted);
  background: var(--theme-bg-card);
  border: 1px solid var(--theme-border);
  padding: 2px 4px;
  border-radius: var(--theme-radius-sm);
  white-space: nowrap;
}

.home__card-name {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  margin: 0;
}

.home__card-preview {
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.home__card-chevron {
  display: inline-flex;
  align-items: center;
  margin-top: var(--theme-space-xs);
  color: var(--theme-text-muted);
}

.home__card-chevron-icon {
  font-size: 1.25rem;
}

.home__cta {
  margin-top: var(--theme-space-lg);
}
</style>
