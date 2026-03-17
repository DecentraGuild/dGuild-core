<template>
  <nav class="docs-sidebar__nav">
    <div v-for="(section, sIdx) in sections" :key="sIdx" class="docs-sidebar__section">
      <button
        type="button"
        class="docs-sidebar__section-trigger"
        :aria-expanded="isSectionOpen(sIdx)"
        :aria-controls="`docs-section-${sIdx}`"
        @click="toggleSection(sIdx)"
      >
        <span class="docs-sidebar__section-title">{{ section.title }}</span>
        <Icon
          :icon="isSectionOpen(sIdx) ? 'lucide:chevron-down' : 'lucide:chevron-right'"
          class="docs-sidebar__section-chevron"
          aria-hidden
        />
      </button>
      <div
        :id="`docs-section-${sIdx}`"
        class="docs-sidebar__section-content"
        :hidden="!isSectionOpen(sIdx)"
      >
        <NuxtLink
          v-for="item in section.items"
          :key="item.path"
          :to="item.path"
          class="docs-sidebar__link"
          :class="{ 'docs-sidebar__link--active': isActive(item.path) }"
          :prefetch="false"
        >
          {{ item.label }}
        </NuxtLink>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { getDocsSidebarSections } from '~/composables/useDocFromCatalog'

const route = useRoute()
const sections = getDocsSidebarSections()

const openSections = ref<Set<number>>(new Set())

function isActive(path: string): boolean {
  if (path === '/docs') return route.path === '/docs'
  return route.path === path || route.path.startsWith(path + '/')
}

function sectionContainsActive(sIdx: number): boolean {
  const section = sections[sIdx]
  if (!section) return false
  return section.items.some((item) => isActive(item.path))
}

const effectiveOpenSections = computed(() => {
  if (openSections.value.size > 0) return openSections.value
  const set = new Set<number>()
  sections.forEach((_, sIdx) => {
    if (sectionContainsActive(sIdx)) set.add(sIdx)
  })
  if (set.size === 0) set.add(0)
  return set
})

watch(
  () => route.path,
  () => {
    const next = new Set<number>()
    sections.forEach((_, sIdx) => {
      if (sectionContainsActive(sIdx)) next.add(sIdx)
    })
    if (next.size === 0) next.add(0)
    openSections.value = next
  },
)

function isSectionOpen(sIdx: number): boolean {
  return effectiveOpenSections.value.has(sIdx)
}

function toggleSection(sIdx: number) {
  const next = new Set(openSections.value)
  if (next.has(sIdx)) next.delete(sIdx)
  else next.add(sIdx)
  if (next.size === 0) {
    sections.forEach((_, i) => {
      if (sectionContainsActive(i)) next.add(i)
    })
    if (next.size === 0) next.add(0)
  }
  openSections.value = next
}
</script>

<style scoped>
.docs-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
}

.docs-sidebar__section {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: var(--theme-space-md);
}

.docs-sidebar__section-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--theme-space-xs) var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--theme-text-muted);
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
}

.docs-sidebar__section-trigger:hover {
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-card);
}

.docs-sidebar__section-title {
  flex: 1;
}

.docs-sidebar__section-chevron {
  flex-shrink: 0;
  font-size: 0.75rem;
  opacity: 0.8;
}

.docs-sidebar__section-content {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-xs);
  padding-left: var(--theme-space-sm);
  margin-top: var(--theme-space-xs);
}

.docs-sidebar__section-content[hidden] {
  display: none;
}

.docs-sidebar__link {
  font-size: var(--theme-font-sm);
  color: var(--theme-text-secondary);
  text-decoration: none;
  padding: var(--theme-space-xs) var(--theme-space-sm);
  border-radius: 4px;
}

.docs-sidebar__link:hover {
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-card);
}

.docs-sidebar__link--active {
  color: var(--theme-primary);
  font-weight: 500;
}
</style>
