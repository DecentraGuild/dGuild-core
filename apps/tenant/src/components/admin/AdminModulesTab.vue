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
            <div class="admin__module-cell admin__module-cell--toggle">
              <Switch
                v-if="id !== 'admin'"
                :model-value="isModuleOn(id)"
                @update:model-value="$emit('module-toggle', id, $event)"
              />
            </div>
            <div class="admin__module-cell admin__module-cell--name">
              <span class="admin__module-name">{{ MODULE_NAV[id]?.label ?? id }}</span>
            </div>
            <div class="admin__module-cell admin__module-cell--status">
              <span v-if="id === 'admin' || isAlwaysOnModule(id)" class="admin__module-always-on">Always on</span>
              <template v-else>
                <span v-if="moduleDeactivationDate(id)" class="admin__module-date">
                  Deactivate at {{ formatDeactivationDate(moduleDeactivationDate(id)) }}
                </span>
                <span v-else-if="form.modulesById[id] === 'staging'" class="admin__module-staging-label">Staging</span>
                <template v-else-if="form.modulesById[id] === 'active' && isModuleBillable(id)">
                  <span v-if="isAddUnitOnly(id)" class="admin__module-always-on">Always on</span>
                  <div v-else-if="extendingModuleId === id" class="admin__extend-inline">
                    <div class="pricing-widget__period-toggle">
                      <button
                        class="pricing-widget__period-btn"
                        :class="{ 'pricing-widget__period-btn--active': extendPeriod === 'monthly' }"
                        @click="$emit('update:extendPeriod', 'monthly')"
                      >
                        Month
                      </button>
                      <button
                        class="pricing-widget__period-btn"
                        :class="{ 'pricing-widget__period-btn--active': extendPeriod === 'yearly' }"
                        @click="$emit('update:extendPeriod', 'yearly')"
                      >
                        Year
                      </button>
                    </div>
                    <Button variant="default" size="sm" :disabled="extending" @click="$emit('confirm-extend', id)">
                      {{ extending ? 'Extending...' : 'Confirm' }}
                    </Button>
                    <button class="admin__extend-cancel" @click="$emit('cancel-extend')">
                      <Icon icon="lucide:x" />
                    </button>
                  </div>
                  <Button v-else variant="secondary" size="sm" @click="$emit('start-extend', id)">
                    Extend
                  </Button>
                </template>
              </template>
            </div>
            <div class="admin__module-cell admin__module-cell--actions">
              <button
                v-if="id !== 'admin' && getModuleCatalogEntry(id)"
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
import type { BillingPeriod } from '@decentraguild/billing'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import { Switch } from '~/components/ui/switch'
import { Icon } from '@iconify/vue'
import { getModuleCatalogEntry } from '@decentraguild/config'
import { MODULE_NAV } from '~/config/modules'
import type { ModuleCatalogEntry } from '@decentraguild/config'

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

function openModuleInfo(id: string) {
  infoModuleId.value = id
}

import type { TenantConfig } from '@decentraguild/core'
import type { AdminForm } from '~/composables/admin/useAdminForm'

const props = defineProps<{
  form: AdminForm
  tenant: TenantConfig | null
  moduleIds: string[]
  subscriptions: Record<string, { periodEnd?: string } | null>
  extendingModuleId: string | null
  extending: boolean
  extendPeriod: BillingPeriod
}>()

defineEmits<{
  'module-toggle': [id: string, on: boolean]
  'start-extend': [id: string]
  'confirm-extend': [id: string]
  'cancel-extend': []
  'update:extendPeriod': [value: BillingPeriod]
}>()

function moduleDeactivationDate(moduleId: string): string | null {
  const entry = props.tenant?.modules?.[moduleId] as { deactivatedate?: string | null } | undefined
  const d = entry?.deactivatedate
  return d && typeof d === 'string' ? d : null
}

function formatDeactivationDate(iso: string): string {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function isModuleOn(moduleId: string): boolean {
  const s = props.form.modulesById[moduleId] ?? 'off'
  return s === 'staging' || s === 'active' || s === 'deactivating'
}

function isModuleBillable(moduleId: string): boolean {
  return getModuleCatalogEntry(moduleId)?.pricing != null
}

function isAddUnitOnly(moduleId: string): boolean {
  const pricing = getModuleCatalogEntry(moduleId)?.pricing as { modelType?: string } | undefined
  return pricing?.modelType === 'add_unit'
}

function isAlwaysOnModule(moduleId: string): boolean {
  const entry = getModuleCatalogEntry(moduleId) as { alwaysOn?: boolean } | undefined
  return entry?.alwaysOn === true
}
</script>
