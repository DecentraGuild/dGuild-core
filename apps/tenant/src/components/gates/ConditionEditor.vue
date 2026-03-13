<template>
  <div class="condition-editor">
    <div class="condition-editor__row">
      <OptionsSelect
        v-model="typeModel"
        :options="conditionTypeOptions"
        placeholder="Type"
        class="condition-editor__type"
        @update:model-value="emit('update:type', $event)"
      />
      <OptionsSelect
        v-if="needsMintOrList"
        :model-value="cond.mint_or_group"
        :options="mintOrListOptions"
        :placeholder="mintOrListPlaceholder"
        class="condition-editor__mint"
        @update:model-value="onMintOrListChange"
      />
      <FormInput
        v-if="needsAmount"
        v-model="amountModel"
        type="number"
        placeholder="Amount"
        class="condition-editor__amount"
        @update:model-value="emit('update:amount', $event)"
      />
      <template v-if="cond.type === 'TRAIT'">
        <OptionsSelect
          v-model="traitKeyModel"
          :options="traitKeyOptions"
          placeholder="Trait"
          class="condition-editor__trait-key"
          @update:model-value="emit('update:trait_key', $event)"
        />
        <OptionsSelect
          v-model="traitValueModel"
          :options="traitValueSelectOptions"
          placeholder="Value"
          class="condition-editor__trait-value"
          @update:model-value="emit('update:trait_value', $event)"
        />
      </template>
      <template v-if="cond.type === 'SHIPMENT'">
        <select
          v-model="beginDateModel"
          class="condition-editor__date"
          @change="emit('update:begin_date', beginDateModel)"
        >
          <option value="">Begin date</option>
          <option v-for="d in snapshotDatesForMint" :key="d" :value="d">{{ d }}</option>
        </select>
        <select
          v-model="endDateModel"
          class="condition-editor__date"
          @change="emit('update:end_date', endDateModel)"
        >
          <option value="">End date</option>
          <option v-for="d in snapshotDatesForMint" :key="d" :value="d">{{ d }}</option>
        </select>
      </template>
      <FormInput
        v-if="cond.type === 'SNAPSHOTS'"
        v-model="daysModel"
        type="number"
        placeholder="Days"
        min="1"
        class="condition-editor__days"
        @update:model-value="emit('update:days', $event)"
      />
      <template v-if="cond.type === 'TIME_WEIGHTED'">
        <select
          v-model="beginSnapshotAtModel"
          class="condition-editor__date"
          @change="emit('update:begin_snapshot_at', beginSnapshotAtModel)"
        >
          <option value="">Begin snapshot</option>
          <option v-for="s in snapshotAtForMint" :key="s" :value="s">{{ formatSnapshotAt(s) }}</option>
        </select>
        <select
          v-model="endSnapshotAtModel"
          class="condition-editor__date"
          @change="emit('update:end_snapshot_at', endSnapshotAtModel)"
        >
          <option value="">End snapshot</option>
          <option v-for="s in snapshotAtForMint" :key="s" :value="s">{{ formatSnapshotAt(s) }}</option>
        </select>
      </template>
      <OptionsSelect
        v-if="cond.type === 'DISCORD' && showRoleSelector"
        v-model="roleModel"
        :options="guildRoleOptions"
        placeholder="Role"
        class="condition-editor__role"
        @update:model-value="emit('update:required_role_id', $event)"
      />
      <div v-if="!isLast && !isWeightedMode" class="condition-editor__logic">
        <select
          :value="cond.logic_to_next ?? 'AND'"
          class="condition-editor__logic-select"
          @change="onLogicChange"
        >
          <option value="AND">AND</option>
          <option value="OR">OR</option>
        </select>
      </div>
      <Button
        v-if="!isWeightedMode"
        variant="ghost"
        size="icon"
        class="condition-editor__remove"
        aria-label="Remove condition"
        @click="emit('remove')"
      >
        <Icon icon="lucide:trash-2" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import OptionsSelect from '~/components/ui/options-select/OptionsSelect.vue'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import type { FormCondition } from '~/composables/conditions/useConditionSet'
import type { CatalogMint } from '~/types/mints'

const props = withDefaults(
  defineProps<{
    cond: FormCondition
    conditionTypes: { id?: string; value?: string; label: string }[]
    mintsWithHolders: CatalogMint[]
    mintsWithSnapshot: CatalogMint[]
    gateLists: Array<{ address: string; name: string }>
    guildRoles?: Array<{ value: string; label: string }>
    snapshotDatesForMint: string[]
    snapshotAtForMint?: string[]
    traitKeys: string[]
    traitValueOptions: string[]
    isLast: boolean
    showRoleSelector?: boolean
    isWeightedMode?: boolean
  }>(),
  { guildRoles: () => [], showRoleSelector: true, snapshotAtForMint: () => [], isWeightedMode: false }
)

