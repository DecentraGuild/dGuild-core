import type { RaffleItem, SlotCard } from '~/composables/raffles/useRaffleSlots'

export type RaffleModalMode = 'create' | 'edit' | 'addReward' | 'start' | 'upgrade'

/**
 * Composable for raffle modal state: mode, selected items, title, wide flag, open/close.
 * Form reset and submit logic stay in the consuming component.
 */
export function useAdminRaffleModals() {
  const raffleModalMode = ref<RaffleModalMode | null>(null)
  const selectedRaffleForReward = ref<RaffleItem | null>(null)
  const selectedRaffleForStart = ref<SlotCard | null>(null)
  const selectedRaffleForEdit = ref<SlotCard | null>(null)

  const raffleModalTitle = computed(() =>
    raffleModalMode.value === 'upgrade' ? 'Unlock more slots'
    : raffleModalMode.value === 'addReward' ? 'Add reward'
    : raffleModalMode.value === 'start' ? 'Start raffle'
    : raffleModalMode.value === 'edit' ? 'Edit raffle'
    : raffleModalMode.value === 'create' ? 'Create raffle'
    : ''
  )

  const raffleModalWide = computed(() =>
    raffleModalMode.value === 'addReward' || raffleModalMode.value === 'edit' || raffleModalMode.value === 'create'
  )

  function closeRaffleModal() {
    raffleModalMode.value = null
    selectedRaffleForReward.value = null
    selectedRaffleForStart.value = null
    selectedRaffleForEdit.value = null
  }

  function openCreateModal() {
    raffleModalMode.value = 'create'
  }

  function openEditRaffleModal(slot: SlotCard) {
    selectedRaffleForEdit.value = slot
    raffleModalMode.value = 'edit'
  }

  function openAddRewardModal(raffle: RaffleItem) {
    selectedRaffleForReward.value = raffle
    raffleModalMode.value = 'addReward'
  }

  function openStartRaffleModal(slot: SlotCard) {
    selectedRaffleForStart.value = slot
    raffleModalMode.value = 'start'
  }

  function openUpgradeModal() {
    raffleModalMode.value = 'upgrade'
  }

  return {
    raffleModalMode,
    selectedRaffleForReward,
    selectedRaffleForStart,
    selectedRaffleForEdit,
    raffleModalTitle,
    raffleModalWide,
    closeRaffleModal,
    openCreateModal,
    openEditRaffleModal,
    openAddRewardModal,
    openStartRaffleModal,
    openUpgradeModal,
  }
}
