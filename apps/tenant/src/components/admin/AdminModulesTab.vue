<template>
  <div class="admin__split">
    <div class="admin__panel">
      <Card>
        <h3>Modules</h3>
        <div class="admin__module-grid">
          <div
            v-for="id in moduleIds"
            :key="id"
            class="admin__module-row"
            :class="{ 'admin__module-row--staging': form.modulesById[id] === 'staging' }"
          >
            <div class="admin__module-cell admin__module-cell--action">
              <Button
                v-if="id !== 'admin'"
                :variant="moduleActionVariant(id)"
                size="sm"
                :disabled="isDeactivating(id)"
                @click="onModuleAction(id)"
              >
                {{ moduleActionLabel(id) }}
              </Button>
            </div>
            <div class="admin__module-cell admin__module-cell--name">
              <span class="admin__module-name">{{ MODULE_NAV[id]?.label ?? id }}</span>
            </div>
            <div class="admin__module-cell admin__module-cell--actions">
              <button
                v-if="getModuleCatalogEntry(id)"
                type="button"
                class="admin__module-info-btn"
                :aria-label="`Info about ${MODULE_NAV[id]?.label ?? id}`"
                @click="openModuleInfo(id)"
              >
                <Icon icon="lucide:info" class="admin__module-info-icon" />
              </button>
            </div>
          </div>
        </div>
      </Card>

      <SimpleModal
        :model-value="!!infoModuleId"
        :title="infoModule?.name ?? ''"
        @update:model-value="infoModuleId = null"
      >
        <div v-if="infoModule" class="admin__module-info-modal">
          <p class="admin__module-info-desc">{{ infoModule.longDescription }}</p>
          <div v-if="moduleInfoPricing" class="admin__module-info-pricing">
            <p class="admin__module-info-pricing-title">Pricing</p>
            <p class="admin__module-info-pricing-text">{{ moduleInfoPricing }}</p>
          </div>
          <a
            :href="docsModuleUrl"
            target="_blank"
            rel="noopener"
            class="admin__module-info-link"
          >
            Learn more
            <Icon icon="lucide:external-link" />
          </a>
        </div>
      </SimpleModal>
    </div>
    <div aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import type { ModuleState } from '@decentraguild/core'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import { Icon } from '@iconify/vue'
import { getModuleCatalogEntry } from '@decentraguild/catalog'
import type { ModuleCatalogEntry } from '@decentraguild/catalog'
import { MODULE_NAV } from '~/config/modules'
import type { AdminForm } from '~/composables/admin/useAdminForm'

const config = useRuntimeConfig()
const platformDocsBase = config.public.platformDocsUrl as string ?? 'https://dguild.org/docs'

const infoModuleId = ref<string | null>(null)
const infoModule = computed<ModuleCatalogEntry | null>(() =>
  infoModuleId.value ? getModuleCatalogEntry(infoModuleId.value) ?? null : null
)
const docsModuleUrl = computed(() =>
  infoModuleId.value
    ? `${platformDocsBase.replace(/\/$/, '')}/modules/${infoModuleId.value}`
    : ''
)

/** `docs.pricing` from catalog; slug addon inherits admin catalog pricing copy. */
const moduleInfoPricing = computed(() => {
  const m = infoModule.value
  if (!m) return ''
  const direct = m.docs?.pricing?.trim()
  if (direct) return direct
  if (m.id === 'slug') return getModuleCatalogEntry('admin')?.docs?.pricing?.trim() ?? ''
  return ''
})

function openModuleInfo(id: string) {
  infoModuleId.value = id
}

const props = defineProps<{
  form: AdminForm
  moduleIds: string[]
}>()

const emit = defineEmits<{
  'module-toggle': [id: string, on: boolean]
}>()

function getModuleState(moduleId: string): ModuleState {
  return (props.form.modulesById[moduleId] ?? 'off') as ModuleState
}

function moduleActionLabel(moduleId: string): string {
  const s = getModuleState(moduleId)
  if (s === 'off') return 'Enable'
  if (s === 'staging') return 'Staging'
  if (s === 'active') return 'Active'
  if (s === 'deactivating') return 'Deactivating'
  return 'Enable'
}

function moduleActionVariant(moduleId: string): 'outline' | 'secondary' | 'default' | 'destructive' {
  const s = getModuleState(moduleId)
  if (s === 'off') return 'outline'
  if (s === 'staging') return 'secondary'
  if (s === 'active') return 'default'
  if (s === 'deactivating') return 'secondary'
  return 'outline'
}

function isDeactivating(moduleId: string): boolean {
  return getModuleState(moduleId) === 'deactivating'
}

function onModuleAction(moduleId: string) {
  const s = getModuleState(moduleId)
  if (s === 'off') {
    emit('module-toggle', moduleId, true)
  } else if (s === 'staging' || s === 'active') {
    emit('module-toggle', moduleId, false)
  }
}
</script>
