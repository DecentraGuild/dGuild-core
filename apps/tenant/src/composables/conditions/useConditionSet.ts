/**
 * Unified condition set composable. One logic for all condition types.
 * Used by both Discord (role assignment) and Shipment (JSON generation).
 *
 * Condition types: HOLDING, TRAIT, WHITELIST, SHIPMENT, SNAPSHOTS, DISCORD
 */
import { ref, computed, reactive, type Ref } from 'vue'
import { toRawUnits, fromRawUnits } from '@decentraguild/display'
import type { CatalogMint } from '~/types/mints'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'

export interface FormCondition {
  type: string
  mint_or_group: string
  trait_key?: string
  trait_value?: string
  required_role_id?: string
  logic_to_next?: 'AND' | 'OR'
  amount?: string
  begin_date?: string
  end_date?: string
  days?: string
  begin_snapshot_at?: string
  end_snapshot_at?: string
  min_percent?: string
}

const CONDITION_TYPES = [
  { id: 'HOLDING', label: 'Holding' },
  { id: 'TRAIT', label: 'Trait' },
  { id: 'WHITELIST', label: 'Whitelist' },
  { id: 'SHIPMENT', label: 'Period' },
  { id: 'SNAPSHOTS', label: 'Snapshots' },
  { id: 'TIME_WEIGHTED', label: 'Time weighted' },
  { id: 'DISCORD', label: 'Discord role' },
]

const MAX_CONDITIONS = 10

