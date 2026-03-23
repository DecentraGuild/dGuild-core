import { ref } from 'vue'
import { useSupabase } from '~/composables/core/useSupabase'

export interface RafflePlan {
  slotLimit: number
  recurringUsdc: number
  perRaffleUsdc: number
}

interface TierRuleRow {
  min_quantity: number
  max_quantity: number | null
  unit_price: number | null
  tier_price: number | null
}

function rowToPlan(row: TierRuleRow): RafflePlan | null {
  if (row.max_quantity == null || !Number.isFinite(row.max_quantity)) return null
  return {
    slotLimit: row.max_quantity,
    recurringUsdc: row.tier_price ?? 0,
    perRaffleUsdc: row.unit_price ?? 0,
  }
}

async function fetchRaffleSlotPlans(
  supabase: ReturnType<typeof useSupabase>,
): Promise<{ grow: RafflePlan; pro: RafflePlan }> {
  const { data, error } = await supabase
    .from('tier_rules')
    .select('min_quantity, max_quantity, unit_price, tier_price')
    .eq('product_key', 'raffles')
    .eq('meter_key', 'raffle_slots')
    .order('min_quantity', { ascending: true })

  if (error) throw new Error(error.message)
  if (!data || data.length < 3) {
    throw new Error(
      'raffle_slots tier_rules must list at least three rows (base plus two upgrades) ordered by min_quantity',
    )
  }

  const grow = rowToPlan(data[1] as TierRuleRow)
  const pro = rowToPlan(data[2] as TierRuleRow)
  if (!grow || !pro) {
    throw new Error('raffle_slots upgrade rows in tier_rules must set max_quantity')
  }

  return { grow, pro }
}

export function useRaffleUpgradePlans() {
  const supabase = useSupabase()

  const grow = ref<RafflePlan | null>(null)
  const pro = ref<RafflePlan | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPlans() {
    loading.value = true
    error.value = null
    try {
      const { grow: g, pro: p } = await fetchRaffleSlotPlans(supabase)
      grow.value = g
      pro.value = p
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load plans'
      grow.value = null
      pro.value = null
    } finally {
      loading.value = false
    }
  }

  return { grow, pro, loading, error, fetchPlans }
}
