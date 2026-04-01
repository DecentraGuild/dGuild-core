import { ref, watch, type Ref } from 'vue'
import type { Connection } from '@solana/web3.js'
import { fetchRaffleTicketHoldersAggregated, type RaffleHolderBalanceRow } from '@decentraguild/web3'

export interface RaffleHolderDisplayRow {
  owner: string
  tickets: string
  sharePercent: number
}

export function useRaffleTicketHolders(
  connection: Ref<Connection | null>,
  context: Ref<{
    rafflePubkey: string
    ticketsSold: number
  } | null>,
) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const rows = ref<RaffleHolderDisplayRow[]>([])
  const rawRows = ref<RaffleHolderBalanceRow[]>([])
  const matchesSold = ref(true)

  let fetchGen = 0

  async function refresh() {
    const gen = ++fetchGen
    const c = context.value
    const conn = connection.value
    error.value = null
    rows.value = []
    rawRows.value = []
    matchesSold.value = true
    if (!c || c.ticketsSold < 1) return
    if (!conn) {
      error.value = 'Connect to the network to load entries.'
      return
    }
    loading.value = true
    try {
      const res = await fetchRaffleTicketHoldersAggregated(conn, c.rafflePubkey, c.ticketsSold)
      if (gen !== fetchGen) return
      rawRows.value = res.rows
      matchesSold.value = res.matchesSold
      const sold = Math.max(1, res.ticketsSoldOnChain)
      rows.value = res.rows.map((r) => ({
        owner: r.owner,
        tickets: r.tickets.toString(),
        sharePercent: (Number(r.tickets) / sold) * 100,
      }))
    } catch (e) {
      if (gen !== fetchGen) return
      error.value = e instanceof Error ? e.message : 'Failed to load entries'
    } finally {
      if (gen === fetchGen) loading.value = false
    }
  }

  watch([context, connection], refresh, { immediate: true })

  return {
    loading,
    error,
    rows,
    rawRows,
    matchesSold,
    refresh,
  }
}