export function useConditionSet(catalogMints: Ref<CatalogMint[]>) {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)

  const gateLists = ref<Array<{ address: string; name: string }>>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const saving = ref(false)
  const saveError = ref<string | null>(null)

  const editingSetId = ref<number | null>(null)

  const form = reactive({
    name: '',
    ruleType: 'binary' as 'binary' | 'weighted',
    discordRoleId: '',
    minPercent: '',
    conditions: [] as FormCondition[],
  })

  const conditionTypes = computed(() => CONDITION_TYPES)

  const mintsWithHolders = computed(() =>
    catalogMints.value.filter((m) => m.track_holders === true),
  )

  const mintsWithSnapshot = computed(() =>
    catalogMints.value.filter((m) => m.track_snapshot === true),
  )

  function getDecimalsForMint(mint: string): number {
    const catalogMint = catalogMints.value.find((m) => m.asset_id === mint)
    if (catalogMint?.kind === 'NFT') return 0
    const dec = catalogMint?.decimals
    if (dec != null && Number.isFinite(dec)) return dec
    throw new Error(`Decimals for mint ${mint} are missing. Add the mint to Address Book first to fetch metadata.`)
  }

  function isConditionFilled(c: FormCondition): boolean {
    if (c.type === 'HOLDING' || c.type === 'TRAIT') return !!c.mint_or_group?.trim()
    if (c.type === 'WHITELIST') return !!c.mint_or_group?.trim()
    if (c.type === 'DISCORD') return !!c.required_role_id?.trim()
    if (c.type === 'SHIPMENT') {
      return !!(
        c.mint_or_group?.trim() &&
        c.begin_date &&
        c.end_date &&
        c.begin_date <= c.end_date
      )
    }
    if (c.type === 'SNAPSHOTS') {
      const days = Math.floor(Number(c.days) || 0)
      return !!(c.mint_or_group?.trim() && days >= 1)
    }
    if (c.type === 'TIME_WEIGHTED') {
      return !!(
        c.mint_or_group?.trim() &&
        c.begin_snapshot_at &&
        c.end_snapshot_at &&
        c.begin_snapshot_at <= c.end_snapshot_at
      )
    }
    return false
  }

  function addCondition() {
    if (form.conditions.length >= MAX_CONDITIONS) return
    const last = form.conditions[form.conditions.length - 1]
    if (last) last.logic_to_next = last.logic_to_next === 'OR' ? 'OR' : 'AND'
    form.conditions.push({
      type: 'HOLDING',
      mint_or_group: '',
      logic_to_next: undefined,
      amount: '1',
    })
  }

  function removeCondition(idx: number) {
    form.conditions.splice(idx, 1)
    if (idx > 0 && form.conditions[idx - 1]) form.conditions[idx - 1]!.logic_to_next = 'AND'
    if (form.conditions.length === 1) form.conditions[0]!.logic_to_next = undefined
    if (form.conditions.length === 0) addCondition()
  }

  function onLogicChange(idx: number) {
    const cond = form.conditions[idx]
    if (!cond) return
    const isLast = idx === form.conditions.length - 1
    if (!isLast) return
    if (cond.logic_to_next === 'AND' || cond.logic_to_next === 'OR') addCondition()
  }

  function clearTraitWhenTokenChanges(cond: FormCondition) {
    if (cond.type === 'HOLDING') {
      cond.trait_key = ''
      cond.trait_value = ''
    }
  }

  function clearDatesWhenMintChanges(cond: FormCondition) {
    if (cond.type === 'SHIPMENT') {
      cond.begin_date = ''
      cond.end_date = ''
    }
  }

  function clearDaysWhenMintChanges(cond: FormCondition) {
    if (cond.type === 'SNAPSHOTS') {
      cond.days = ''
    }
  }

  function clearSnapshotsWhenMintChanges(cond: FormCondition) {
    if (cond.type === 'TIME_WEIGHTED') {
      cond.begin_snapshot_at = ''
      cond.end_snapshot_at = ''
    }
  }

  function traitOptionsForCondition(idx: number): { trait_keys: string[]; trait_options: Record<string, string[]> } {
    const cond = form.conditions[idx]
    if (cond?.type !== 'HOLDING' && cond?.type !== 'TRAIT') return { trait_keys: [], trait_options: {} }
    const asset = cond.mint_or_group?.trim()
    if (!asset) return { trait_keys: [], trait_options: {} }
    const catalogMint = catalogMints.value.find((m) => m.asset_id === asset)
    if (catalogMint?.kind !== 'NFT') return { trait_keys: [], trait_options: {} }
    return {
      trait_keys: catalogMint.trait_keys ?? [],
      trait_options: catalogMint.trait_options ?? {},
    }
  }

  function traitValueOptionsForCondition(idx: number): string[] {
    const cond = form.conditions[idx]
    const key = cond?.trait_key?.trim()
    if (!key) return []
    const { trait_options } = traitOptionsForCondition(idx)
    return trait_options[key] ?? []
  }

  function amountToRaw(c: FormCondition): number {
    const human = Number(c.amount) || 1
    const mint = c.mint_or_group?.trim()
    const decimals = mint ? getDecimalsForMint(mint) : 0
    const rawStr = toRawUnits(Math.max(0, human), decimals)
    return Math.max(1, Math.floor(Number(rawStr)))
  }

  function toConditionRows() {
    const raw = form.conditions.filter((c: FormCondition) => isConditionFilled(c))
    return raw.map((c: FormCondition, i: number) => {
      const logic_to_next = i < raw.length - 1 ? (c.logic_to_next === 'OR' ? 'OR' : 'AND') : null
      if (c.type === 'DISCORD') {
        return {
          type: 'DISCORD' as const,
          payload: { required_role_id: (c.required_role_id ?? '').trim() },
          logic_to_next,
        }
      }
      if (c.type === 'WHITELIST') {
        return { type: 'WHITELIST' as const, payload: { list_address: c.mint_or_group.trim() }, logic_to_next }
      }
      if (c.type === 'SHIPMENT') {
        return {
          type: 'SHIPMENT' as const,
          payload: {
            mint: c.mint_or_group.trim(),
            begin_date: c.begin_date!,
            end_date: c.end_date!,
            amount: amountToRaw(c),
          },
          logic_to_next,
        }
      }
      if (c.type === 'SNAPSHOTS') {
        return {
          type: 'SNAPSHOTS' as const,
          payload: {
            mint: c.mint_or_group.trim(),
            amount: amountToRaw(c),
            days: Math.max(1, Math.floor(Number(c.days) || 1)),
          },
          logic_to_next,
        }
      }
      if (c.type === 'TIME_WEIGHTED') {
        const minPercent = Math.max(0, Math.min(100, Math.floor(Number(form.minPercent) || 0)))
        return {
          type: 'TIME_WEIGHTED' as const,
          payload: {
            mint: c.mint_or_group.trim(),
            begin_snapshot_at: c.begin_snapshot_at!,
            end_snapshot_at: c.end_snapshot_at!,
            ...(minPercent > 0 && { min_percent: minPercent }),
          },
          logic_to_next,
        }
      }
      const mint = c.mint_or_group.trim()
      const catalogMint = catalogMints.value.find((m) => m.asset_id === mint)
      if (catalogMint?.kind === 'NFT' && (c.trait_key?.trim() || c.trait_value?.trim())) {
        return {
          type: 'TRAIT' as const,
          payload: {
            mint,
            amount: amountToRaw(c),
            trait_key: c.trait_key?.trim() || undefined,
            trait_value: c.trait_value?.trim() || undefined,
          },
          logic_to_next,
        }
      }
      return { type: 'HOLDING' as const, payload: { mint, amount: amountToRaw(c) }, logic_to_next }
    })
  }

  function payloadToFormCondition(c: { type: string; payload: unknown; logic_to_next: string | null }, i: number, total: number): FormCondition {
    const raw = c.payload
    let p: Record<string, unknown> = {}
    if (typeof raw === 'string') {
      try {
        p = (JSON.parse(raw) as Record<string, unknown>) ?? {}
      } catch {
        p = {}
      }
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      p = raw as Record<string, unknown>
    }
    const getStr = (key: string, ...altKeys: string[]) => {
      for (const k of [key, ...altKeys]) {
        const v = p[k]
        if (v != null && typeof v === 'string') return v.trim()
        if (v != null && typeof v === 'number') return String(v).trim()
      }
      return ''
    }
    const getNum = (key: string) => {
      const v = p[key]
      if (typeof v === 'number' && !Number.isNaN(v)) return v
      if (typeof v === 'string') {
        const n = Number(v)
        return !Number.isNaN(n) ? n : undefined
      }
      return undefined
    }
    const mint =
      c.type === 'WHITELIST'
        ? getStr('list_address')
        : getStr('mint', 'collection_or_mint', 'list_address')
    const amountRaw = getNum('amount')
    const days = getNum('days')
    const minPercent = getNum('min_percent')
    const beginSnapshotAt = getStr('begin_snapshot_at')
    const endSnapshotAt = getStr('end_snapshot_at')
    const isLast = i === total - 1
    const decimals = mint ? getDecimalsForMint(mint) : 0
    const amountHuman =
      amountRaw != null && !Number.isNaN(amountRaw)
        ? fromRawUnits(amountRaw, decimals)
        : 1
    const amountStr = String(Math.max(1, Math.floor(amountHuman)))
    return {
      type: (c.type || 'HOLDING').trim(),
      mint_or_group: mint,
      trait_key: getStr('trait_key') || undefined,
      trait_value: getStr('trait_value') || undefined,
      required_role_id: getStr('required_role_id') || undefined,
      logic_to_next: (isLast ? undefined : (c.logic_to_next === 'OR' ? 'OR' : 'AND')) as FormCondition['logic_to_next'],
      amount: amountStr,
      begin_date: getStr('begin_date'),
      end_date: getStr('end_date'),
      days: days != null && !Number.isNaN(days) ? String(Math.max(1, Math.floor(days))) : '',
      begin_snapshot_at: beginSnapshotAt || undefined,
      end_snapshot_at: endSnapshotAt || undefined,
      min_percent: minPercent != null && !Number.isNaN(minPercent) ? String(Math.max(0, Math.min(100, Math.floor(minPercent)))) : undefined,
    }
  }

  async function fetchGateLists() {
    const id = tenantId.value
    if (!id) return
    try {
      const supabase = useSupabase()
      const { data } = await supabase.from('gate_lists').select('address, name').eq('tenant_id', id)
      gateLists.value = (data ?? []).map((l) => ({
        address: l.address as string,
        name: l.name as string,
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load gate lists'
    }
  }

  function resetForm(ruleType: 'binary' | 'weighted' = 'binary') {
    form.name = ''
    form.ruleType = ruleType
    form.discordRoleId = ''
    form.minPercent = ''
    if (ruleType === 'weighted') {
      form.conditions = [{ type: 'TIME_WEIGHTED', mint_or_group: '', logic_to_next: undefined }]
    } else {
      form.conditions = [{ type: 'HOLDING', mint_or_group: '', logic_to_next: undefined, amount: '1' }]
    }
    editingSetId.value = null
  }

  async function loadFromConditionSet(setId: number): Promise<number | void> {
    const id = tenantId.value
    if (!id) return
    loading.value = true
    error.value = null
    try {
      const supabase = useSupabase()
      await fetchGateLists()

      const { data: set } = await supabase
        .from('condition_sets')
        .select('id, tenant_id, name, rule_type')
        .eq('id', setId)
        .maybeSingle()
      if (!set || (set.tenant_id as string) !== id) return

      form.name = (set.name as string) ?? ''
      form.ruleType = (set.rule_type as 'binary' | 'weighted') ?? 'binary'
      editingSetId.value = setId

      const { data: conditions } = await supabase
        .from('condition_set_conditions')
        .select('type, payload, logic_to_next')
        .eq('condition_set_id', setId)
        .order('id')

      const rows = (conditions ?? []) as Array<{
        type: string
        payload: unknown
        logic_to_next: string | null
      }>
      form.conditions = rows.length
        ? rows.map((c, i) => payloadToFormCondition(c, i, rows.length))
        : [{ type: 'HOLDING', mint_or_group: '', logic_to_next: undefined, amount: '1' }]
      if (form.conditions.length === 0) addCondition()

      const tw = form.conditions.find((c: FormCondition) => c.type === 'TIME_WEIGHTED')
      form.minPercent = tw?.min_percent ?? ''

      const { data: discordRule } = await supabase
        .from('discord_role_rules')
        .select('discord_role_id')
        .eq('condition_set_id', setId)
        .maybeSingle()
      form.discordRoleId = (discordRule?.discord_role_id as string) ?? ''

      return setId
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load'
    } finally {
      loading.value = false
    }
  }

  async function saveConditionSet(guildId?: string | null): Promise<number | null> {
    const id = tenantId.value
    if (!id) return null
    const name = form.name?.trim()
    if (!name) {
      saveError.value = 'Name is required'
      return null
    }
    const filled = form.conditions.filter((c: FormCondition) => isConditionFilled(c))
    if (filled.length === 0) {
      saveError.value = 'Add at least one condition'
      return null
    }
    if (form.ruleType === 'weighted') {
      if (filled.length !== 1 || filled[0]?.type !== 'TIME_WEIGHTED') {
        saveError.value = 'Weighted rule must have exactly one Time weighted condition'
        return null
      }
    }

    saving.value = true
    saveError.value = null
    try {
      const supabase = useSupabase()
      const conditionRows = toConditionRows()

      if (editingSetId.value != null) {
        const setId = editingSetId.value
        await supabase.from('condition_set_conditions').delete().eq('condition_set_id', setId)
        const { error: updateErr } = await supabase
          .from('condition_sets')
          .update({ name, rule_type: form.ruleType, updated_at: new Date().toISOString() })
          .eq('id', setId)
        if (updateErr) throw new Error(updateErr.message)

        const { error: condErr } = await supabase
          .from('condition_set_conditions')
          .insert(conditionRows.map((c: { type: string; payload: unknown; logic_to_next: string | null }) => ({ ...c, condition_set_id: setId })))
        if (condErr) throw new Error(condErr.message)

        if (guildId) {
          await supabase.from('discord_role_rules').delete().eq('condition_set_id', setId)
          if (form.discordRoleId?.trim()) {
            const { error: ruleErr } = await supabase.from('discord_role_rules').insert({
              discord_guild_id: guildId,
              discord_role_id: form.discordRoleId.trim(),
              condition_set_id: setId,
              operator: 'AND',
            })
            if (ruleErr) throw new Error(ruleErr.message)
          }
        }
        return setId
      }

      const { data: newSet, error: setErr } = await supabase
        .from('condition_sets')
        .insert({ tenant_id: id, name, rule_type: form.ruleType })
        .select('id')
        .single()
      if (setErr || !newSet) throw new Error(setErr?.message ?? 'Failed to create condition set')
      const setId = (newSet as { id: number }).id

      const { error: condErr } = await supabase
        .from('condition_set_conditions')
        .insert(conditionRows.map((c: { type: string; payload: unknown; logic_to_next: string | null }) => ({ ...c, condition_set_id: setId })))
      if (condErr) throw new Error(condErr.message)

      if (guildId && form.discordRoleId?.trim()) {
        const { error: ruleErr } = await supabase.from('discord_role_rules').insert({
          discord_guild_id: guildId,
          discord_role_id: form.discordRoleId.trim(),
          condition_set_id: setId,
          operator: 'AND',
        })
        if (ruleErr) throw new Error(ruleErr.message)
      }

      resetForm()
      return setId
    } catch (e) {
      saveError.value = e instanceof Error ? e.message : 'Failed to save'
      return null
    } finally {
      saving.value = false
    }
  }

  return {
    gateLists,
    loading,
    error,
    saving,
    saveError,
    editingSetId,
    conditionTypes,
    form,
    mintsWithSnapshot,
    mintsWithHolders,
    isConditionFilled,
    addCondition,
    removeCondition,
    onLogicChange,
    clearTraitWhenTokenChanges,
    clearDatesWhenMintChanges,
    clearDaysWhenMintChanges,
    clearSnapshotsWhenMintChanges,
    traitOptionsForCondition,
    traitValueOptionsForCondition,
    toConditionRows,
    fetchGateLists,
    loadFromConditionSet,
    payloadToFormCondition,
    resetForm,
    saveConditionSet,
  }
}
