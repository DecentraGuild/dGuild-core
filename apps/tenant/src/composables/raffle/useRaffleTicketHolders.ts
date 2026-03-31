import { ref, watch, type Ref } from 'vue'
import { fetchRaffleTicketHoldersAggregated, type RaffleHolderBalanceRow } from '@decentraguild/web3'
import { useRpc } from '@decentraguild/nuxt-composables'

export interface RaffleHolderDisplayRow {
  owner: string
  tickets: string
  sharePercent: number
}

export function useRaffleTicketHolders(
  context: Ref<{
    rafflePubkey: string
    ticketMint: string
    ticketsSold: number
    ticketDecimals: number
  } | null>,
) {
  const { rpcUrl, hasRpc } = useRpc()
  const loading = ref(false)
  const error = ref<string | null>(null)
  const rows = ref<RaffleHolderDisplayRow[]>([])
  const rawRows = ref<RaffleHolderBalanceRow[]>([])
  const matchesSold = ref(true)

  async function refresh() {
    const c = context.value
    error.value = null
    rows.value = []
    rawRows.value = []
    matchesSold.value = true
    if (!c || c.ticketsSold < 1) return
    if (!hasRpc.value || !rpcUrl.value) {
      error.value = 'Helius RPC is not configured. Entries require NUXT_PUBLIC_HELIUS_RPC.'
      return
    }
    loading.value = true
    try {
      const res = await fetchRaffleTicketHoldersAggregated(
        rpcUrl.value,
        c.rafflePubkey,
        c.ticketMint,
        c.ticketsSold,
        c.ticketDecimals,
      )
      if (!res) {
        error.value = 'Could not load ticket holders. Try again later.'
        return
      }
      rawRows.value = res.rows
      matchesSold.value = res.matchesSold
      const sold = Math.max(1, res.ticketsSoldOnChain)
      rows.value = res.rows.map((r) => ({
        owner: r.owner,
        tickets: r.tickets.toString(),
        sharePercent: (Number(r.tickets) / sold) * 100,
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load entries'
    } finally {
      loading.value = false
    }
  }

  watch([context, rpcUrl, hasRpc], refresh, { immediate: true })

  return {
    loading,
    error,
    rows,
    rawRows,
    matchesSold,
    refresh,
  }
}