const emit = defineEmits<{
  'update:type': [value: string]
  'update:mint_or_group': [value: string]
  'update:amount': [value: string]
  'update:trait_key': [value: string]
  'update:trait_value': [value: string]
  'update:begin_date': [value: string]
  'update:end_date': [value: string]
  'update:days': [value: string]
  'update:begin_snapshot_at': [value: string]
  'update:end_snapshot_at': [value: string]
  'update:required_role_id': [value: string]
  'update:logic_to_next': [value: 'AND' | 'OR']
  'logic-change': []
  remove: []
}>()

const conditionTypeOptions = computed(() =>
  props.conditionTypes.map((t) => ({
    value: (t.value ?? t.id ?? '').toString(),
    label: t.label,
  }))
)

const typeModel = computed({
  get: () => props.cond.type,
  set: (v) => emit('update:type', v),
})

const amountModel = computed({
  get: () => props.cond.amount ?? '1',
  set: (v) => emit('update:amount', v),
})

const traitKeyModel = computed({
  get: () => props.cond.trait_key ?? '',
  set: (v) => emit('update:trait_key', v),
})

const traitValueModel = computed({
  get: () => props.cond.trait_value ?? '',
  set: (v) => emit('update:trait_value', v),
})

const beginDateModel = ref(props.cond.begin_date ?? '')
const endDateModel = ref(props.cond.end_date ?? '')
watch(
  () => props.cond.begin_date,
  (v) => { beginDateModel.value = v ?? '' }
)
watch(
  () => props.cond.end_date,
  (v) => { endDateModel.value = v ?? '' }
)

const daysModel = computed({
  get: () => props.cond.days ?? '',
  set: (v) => emit('update:days', v),
})

const beginSnapshotAtModel = ref(props.cond.begin_snapshot_at ?? '')
const endSnapshotAtModel = ref(props.cond.end_snapshot_at ?? '')
watch(
  () => props.cond.begin_snapshot_at,
  (v) => { beginSnapshotAtModel.value = v ?? '' }
)
watch(
  () => props.cond.end_snapshot_at,
  (v) => { endSnapshotAtModel.value = v ?? '' }
)

function formatSnapshotAt(s: string): string {
  if (!s) return ''
  try {
    const d = new Date(s)
    return d.toISOString().slice(0, 16).replace('T', ' ')
  } catch {
    return s.slice(0, 16)
  }
}

const roleModel = computed({
  get: () => props.cond.required_role_id ?? '',
  set: (v) => emit('update:required_role_id', v),
})

const needsMintOrList = computed(() =>
  ['HOLDING', 'TRAIT', 'WHITELIST', 'SHIPMENT', 'SNAPSHOTS', 'TIME_WEIGHTED'].includes(props.cond.type)
)

const needsAmount = computed(() =>
  ['HOLDING', 'TRAIT', 'SHIPMENT', 'SNAPSHOTS'].includes(props.cond.type)
)

const mintOrListOptions = computed(() => {
  if (props.cond.type === 'WHITELIST') {
    return props.gateLists.map((l) => ({ value: l.address, label: l.name || l.address }))
  }
  if (props.cond.type === 'TRAIT') {
    return props.mintsWithHolders.filter((m) => m.kind === 'NFT').map((m) => ({ value: m.asset_id, label: m.label }))
  }
  if (props.cond.type === 'SHIPMENT' || props.cond.type === 'SNAPSHOTS' || props.cond.type === 'TIME_WEIGHTED') {
    return props.mintsWithSnapshot.map((m) => ({ value: m.asset_id, label: m.label }))
  }
  return props.mintsWithHolders.map((m) => ({ value: m.asset_id, label: m.label }))
})

const mintOrListPlaceholder = computed(() => {
  if (props.cond.type === 'WHITELIST') return 'Select list'
  return 'Select mint'
})

const traitKeyOptions = computed(() =>
  props.traitKeys.map((k) => ({ value: k, label: k }))
)

const traitValueSelectOptions = computed(() =>
  props.traitValueOptions.map((v) => ({ value: v, label: v }))
)

const guildRoleOptions = computed(() => props.guildRoles ?? [])

function onMintOrListChange(value: string) {
  emit('update:mint_or_group', value)
}

function onLogicChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value as 'AND' | 'OR'
  emit('update:logic_to_next', v)
  emit('logic-change')
}
</script>

<style scoped>
.condition-editor__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-sm);
}

.condition-editor__type {
  min-width: 7rem;
}

.condition-editor__mint {
  min-width: 10rem;
  flex: 1;
}

.condition-editor__amount {
  width: 5rem;
}

.condition-editor__trait-key,
.condition-editor__trait-value {
  min-width: 6rem;
}

.condition-editor__date {
  min-width: 8rem;
  height: var(--theme-input-height, 2.25rem);
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-base);
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
}

.condition-editor__days {
  width: 4rem;
}

.condition-editor__role {
  min-width: 8rem;
}

.condition-editor__logic-select {
  min-width: 4rem;
  height: var(--theme-input-height, 2.25rem);
  padding: var(--theme-space-sm) var(--theme-space-md);
  font-size: var(--theme-font-base);
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
}

.condition-editor__remove {
  color: var(--theme-text-muted);
  flex-shrink: 0;
}

.condition-editor__remove:hover {
  color: var(--theme-error);
}
</style>
