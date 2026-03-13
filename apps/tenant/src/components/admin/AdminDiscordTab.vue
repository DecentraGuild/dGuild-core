<template>
  <div class="admin__split">
    <div class="admin__panel">
      <AdminDiscordSettings
        ref="settingsRef"
        :slug="slug"
        @conditions-changed="(e: { holders_current: number }) => liveConditions = e"
      />
    </div>
    <AdminPricingWidget
      ref="pricingRef"
      module-id="discord"
      :module-state="moduleState"
      :conditions="liveConditions"
      :subscription="subscription"
      :saving="saving"
      :deploying="deploying"
      :save-error="saveError"
      @save="(p: BillingPeriod) => emit('save', p)"
      @deploy="(p: BillingPeriod) => emit('deploy', p)"
      @reactivate="(p: BillingPeriod) => emit('reactivate', p)"
    />
  </div>
</template>

<script setup lang="ts">
import type { ModuleState } from '@decentraguild/core'
import type { BillingPeriod } from '@decentraguild/billing'
import AdminDiscordSettings from '~/components/admin/AdminDiscordSettings.vue'
import AdminPricingWidget from '~/components/admin/AdminPricingWidget.vue'

defineProps<{
  slug: string
  moduleState: ModuleState
  subscription: { periodEnd?: string } | null
  saving: boolean
  deploying: boolean
  saveError: string | null
}>()

const emit = defineEmits<{
  save: [period: BillingPeriod]
  deploy: [period: BillingPeriod]
  reactivate: [period: BillingPeriod]
}>()

const settingsRef = ref<InstanceType<typeof AdminDiscordSettings> | null>(null)
const pricingRef = ref<InstanceType<typeof AdminPricingWidget> | null>(null)

const liveConditions = ref<{ holders_current: number } | null>(null)
</script>
