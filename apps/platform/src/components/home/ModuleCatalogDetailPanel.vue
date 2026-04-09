<template>
  <div
    v-if="entry"
    class="module-panel"
    role="region"
    :aria-labelledby="MODULE_PANEL_HEADING_ID"
  >
    <span class="module-panel__bg-icon" aria-hidden="true">
      <Icon :icon="leadIcon" height="none" class="module-panel__bg-icon-svg" />
    </span>
    <div
      class="module-panel__cols"
      :class="{ 'module-panel__cols--dguild': isDguild }"
    >
      <div class="module-panel__col module-panel__col--module">
        <p class="module-panel__topic">Module</p>
        <div class="module-panel__col-body module-panel__col-body--module">
          <div class="module-panel__module-inner">
            <h3 :id="MODULE_PANEL_HEADING_ID" class="module-panel__title">{{ entry.name }}</h3>
            <div class="module-panel__badges">
              <Badge v-if="entry.status === 'coming_soon'" variant="outline">Coming soon</Badge>
            </div>
            <p class="module-panel__desc">
              {{ moduleBodyText }}
            </p>
            <a
              v-if="!isDguild"
              :href="docsLink"
              target="_blank"
              rel="noopener"
              class="module-panel__learn-more module-panel__learn-more--inline inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              Learn more
              <Icon icon="mdi:open-in-new" class="size-4" />
            </a>
          </div>
        </div>
      </div>

      <div class="module-panel__col">
        <p class="module-panel__topic">Key features</p>
        <ul v-if="entry.keyInfo?.length" class="module-panel__key-info">
          <li v-for="(item, i) in entry.keyInfo" :key="i">{{ item }}</li>
        </ul>
        <p v-else class="module-panel__muted">—</p>
      </div>

      <div v-if="isDguild" class="module-panel__col module-panel__col--actions">
        <p class="module-panel__topic">Get started</p>
        <ul v-if="dguildPricingLines.length" class="module-panel__dguild-pricing">
          <li v-for="(line, i) in dguildPricingLines" :key="i">{{ line }}</li>
        </ul>
        <div class="module-panel__actions">
          <NuxtLink to="/onboard" class="module-panel__cta">
            <Button class="w-full sm:w-auto">Create org</Button>
          </NuxtLink>
          <a
            :href="docsLink"
            target="_blank"
            rel="noopener"
            class="module-panel__learn-more inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            Learn more
            <Icon icon="mdi:open-in-new" class="size-4" />
          </a>
        </div>
      </div>

      <div v-else class="module-panel__col">
        <p class="module-panel__topic">Pricing</p>
        <div class="module-panel__pricing-block">
          <ul v-if="pricingLines.length" class="module-panel__pricing-list">
            <li v-for="(line, i) in pricingLines" :key="i">{{ line }}</li>
          </ul>
          <div
            v-if="fromPrice"
            class="module-panel__pricing"
            :class="{ 'module-panel__pricing--after-list': pricingLines.length > 0 }"
          >
            <span class="module-panel__pricing-label">From</span>
            {{ fromPrice }}
          </div>
          <p v-else-if="entry.status === 'coming_soon'" class="module-panel__coming-soon">Coming soon</p>
          <p
            v-else-if="!pricingLines.length"
            class="module-panel__muted"
          >
            See module docs for tiers.
          </p>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="module-panel module-panel--empty">
    <p class="module-panel__empty-text">Select a module below.</p>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { ModuleCatalogEntry } from '@decentraguild/catalog'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { useModuleCatalogDisplay } from '~/composables/useModuleCatalogDisplay'
import { stripMarkdownForPanel } from '~/composables/useModulePanelDocText'

const props = defineProps<{
  entry: ModuleCatalogEntry | null
}>()

const MODULE_PANEL_HEADING_ID = 'module-catalog-panel-heading'

const { docsUrl, getFromPrice } = useModuleCatalogDisplay()

const isDguild = computed(() => props.entry?.id === 'dguild')

