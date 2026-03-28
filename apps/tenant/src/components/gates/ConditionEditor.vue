<template>
  <div class="condition-editor">
    <div class="condition-editor__card">
      <div class="condition-editor__card-header">
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
      <div
        class="condition-editor__row condition-editor__row--primary"
        :class="{ 'condition-editor__row--primary-spaced': hasSecondaryRow }"
      >
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
      </div>
      <div v-if="hasSecondaryRow" class="condition-editor__row condition-editor__row--secondary">
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
          <OptionsSelect
            v-model="beginDateModel"
            :options="beginDateOptions"
            placeholder="Begin date"
            class="condition-editor__date"
            @update:model-value="emit('update:begin_date', $event)"
          />
          <OptionsSelect
            v-model="endDateModel"
            :options="endDateOptions"
            placeholder="End date"
            class="condition-editor__date"
            @update:model-value="emit('update:end_date', $event)"
          />
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
          <OptionsSelect
            v-model="beginSnapshotAtModel"
            :options="beginSnapshotAtOptions"
            placeholder="Begin snapshot"
            class="condition-editor__date"
            @update:model-value="emit('update:begin_snapshot_at', $event)"
          />
          <OptionsSelect
            v-model="endSnapshotAtModel"
            :options="endSnapshotAtOptions"
            placeholder="End snapshot"
            class="condition-editor__date"
            @update:model-value="emit('update:end_snapshot_at', $event)"
          />
        </template>
        <OptionsSelect
          v-if="cond.type === 'DISCORD' && showRoleSelector"
          v-model="roleModel"
          :options="discordRoleFlatOptions"
          :option-groups="discordRoleSelectGroups"
          label="Required role"
          placeholder="Role"
          class="condition-editor__role"
          @update:model-value="emit('update:required_role_id', $event)"
        />
        <div v-if="showLogicPills && !isLast && !isWeightedMode" class="condition-editor__logic">
          <div class="condition-editor__logic-pills" role="group" aria-label="Logic to next condition">
            <button
              type="button"
              class="condition-editor__logic-pill"
              :class="{ 'condition-editor__logic-pill--active': (cond.logic_to_next ?? 'AND') === 'AND' }"
              @click="setLogic('AND')"
            >
              AND
            </button>
            <button
              type="button"
              class="condition-editor__logic-pill"
              :class="{ 'condition-editor__logic-pill--active': (cond.logic_to_next ?? 'AND') === 'OR' }"
              @click="setLogic('OR')"
            >
              OR
            </button>
          </div>
        </div>
      </div>
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
    guildRoleOptionGroups?: Array<{ groupLabel: string; options: Array<{ value: string; label: string }> }>
    snapshotDatesForMint: string[]
    snapshotAtForMint?: string[]
    traitKeys: string[]
    traitValueOptions: string[]
    isLast: boolean
    showRoleSelector?: boolean
    isWeightedMode?: boolean
    /** When false, logic pills (AND/OR) are hidden; parent renders them between cards. */
    showLogicPills?: boolean
  }>(),
  {
    guildRoles: () => [],
    guildRoleOptionGroups: undefined,
    showRoleSelector: true,
    snapshotAtForMint: () => [],
    isWeightedMode: false,
    showLogicPills: true,
  }
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

const beginDateModel = computed({
  get: () => props.cond.begin_date ?? '',
  set: (v) => emit('update:begin_date', v),
})
const endDateModel = computed({
  get: () => props.cond.end_date ?? '',
  set: (v) => emit('update:end_date', v),
})

const beginDateOptions = computed(() => [
  { value: '', label: 'Begin date' },
  ...props.snapshotDatesForMint.map((d) => ({ value: d, label: d })),
])
const endDateOptions = computed(() => [
  { value: '', label: 'End date' },
  ...props.snapshotDatesForMint.map((d) => ({ value: d, label: d })),
])

const daysModel = computed({
  get: () => props.cond.days ?? '',
  set: (v) => emit('update:days', v),
})

