<template>
  <div class="create-trade-settings">
    <button
      type="button"
      class="create-trade-settings__toggle"
      @click="$emit('update:expanded', !expanded)"
    >
      <Icon icon="lucide:settings" class="create-trade-settings__icon" />
      <span>Additional settings</span>
      <Icon :icon="expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" />
    </button>
    <div v-if="expanded" class="create-trade-settings__body">
      <div class="create-trade-settings__row">
        <div class="create-trade-settings__label">
          <p class="create-trade-settings__title">Direct</p>
          <p class="create-trade-settings__hint">Only this wallet can fill the trade.</p>
        </div>
        <Switch :model-value="direct" @update:model-value="$emit('update:direct', $event)" />
      </div>
      <div v-if="direct" class="create-trade-settings__field">
        <label class="create-trade-settings__field-label">Counterparty address</label>
        <FormInput
          :model-value="directAddress"
          type="text"
          placeholder="Enter Solana wallet address"
          @update:model-value="$emit('update:directAddress', $event)"
        />
      </div>
      <div class="create-trade-settings__row">
        <div class="create-trade-settings__label">
          <p class="create-trade-settings__title">{{ gateLabel }}</p>
          <p v-if="effectiveModuleGate && typeof effectiveModuleGate === 'object'" class="create-trade-settings__hint">
            This community requires a {{ gateLabelLower }}. Only listed addresses can fill this trade.
          </p>
          <p v-else class="create-trade-settings__hint">
            Only addresses on this list can fill the trade. Use default, public, or pick a list.
          </p>
        </div>
        <GateSelect
          v-if="!effectiveModuleGate || effectiveModuleGate === 'admin-only'"
          :slug="slug"
          :model-value="gate"
          show-use-default
          @update:model-value="$emit('update:gate', $event)"
        />
        <p v-else class="create-trade-settings__fixed">{{ gateLabel }} is set by the community (dGuild or module).</p>
      </div>
      <div class="create-trade-settings__row">
        <div class="create-trade-settings__label">
          <p class="create-trade-settings__title">Expire</p>
          <p class="create-trade-settings__hint">Set expiration time (UTC).</p>
        </div>
        <Switch :model-value="expire" @update:model-value="$emit('update:expire', $event)" />
      </div>
      <div v-if="expire" class="create-trade-settings__field">
        <div class="create-trade-settings__presets">
          <button
            v-for="preset in expirePresets"
            :key="preset.label"
            type="button"
            class="create-trade-settings__preset-btn"
            @click="applyPreset(preset.minutes)"
          >
            {{ preset.label }}
          </button>
        </div>
        <input
          :value="expireDate"
          type="datetime-local"
          class="create-trade-settings__datetime"
          :min="minExpireDateTime"
          step="60"
          @input="$emit('update:expireDate', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="create-trade-settings__row">
        <div class="create-trade-settings__label">
          <p class="create-trade-settings__title">Partial fill</p>
          <p class="create-trade-settings__hint">Allow filling part of the order.</p>
        </div>
        <Switch :model-value="partialFill" @update:model-value="$emit('update:partialFill', $event)" />
      </div>
      <div v-if="partialFill" class="create-trade-settings__field">
        <label class="create-trade-settings__field-label">Slippage (rounding tolerance)</label>
        <p class="create-trade-settings__hint">milli% (1 = 0.001%).</p>
        <input
          :value="slippage"
          type="number"
          min="0"
          max="10000"
          class="create-trade-settings__slippage"
          placeholder="5000"
          @input="$emit('update:slippage', Number(($event.target as HTMLInputElement).value) || 0)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getGateLabel } from '@decentraguild/config'
import { Icon } from '@iconify/vue'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import { Switch } from '~/components/ui/switch'
import GateSelect from '~/components/gates/GateSelect.vue'

const gateLabel = getGateLabel()
const gateLabelLower = gateLabel.toLowerCase()

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- props used for emit type
const props = withDefaults(
  defineProps<{
    slug?: string | null
    effectiveModuleGate: { programId: string; account: string } | null | 'admin-only'
    expanded: boolean
    direct: boolean
    directAddress: string
    gate: { programId: string; account: string } | null | 'use-default'
    expire: boolean
    expireDate: string
    partialFill: boolean
    slippage: number
  }>(),
  { slug: null }
)

const emit = defineEmits<{
  'update:expanded': [v: boolean]
  'update:direct': [v: boolean]
  'update:directAddress': [v: string]
  'update:gate': [v: typeof props.gate]
  'update:expire': [v: boolean]
  'update:expireDate': [v: string]
  'update:partialFill': [v: boolean]
  'update:slippage': [v: number]
}>()

const expirePresets = [
  { label: '+12h', minutes: 720 },
  { label: '+1d', minutes: 1440 },
  { label: '+3d', minutes: 4320 },
  { label: '+7d', minutes: 10080 },
  { label: '+30d', minutes: 43200 },
]

const minExpireDateTime = computed(() => {
  const now = new Date()
  const min = new Date(now.getTime() + 5 * 60 * 1000)
  return min.toISOString().slice(0, 16)
})

function applyPreset(minutes: number) {
  const now = new Date()
  const future = new Date(now.getTime() + minutes * 60 * 1000)
  emit('update:expireDate', future.toISOString().slice(0, 16))
  emit('update:expire', true)
}
</script>

<style scoped>
.create-trade-settings {
  margin-bottom: var(--theme-space-md);
}

.create-trade-settings__toggle {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  width: 100%;
  padding: var(--theme-space-sm) 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--theme-text-secondary);
  cursor: pointer;
}

.create-trade-settings__toggle:hover {
  color: var(--theme-text-primary);
}

.create-trade-settings__icon {
  flex-shrink: 0;
}

.create-trade-settings__body {
  padding-top: var(--theme-space-sm);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.create-trade-settings__row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--theme-space-md);
  margin-bottom: var(--theme-space-md);
}

.create-trade-settings__label {
  flex: 1;
  min-width: 0;
}

.create-trade-settings__title {
  margin: 0;
  font-size: var(--theme-font-sm);
  font-weight: 600;
  color: var(--theme-text-primary);
}

.create-trade-settings__hint {
  margin: 2px 0 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.create-trade-settings__fixed {
  margin: 0;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-muted);
}

.create-trade-settings__field {
  margin-bottom: var(--theme-space-md);
}

.create-trade-settings__field-label {
  display: block;
  font-size: var(--theme-font-xs);
  color: var(--theme-text-secondary);
  margin-bottom: var(--theme-space-xs);
}

.create-trade-settings__presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--theme-space-xs);
  margin-bottom: var(--theme-space-sm);
}

.create-trade-settings__preset-btn {
  padding: var(--theme-space-xs) var(--theme-space-sm);
  font-size: var(--theme-font-xs);
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text-secondary);
  cursor: pointer;
}

.create-trade-settings__preset-btn:hover {
  background: var(--theme-bg-muted);
  color: var(--theme-text-primary);
}

.create-trade-settings__datetime {
  width: 100%;
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-sm);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-secondary, #1a1721);
  color: var(--theme-text-primary, #ffffff);
}

.create-trade-settings__slippage {
  width: 100%;
  max-width: 8rem;
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-sm);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
  background: var(--theme-bg-secondary, #1a1721);
  color: var(--theme-text-primary, #ffffff);
}
</style>
