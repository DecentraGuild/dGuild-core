<template>
  <div class="home">
    <section
      class="home__catalog-wrap"
      aria-labelledby="home-modules-heading"
    >
      <div class="home__catalog">
        <div class="home__catalog-inner">
          <h2 id="home-modules-heading" class="home__heading">Modules</h2>

          <ModuleCatalogDetailPanel :entry="selectedEntry" />

          <ModuleFlagCarousel
            :modules="displayModules"
            :selected-id="selectedModuleId"
            aria-label="Choose a module"
            @select="onSelectModule"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Home' })
import {
  getModuleCatalogEntry,
  getModuleCatalogList,
  isModulePubliclyVisible,
} from '@decentraguild/catalog'
import type { ModuleCatalogEntry } from '@decentraguild/catalog'
import ModuleCatalogDetailPanel from '~/components/home/ModuleCatalogDetailPanel.vue'
import ModuleFlagCarousel from '~/components/home/ModuleFlagCarousel.vue'

const route = useRoute()
const router = useRouter()

const displayModules = computed(() => {
  const rest = getModuleCatalogList().filter(
    (m) => !m.docsOnly && isModulePubliclyVisible(m.status),
  )
  const dguild = getModuleCatalogEntry('dguild')
  if (!dguild || !isModulePubliclyVisible(dguild.status)) {
    return rest
  }
  const others = rest.filter((m) => m.id !== 'dguild')
  return [dguild, ...others]
})

const selectedModuleId = ref<string | null>(null)

const selectedEntry = computed((): ModuleCatalogEntry | null => {
  const id = selectedModuleId.value
  if (!id) return null
  return displayModules.value.find((m) => m.id === id) ?? null
})

function resolveInitialId(): string | null {
  const q = route.query.module
  const raw = Array.isArray(q) ? q[0] : q
  const id = typeof raw === 'string' ? raw.trim() : ''
  if (id && displayModules.value.some((m) => m.id === id)) {
    return id
  }
  return displayModules.value[0]?.id ?? null
}

watch(
  displayModules,
  (list) => {
    if (!list.length) {
      selectedModuleId.value = null
      return
    }
    const cur = selectedModuleId.value
    if (cur && list.some((m) => m.id === cur)) return
    selectedModuleId.value = resolveInitialId() ?? list[0]!.id
  },
  { immediate: true },
)

watch(
  () => route.query.module,
  () => {
    const id = resolveInitialId()
    if (id) selectedModuleId.value = id
  },
)

function onSelectModule(id: string) {
  selectedModuleId.value = id
  void router.replace({ query: { ...route.query, module: id } })
}
</script>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
  padding-bottom: var(--theme-space-md);
}

.home__catalog-wrap {
  position: relative;
  width: 100vw;
  max-width: 100vw;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  min-height: min(calc(100dvh - 5rem), 56rem);
  box-sizing: border-box;
}

@media (min-width: 768px) {
  .home__catalog-wrap {
    min-height: min(calc(100dvh - 4rem), 60rem);
  }
}

.home__catalog {
  position: relative;
  overflow: hidden;
  min-height: inherit;
  border-radius: 0;
  background-color: var(--theme-bg-secondary);
  background-image: url('/Wall.webp');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.home__catalog::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.52);
  z-index: 0;
  pointer-events: none;
}

.home__catalog-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-md);
  padding: var(--theme-space-md);
  max-width: 56rem;
  margin-left: auto;
  margin-right: auto;
  padding-left: max(var(--theme-space-md), env(safe-area-inset-left));
  padding-right: max(var(--theme-space-md), env(safe-area-inset-right));
  min-height: inherit;
  box-sizing: border-box;
}

@media (min-width: 768px) {
  .home__catalog-inner {
    padding: var(--theme-space-lg);
    padding-left: max(var(--theme-space-lg), env(safe-area-inset-left));
    padding-right: max(var(--theme-space-lg), env(safe-area-inset-right));
  }
}

.home__heading {
  margin: 0;
  font-size: var(--theme-font-lg);
  font-weight: 600;
  color: var(--theme-text-primary);
}
</style>