const beginSnapshotAtModel = computed({
  get: () => props.cond.begin_snapshot_at ?? '',
  set: (v) => emit('update:begin_snapshot_at', v),
})
const endSnapshotAtModel = computed({
  get: () => props.cond.end_snapshot_at ?? '',
  set: (v) => emit('update:end_snapshot_at', v),
})

const beginSnapshotAtOptions = computed(() => [
  { value: '', label: 'Begin snapshot' },
  ...(props.snapshotAtForMint ?? []).map((s) => ({ value: s, label: formatSnapshotAt(s) })),
])
const endSnapshotAtOptions = computed(() => {
  const begin = props.cond.begin_snapshot_at ?? ''
  const list = (props.snapshotAtForMint ?? []).filter((s) => !begin || s >= begin)
  return [
    { value: '', label: 'Through latest snapshot' },
    ...list.map((s) => ({ value: s, label: formatSnapshotAt(s) })),
  ]
})

watch(
  () => props.cond.begin_snapshot_at,
  (begin) => {
    const end = props.cond.end_snapshot_at
    if (begin && end && end < begin) emit('update:end_snapshot_at', '')
  }
)

const hasSecondaryRow = computed(
  () =>
    props.cond.type === 'TRAIT' ||
    props.cond.type === 'SHIPMENT' ||
    props.cond.type === 'SNAPSHOTS' ||
    props.cond.type === 'TIME_WEIGHTED' ||
    (props.cond.type === 'DISCORD' && props.showRoleSelector) ||
    (props.showLogicPills && !props.isLast && !props.isWeightedMode)
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

const discordRoleSelectGroups = computed(() => {
  const g = props.guildRoleOptionGroups
  return g?.length ? g : undefined
})

const discordRoleFlatOptions = computed(() => {
  if (discordRoleSelectGroups.value?.length) return []
  return props.guildRoles ?? []
})

function onMintOrListChange(value: string) {
  emit('update:mint_or_group', value)
}

function setLogic(value: 'AND' | 'OR') {
  emit('update:logic_to_next', value)
  emit('logic-change')
}
</script>

<style scoped>
.condition-editor__card {
  position: relative;
  padding: var(--theme-space-md);
  background-color: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-md);
}

.condition-editor__card-header {
  position: absolute;
  top: var(--theme-space-sm);
  right: var(--theme-space-sm);
}

.condition-editor__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--theme-space-sm);
}

.condition-editor__row--primary-spaced {
  margin-bottom: var(--theme-space-sm);
}

.condition-editor__row--secondary {
  padding-top: var(--theme-space-xs);
  border-top: var(--theme-border-thin) solid var(--theme-border);
}

.condition-editor__type {
  min-width: 7rem;
}

.condition-editor__mint {
  min-width: 10rem;
  flex: 1;
}

.condition-editor__amount {
  flex-shrink: 0;
  min-width: 8rem;
}

.condition-editor__trait-key,
.condition-editor__trait-value {
  min-width: 6rem;
}

.condition-editor__date {
  min-width: 8rem;
}

.condition-editor__days {
  flex-shrink: 0;
  min-width: 5.5rem;
}

.condition-editor__role {
  min-width: 8rem;
}

.condition-editor__logic {
  margin-left: auto;
}

.condition-editor__logic-pills {
  display: flex;
  gap: 0;
  padding: 2px;
  background-color: var(--theme-bg-muted);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
}

.condition-editor__logic-pill {
  padding: 4px 10px;
  font-size: var(--theme-font-xs);
  font-weight: 500;
  color: var(--theme-text-muted);
  background: none;
  border: none;
  border-radius: calc(var(--theme-radius-sm) - 2px);
  cursor: pointer;
}

.condition-editor__logic-pill:hover {
  color: var(--theme-text-primary);
}

.condition-editor__logic-pill--active {
  color: var(--theme-primary);
  background-color: var(--theme-bg-primary);
}

.condition-editor__logic-pill:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 2px;
}

.condition-editor__remove {
  color: var(--theme-text-muted);
}

.condition-editor__remove:hover {
  color: var(--theme-error);
}
</style>
