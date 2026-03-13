/**
 * Cache for escrow data when opening the detail modal from a click.
 * Browse and My Trades already have full escrow objects; we store them here
 * so the modal can display immediately instead of refetching.
 */
import { ref } from 'vue'
import type { EscrowWithAddress } from '@decentraguild/web3'

const preload = ref<{ id: string; escrow: EscrowWithAddress } | null>(null)

export function useEscrowPreload() {
  function set(id: string, escrow: EscrowWithAddress) {
    preload.value = { id, escrow }
  }

  function getAndClear(id: string): EscrowWithAddress | null {
    const entry = preload.value
    const hit = entry && entry.id === id
    if (!hit) return null
    preload.value = null
    return entry.escrow
  }

  return { set, getAndClear }
}
