<template>
  <SimpleModal
    :model-value="open"
    :title="initialSetId ? 'Edit rule' : 'New rule'"
    extra-wide
    @update:model-value="$emit('update:open', $event)"
  >
    <div class="condition-set-editor">
      <div v-if="showModeToggle" class="condition-set-editor__mode">
        <button
          type="button"
          class="condition-set-editor__mode-btn"
          :class="{ 'condition-set-editor__mode-btn--active': form.ruleType === 'binary' }"
          @click="switchMode('binary')"
        >
          Standard rule
        </button>
        <button
          type="button"
          class="condition-set-editor__mode-btn"
          :class="{ 'condition-set-editor__mode-btn--active': form.ruleType === 'weighted' }"
          @click="switchMode('weighted')"
        >
          Weighted rule
        </button>
      </div>
      <FormInput
        v-model="nameModel"
        label="Name"
        placeholder="Rule name"
        required
        :error="saveError"
      />
      <div v-if="showDiscordRole && (form.ruleType === 'binary' || form.ruleType === 'weighted')" class="condition-set-editor__discord-row">
        <OptionsSelect
          v-model="roleModel"
          :options="discordRoleOptions"
          label="Discord role"
          placeholder="None"
          class="condition-set-editor__role"
        />
        <FormInput
          v-if="form.ruleType === 'weighted'"
          v-model="minPercentModel"
          type="number"
          label="Min %"
          placeholder="0"
          min="0"
          max="100"
          class="condition-set-editor__min-percent"
        />
      </div>
      <div class="condition-set-editor__conditions">
        <h5 class="condition-set-editor__conditions-title">Conditions</h5>
        <div v-if="loading" class="condition-set-editor__loading">
          <Icon icon="lucide:loader-2" class="condition-set-editor__spinner" />
          Loading…
        </div>
        <template v-else>
          <ConditionEditor
            v-for="(cond, idx) in form.conditions"
            :key="idx"
            :cond="cond"
            :condition-types="conditionTypesForMode"
            :mints-with-holders="mintsWithHolders"
            :mints-with-snapshot="mintsWithSnapshot"
            :gate-lists="gateLists"
            :guild-roles="discordRoleOptionsAll"
            :snapshot-dates-for-mint="snapshotDatesForMint(cond.mint_or_group)"
            :snapshot-at-for-mint="snapshotAtForMint(cond.mint_or_group)"
            :trait-keys="traitOptionsForCondition(idx).trait_keys"
            :trait-value-options="traitValueOptionsForCondition(idx)"
            :is-last="idx === form.conditions.length - 1"
            :show-role-selector="true"
            :is-weighted-mode="form.ruleType === 'weighted'"
            @update:type="(v) => (cond.type = v)"
            @update:mint_or_group="(v) => { cond.mint_or_group = v; clearTraitWhenTokenChanges(cond); clearDatesWhenMintChanges(cond); clearDaysWhenMintChanges(cond); clearSnapshotsWhenMintChanges(cond); if (cond.type === 'TIME_WEIGHTED' && v?.trim()) fetchSnapshotAtForMint(v) }"
            @update:amount="(v) => (cond.amount = v)"
            @update:trait_key="(v) => (cond.trait_key = v)"
            @update:trait_value="(v) => (cond.trait_value = v)"
            @update:begin_date="(v) => (cond.begin_date = v)"
            @update:end_date="(v) => (cond.end_date = v)"
            @update:days="(v) => (cond.days = v)"
            @update:begin_snapshot_at="(v) => (cond.begin_snapshot_at = v)"
            @update:end_snapshot_at="(v) => (cond.end_snapshot_at = v)"
            @update:required_role_id="(v) => (cond.required_role_id = v)"
            @update:logic_to_next="(v) => (cond.logic_to_next = v)"
            @logic-change="onLogicChange(idx)"
            @remove="removeCondition(idx)"
          />
          <Button
            v-if="form.ruleType !== 'weighted'"
            variant="outline"
            size="sm"
            class="condition-set-editor__add"
            :disabled="form.conditions.length >= 10"
            @click="addCondition"
          >
            Add condition
          </Button>
        </template>
      </div>
      <div class="condition-set-editor__actions">
        <Button variant="secondary" @click="$emit('update:open', false)">
          Cancel
        </Button>
        <Button
          variant="default"
          :disabled="saving"
          @click="onSave"
        >
          <Icon v-if="saving" icon="lucide:loader-2" class="condition-set-editor__spinner" />
          Save
        </Button>
      </div>
    </div>
  </SimpleModal>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '~/components/ui/button'
