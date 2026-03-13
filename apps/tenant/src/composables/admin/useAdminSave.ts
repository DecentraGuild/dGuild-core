/**
 * Shared save state for admin operations.
 * Provides saving/saveError refs and a withSave wrapper for async operations.
 */
export function useAdminSave() {
  const saving = ref(false)
  const saveError = ref<string | null>(null)

  async function withSave<T>(
    fn: () => Promise<T>,
    errorMessage = 'Save failed',
  ): Promise<T | void> {
    saving.value = true
    saveError.value = null
    try {
      return await fn()
    } catch (e) {
      saveError.value = e instanceof Error ? e.message : errorMessage
    } finally {
      saving.value = false
    }
  }

  function clearError() {
    saveError.value = null
  }

  return { saving, saveError, withSave, clearError }
}
