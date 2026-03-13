/**
 * Composable for gate list modal state: create and delete.
 * Form state and submit logic stay in the consuming component.
 */
export function useAdminGateModals() {
  const showCreateModal = ref(false)
  const showDeleteModal = ref(false)
  const deletingListAddress = ref<string | null>(null)

  function openCreateModal() {
    showCreateModal.value = true
  }

  function closeCreateModal() {
    showCreateModal.value = false
  }

  function openDeleteModal(listAddress: string) {
    deletingListAddress.value = listAddress
    showDeleteModal.value = true
  }

  function closeDeleteModal() {
    showDeleteModal.value = false
    deletingListAddress.value = null
  }

  return {
    showCreateModal,
    showDeleteModal,
    deletingListAddress,
    openCreateModal,
    closeCreateModal,
    openDeleteModal,
    closeDeleteModal,
  }
}
