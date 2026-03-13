/**
 * Composable for fetching and listing condition sets (rules catalog) for a tenant.
 */
import type { Ref } from 'vue'
import { useSupabase } from '~/composables/core/useSupabase'
import { useTenantStore } from '~/stores/tenant'
import { buildConditionSetSummary, type ConditionRow } from '~/composables/conditions/useConditionSummary'
import type { CatalogMint } from '~/types/mints'

export interface ConditionSetItem {
  id: number
  name: string
  conditionCount: number
  conditionSummary?: string
  discordRoleId?: string
  discordRoleName?: string
  ruleType?: 'binary' | 'weighted'
  isWeightedRule?: boolean
}

export interface UseConditionSetCatalogOptions {
  catalogMints?: Ref<CatalogMint[]>
  gateLists?: Ref<Array<{ address: string; name: string }>>
}

export function useConditionSetCatalog(options?: UseConditionSetCatalogOptions) {
  const tenantStore = useTenantStore()
  const tenantId = computed(() => tenantStore.tenantId)

  const items = ref<ConditionSetItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const filter = ref<'all' | 'discord' | 'weighted'>('all')

  const filteredItems = computed(() => {
    if (filter.value === 'all') return items.value
    if (filter.value === 'discord') return items.value.filter((item) => !!item.discordRoleId)
    return items.value.filter((item) => item.ruleType === 'weighted')
  })

  function setFilter(value: 'all' | 'discord' | 'weighted') {
    filter.value = value
  }

  async function fetchCatalog() {
    const id = tenantId.value
    if (!id) return
    loading.value = true
    error.value = null
    try {
      const supabase = useSupabase()
      const { data: sets, error: setsErr } = await supabase
        .from('condition_sets')
        .select('id, name, rule_type')
        .eq('tenant_id', id)
        .order('name')

      if (setsErr) throw new Error(setsErr.message)

      if (!sets?.length) {
        items.value = []
        return
      }

      const ids = sets.map((s) => s.id)
      const [conditionsRes, guildsRes] = await Promise.all([
        supabase.from('condition_set_conditions').select('condition_set_id, type, payload, logic_to_next').in('condition_set_id', ids).order('id'),
        supabase.from('discord_servers').select('discord_guild_id').eq('tenant_id', id),
      ])

      const conditionsBySet = new Map<number, Array<{ type: string; payload: Record<string, unknown>; logic_to_next: string | null }>>()
      for (const c of conditionsRes.data ?? []) {
        const sid = c.condition_set_id as number
        const list = conditionsBySet.get(sid) ?? []
        list.push({
          type: c.type as string,
          payload: (c.payload as Record<string, unknown>) ?? {},
          logic_to_next: c.logic_to_next as string | null,
        })
        conditionsBySet.set(sid, list)
      }

      const guildIds = (guildsRes.data ?? []).map((g) => g.discord_guild_id as string).filter(Boolean)
      const roleNames = new Map<string, string>()
      const discordBySet = new Map<number, { roleId: string; roleName: string; guildId: string }>()
      if (guildIds.length > 0) {
        const { data: rules } = await supabase
          .from('discord_role_rules')
          .select('condition_set_id, discord_role_id, discord_guild_id')
          .in('condition_set_id', ids)
          .in('discord_guild_id', guildIds)
        const { data: roles } = await supabase
          .from('discord_guild_roles')
          .select('discord_guild_id, role_id, name')
          .in('discord_guild_id', guildIds)
        for (const row of roles ?? []) {
          roleNames.set(`${row.discord_guild_id}:${row.role_id}`, (row.name as string) ?? '')
        }
        for (const r of rules ?? []) {
          const sid = r.condition_set_id as number
          if (discordBySet.has(sid)) continue
          const pair = `${r.discord_guild_id}:${r.discord_role_id}`
          discordBySet.set(sid, {
            roleId: r.discord_role_id as string,
            roleName: roleNames.get(pair) ?? (r.discord_role_id as string),
            guildId: r.discord_guild_id as string,
          })
        }
      }

      const catalogMints = options?.catalogMints?.value ?? []
      const gateListsVal = options?.gateLists?.value ?? []

      items.value = sets.map((s) => {
        const discord = discordBySet.get(s.id)
        const conditions = conditionsBySet.get(s.id) ?? []
        const ruleType = (s.rule_type as 'binary' | 'weighted') ?? 'binary'
        const summary = buildConditionSetSummary(conditions as ConditionRow[], {
          catalogMints,
          gateLists: gateListsVal,
          roleNames: roleNames.size ? Object.fromEntries(roleNames) : undefined,
          guildId: discord?.guildId,
        })
        return {
          id: s.id,
          name: (s.name as string) || 'Unnamed',
          conditionCount: conditions.length,
          conditionSummary: summary || undefined,
          ruleType,
          isWeightedRule: ruleType === 'weighted',
          ...(discord && { discordRoleId: discord.roleId, discordRoleName: discord.roleName }),
        }
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load rules'
      items.value = []
    } finally {
      loading.value = false
    }
  }

  async function deleteConditionSet(setId: number) {
    const id = tenantId.value
    if (!id) return
    const supabase = useSupabase()
    const { data: rules } = await supabase
      .from('discord_role_rules')
      .select('id')
      .eq('condition_set_id', setId)
    for (const r of rules ?? []) {
      await supabase.from('discord_role_rules').delete().eq('id', r.id)
    }
    await supabase.from('condition_set_conditions').delete().eq('condition_set_id', setId)
    await supabase.from('condition_sets').delete().eq('id', setId)
    await fetchCatalog()
  }

  return {
    items,
    filteredItems,
    loading,
    error,
    filter,
    setFilter,
    fetchCatalog,
    deleteConditionSet,
  }
}