const leadIcon = computed(() => (isDguild.value ? 'mdi:home' : props.entry?.icon ?? 'mdi:puzzle'))

const fromPrice = computed(() => (props.entry ? getFromPrice(props.entry) : null))

const docsLink = computed(() => (props.entry ? docsUrl(props.entry) : ''))

const moduleBodyText = computed(() => {
  const e = props.entry
  if (!e) return ''
  if (e.id === 'dguild') {
    return e.longDescription || e.shortDescription
  }
  const raw = e.docs?.overview ?? e.longDescription ?? e.shortDescription
  return stripMarkdownForPanel(raw)
})

function parsePricingLines(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .trim()
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const pricingLines = computed(() => parsePricingLines(props.entry?.docs?.pricing))

const dguildPricingLines = computed(() =>
  isDguild.value ? parsePricingLines(props.entry?.docs?.pricing) : [],
)
</script>

<style scoped>
.module-panel {
  position: relative;
  background: var(--theme-bg-card);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  padding: var(--theme-space-md);
  overflow: hidden;
  min-height: 350px;
}

.module-panel--empty {
  min-height: 8rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.module-panel__empty-text {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.module-panel__cols {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
  position: relative;
  z-index: 2;
}

@media (min-width: 1024px) {
  .module-panel__cols {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--theme-space-lg);
    align-items: start;
  }
}

.module-panel__topic {
  margin: 0 0 var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--theme-text-muted);
}

.module-panel__col {
  min-width: 0;
}

.module-panel__col--module {
  position: relative;
}

.module-panel__col-body--module {
  position: relative;
  min-height: 8rem;
  padding-bottom: var(--theme-space-sm);
}

.module-panel__bg-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.module-panel__bg-icon-svg {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  max-width: min(100%, 48rem);
  max-height: min(100%, 48rem);
  margin: auto;
  color: var(--theme-primary);
  opacity: 0.13;
}

.module-panel__bg-icon-svg :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.module-panel__module-inner {
  position: relative;
  z-index: 1;
}

.module-panel__title {
  margin: 0 0 var(--theme-space-xs);
  font-size: var(--theme-font-lg);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.module-panel__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-xs);
  align-items: center;
  margin-bottom: var(--theme-space-sm);
}

.module-panel__desc {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  margin: 0 0 var(--theme-space-md);
  line-height: 1.5;
}

.module-panel__learn-more--inline {
  margin-top: 0;
}

.module-panel__learn-more {
  font-size: var(--theme-font-sm);
  color: var(--theme-primary);
  text-decoration: none;
}

.module-panel__learn-more:hover {
  color: var(--theme-primary-hover);
}

.module-panel__dguild-pricing {
  margin: 0 0 var(--theme-space-md);
  padding-left: var(--theme-space-lg);
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-secondary);
  list-style: disc;
  line-height: 1.45;
}

.module-panel__dguild-pricing li {
  margin: 0;
}

.module-panel__col--actions .module-panel__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--theme-space-md);
}

.module-panel__cta {
  text-decoration: none;
}

.module-panel__key-info {
  margin: 0;
  padding-left: var(--theme-space-lg);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  list-style: disc;
}

.module-panel__key-info li {
  margin-bottom: var(--theme-space-xs);
}

.module-panel__muted {
  margin: 0;
  font-size: var(--theme-font-sm);
  color: var(--theme-text-muted);
}

.module-panel__pricing-block {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
}

.module-panel__pricing-list {
  margin: 0;
  padding-left: var(--theme-space-lg);
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  list-style: disc;
  display: flex;
  flex-direction: column;
  gap: calc(var(--theme-space-xs) * 0.7);
}

.module-panel__pricing-list li {
  margin: 0;
  line-height: 1.45;
}

.module-panel__pricing,
.module-panel__coming-soon {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-primary);
  margin: 0;
}

.module-panel__pricing--after-list {
  margin-top: var(--theme-space-sm);
}

.module-panel__pricing-label {
  font-weight: 400;
  color: var(--theme-text-muted);
  margin-right: var(--theme-space-xs);
}
</style>