import SimpleModal from '~/components/ui/simple-modal/SimpleModal.vue'
import FormInput from '~/components/ui/form-input/FormInput.vue'
import OptionsSelect from '~/components/ui/options-select/OptionsSelect.vue'
import ConditionEditor from '~/components/gates/ConditionEditor.vue'
import { useConditionSet } from '~/composables/conditions/useConditionSet'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import type { CatalogMint } from '~/types/mints'

const props = withDefaults(
  defineProps<{
    open: boolean
    catalogMints: CatalogMint[]
    gateLists: Array<{ address: string; name: string }>
    /** Roles the bot can assign (for set-level role dropdown). Filtered by hierarchy. */
    guildRoles?: Array<{ role_id: string; name: string }>
    /** All guild roles (for DISCORD condition type – checking if user has role). Unfiltered. */
    guildRolesAll?: Array<{ role_id: string; name: string }>
    guildId?: string | null
    initialSetId?: number | null
  }>(),
  { guildRoles: () => [], guildRolesAll: undefined, guildId: null, initialSetId: null }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: []
}>()

const tenantStore = useTenantStore()
const tenantId = computed(() => tenantStore.tenantId)

const catalogMintsRef = computed(() => props.catalogMints)
const {
  form,
  conditionTypes,
  mintsWithHolders,
  mintsWithSnapshot,
  gateLists: csGateLists,
  loading,
  saving,
  saveError,
  addCondition,
  removeCondition,
  onLogicChange,
  clearTraitWhenTokenChanges,
  clearDatesWhenMintChanges,
  clearDaysWhenMintChanges,
  clearSnapshotsWhenMintChanges,
  traitOptionsForCondition,
  traitValueOptionsForCondition,
  loadFromConditionSet,
  resetForm,
  saveConditionSet,
  fetchGateLists,
} = useConditionSet(catalogMintsRef)

const gateLists = computed(() => props.gateLists.length ? props.gateLists : csGateLists.value)

const showDiscordRole = computed(() => !!props.guildId)

const showModeToggle = computed(() => props.initialSetId == null)

const conditionTypesForMode = computed(() => {
  if (form.ruleType === 'weighted') {
    return conditionTypes.value.filter((t) => t.id === 'TIME_WEIGHTED')
  }
  return conditionTypes.value.filter((t) => t.id !== 'TIME_WEIGHTED')
})

function switchMode(mode: 'binary' | 'weighted') {
  if (form.ruleType === mode) return
  resetForm(mode)
}

const snapshotAtByMint = ref<Record<string, string[]>>({})

async function fetchSnapshotAtForMint(mint: string) {
  if (!mint?.trim()) return
  const supabase = useSupabase()
  const { data } = await supabase
    .from('holder_snapshots')
    .select('snapshot_at')
    .eq('mint', mint.trim())
    .order('snapshot_at', { ascending: true })
  const list = (data ?? []).map((r) => String(r.snapshot_at ?? '')).filter(Boolean)
  snapshotAtByMint.value = { ...snapshotAtByMint.value, [mint.trim()]: list }
}

function snapshotAtForMint(mint: string): string[] {
  return snapshotAtByMint.value[mint?.trim() ?? ''] ?? []
}

const discordRoleOptions = computed(() => {
  const base = [{ value: '', label: 'None' }]
  const roles = (props.guildRoles ?? []).map((r) => ({ value: r.role_id, label: r.name || r.role_id }))
  return [...base, ...roles]
})

const discordRoleOptionsAll = computed(() => {
  const roles = (props.guildRolesAll ?? props.guildRoles ?? []).map((r) => ({ value: r.role_id, label: r.name || r.role_id }))
  return roles
})

const nameModel = computed({
  get: () => form.name,
  set: (v) => { form.name = v },
})

const roleModel = computed({
  get: () => form.discordRoleId,
  set: (v) => { form.discordRoleId = v },
})

const minPercentModel = computed({
  get: () => form.minPercent,
  set: (v) => { form.minPercent = v },
})

const snapshotDatesByMint = ref<Record<string, string[]>>({})

async function fetchSnapshotDates() {
  const id = tenantId.value
  if (!id) return
  const supabase = useSupabase()
  const mints = [...new Set(props.catalogMints.filter((m) => m.track_snapshot).map((m) => m.asset_id))]
  if (mints.length === 0) return
  const { data } = await supabase
    .from('tracker_holder_snapshots')
    .select('mint, snapshot_date')
    .eq('tenant_id', id)
    .in('mint', mints)
    .order('snapshot_date')
  const byMint = new Map<string, Set<string>>()
  for (const row of data ?? []) {
    const m = row.mint as string
    const d = String(row.snapshot_date ?? '').slice(0, 10)
    if (!d) continue
    const set = byMint.get(m) ?? new Set()
    set.add(d)
    byMint.set(m, set)
  }
  snapshotDatesByMint.value = Object.fromEntries(
    [...byMint.entries()].map(([m, set]) => [m, [...set].sort()])
  )
}

