<template>
  <PageSection>
    <div class="home">
      <DguildInfoBanner
        :name="displayName"
        :welcome-message="tenant?.welcomeMessage"
        :description="tenant?.description"
        :logo="brandLogo"
        :homepage="tenant?.homepage"
        :discord="tenant?.discordServerInviteLink"
        :x-link="tenant?.xLink"
        :telegram="tenant?.telegramLink"
      />
      <section v-if="displayModules.length" class="home__modules" aria-label="Module list">
        <div class="home__grid">
          <NuxtLink
            v-for="entry in displayModules"
            :key="entry.id"
            :to="moduleLink(entry)"
            class="home__card-link"
          >
            <Card class="home__card !p-0 !gap-0">
              <span class="home__card-bg-icon" aria-hidden="true">
                <Icon :icon="entry.icon" height="none" class="home__card-bg-icon-svg" />
              </span>
              <CardContent class="home__card-trigger !px-3 !pt-3 !pb-3">
                <div class="home__card-header">
                  <div class="home__card-heading">
                    <span class="home__card-name-row">
                      <span class="home__card-name">{{ entry.name }}</span>
                      <Badge v-if="entry.status === 'coming_soon'" variant="brand">Coming soon</Badge>
                    </span>
                  </div>
                </div>
                <p v-if="entry.shortDescription" class="home__card-preview">
                  {{ entry.shortDescription }}
                </p>
                <span class="home__card-chevron" aria-hidden="true">
                  <Icon icon="mdi:chevron-right" class="home__card-chevron-icon" />
                </span>
              </CardContent>
            </Card>
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
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Icon } from '@iconify/vue'
import DguildInfoBanner from '~/components/home/DguildInfoBanner.vue'
import { useThemeStore } from '@decentraguild/ui'
import { getModuleCatalogEntry } from '@decentraguild/catalog'
import type { ModuleCatalogEntry } from '@decentraguild/catalog'
import { useTenantStore } from '~/stores/tenant'
import { useNavModules } from '~/composables/core/useNavModules'
import { useTenantInLinks } from '~/composables/core/useTenantInLinks'
import { useAuth } from '@decentraguild/auth'

const themeStore = useThemeStore()
const tenantStore = useTenantStore()
const auth = useAuth()
const tenant = computed(() => tenantStore.tenant)
const { navModules } = useNavModules()

const displayName = computed(
  () => (themeStore.branding.name ?? tenant.value?.name) || 'dGuild',
)
const brandLogo = computed(
  () => themeStore.branding.logo ?? tenant.value?.branding?.logo ?? '',
)

const showConnectCta = computed(() => !auth.wallet.value)

const displayModules = computed(() => {
  return navModules.value
    .map((m) => getModuleCatalogEntry(m.id))
    .filter((e): e is ModuleCatalogEntry => !!e?.routePath)
})

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
.home__modules {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  margin-top: var(--theme-space-md);
}

.home__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--theme-space-sm);
}

@media (min-width: 640px) {
  .home__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1024px) {
  .home__grid {
    grid-template-columns: repeat(4, 1fr);
    gap: var(--theme-space-md);
  }
}

.home__card {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100px;
  background: radial-gradient(circle at top right, rgba(255, 255, 255, 0.04), transparent 55%),
    var(--theme-bg-card);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  text-decoration: none;
  color: inherit;
}

.home__card-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

.home__card-link:hover .home__card {
  border-color: var(--theme-primary);
  transform: translateY(-2px);
  box-shadow: var(--theme-shadow-glow), 0 16px 40px rgba(0, 0, 0, 0.3);
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
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: var(--theme-space-sm) var(--theme-space-md);
  background: none;
  border: none;
  color: var(--theme-text-primary);
  transition: background-color 0.15s ease;
}

.home__card-link:hover .home__card-trigger {
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
  margin-top: auto;
  color: var(--theme-text-muted);
}

.home__card-chevron-icon {
  font-size: 1.25rem;
}

.home__cta {
  margin-top: var(--theme-space-lg);
}
</style>