function snapshotDatesForMint(mint: string): string[] {
  return snapshotDatesByMint.value[mint?.trim() ?? ''] ?? []
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await fetchGateLists()
    await fetchSnapshotDates()
    snapshotAtByMint.value = {}
    if (props.initialSetId != null) {
      await loadFromConditionSet(props.initialSetId)
      for (const c of form.conditions) {
        if (c.mint_or_group?.trim() && c.type === 'TIME_WEIGHTED') {
          await fetchSnapshotAtForMint(c.mint_or_group)
        }
      }
    } else {
      resetForm()
    }
  }
)


async function onSave() {
  const id = await saveConditionSet(props.guildId ?? undefined)
  if (id != null) {
    emit('saved')
    await nextTick()
    emit('update:open', false)
  }
}
</script>

<style scoped>
.condition-set-editor {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-lg);
  color: var(--theme-text-primary);
}

.condition-set-editor__mode {
  display: flex;
  gap: 2px;
  margin-bottom: var(--theme-space-xs);
}

.condition-set-editor__mode-btn {
  padding: 6px 12px;
  font-size: var(--theme-font-sm);
  font-weight: 500;
  color: var(--theme-text-muted);
  background: var(--theme-bg-secondary);
  border: var(--theme-border-thin) solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
}

.condition-set-editor__mode-btn:hover {
  color: var(--theme-text-primary);
  background: var(--theme-bg-muted);
}

.condition-set-editor__mode-btn--active {
  color: var(--theme-primary);
  background: var(--theme-bg-muted);
  border-color: var(--theme-primary);
}

.condition-set-editor__discord-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--theme-space-md);
}

.condition-set-editor__role {
  max-width: 16rem;
}

.condition-set-editor__min-percent {
  width: 5rem;
}

.condition-set-editor__conditions {
  display: flex;
  flex-direction: column;
  gap: var(--theme-space-sm);
}

.condition-set-editor__conditions-title {
  font-size: var(--theme-font-sm);
  font-weight: 600;
  margin: 0;
  color: var(--theme-text-primary);
}

.condition-set-editor__loading {
  display: flex;
  align-items: center;
  gap: var(--theme-space-sm);
  color: var(--theme-text-muted);
  font-size: var(--theme-font-sm);
}

.condition-set-editor__spinner {
  animation: condition-set-editor-spin 1s linear infinite;
}

@keyframes condition-set-editor-spin {
  to { transform: rotate(360deg); }
}

.condition-set-editor__add {
  align-self: flex-start;
  color: var(--theme-text-primary);
  border-color: var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.condition-set-editor__add:hover:not(:disabled) {
  background-color: var(--theme-bg-muted);
  color: var(--theme-text-primary);
}

.condition-set-editor__actions {
  display: flex;
  gap: var(--theme-space-sm);
  justify-content: flex-end;
  padding-top: var(--theme-space-sm);
}

/* Theme-aware overrides for Select/Button inside modal */
.condition-set-editor :deep([data-slot='select-trigger']) {
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-primary);
  border-color: var(--theme-border);
}

.condition-set-editor :deep([data-slot='select-trigger']):focus {
  border-color: var(--theme-primary);
}

.condition-set-editor :deep([data-slot='select-value']) {
  color: var(--theme-text-primary);
}

.condition-set-editor :deep([data-placeholder]) {
  color: var(--theme-text-muted);
}

/* Ensure Cancel and Save buttons use theme */
.condition-set-editor__actions :deep(button:first-child) {
  background-color: var(--theme-bg-secondary);
  border-color: var(--theme-border);
  color: var(--theme-text-primary);
}

.condition-set-editor__actions :deep(button:first-child):hover {
  background-color: var(--theme-bg-muted);
  color: var(--theme-text-primary);
}

.condition-set-editor__actions :deep(button:last-child) {
  background-color: var(--theme-primary);
  color: var(--theme-primary-inverse, #fff);
  border-color: var(--theme-primary);
}

.condition-set-editor__actions :deep(button:last-child):hover:not(:disabled) {
  background-color: var(--theme-primary-hover);
  border-color: var(--theme-primary-hover);
}
</style>
