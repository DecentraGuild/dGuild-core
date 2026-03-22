import { watch, onBeforeUnmount, type ComputedRef } from 'vue'
import { useThemeStore } from '@decentraguild/ui'
import type { TenantBranding, TenantTheme } from '@decentraguild/core'

export function useAdminLiveTheme(
  tab: ComputedRef<string>,
  /** Reactive `form.branding` from admin form (mutated by theme controls). */
  formBranding: { theme: TenantTheme },
  persistedBranding: () => TenantBranding | undefined,
) {
  const themeStore = useThemeStore()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function applyPersistedTheme() {
    const b = persistedBranding()
    themeStore.loadTheme(b?.theme ?? {}, b)
  }

  function scheduleLiveApply() {
    if (tab.value !== 'theming') return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const b = persistedBranding()
      themeStore.loadTheme(formBranding.theme as Partial<TenantTheme>, {
        logo: b?.logo,
        name: b?.name,
        shortName: b?.shortName,
      })
    }, 120)
  }

  watch(
    () => formBranding.theme,
    () => {
      if (tab.value === 'theming') scheduleLiveApply()
    },
    { deep: true },
  )

  watch(tab, (id, prev) => {
    if (prev === 'theming' && id !== 'theming') {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      applyPersistedTheme()
    }
    if (id === 'theming') scheduleLiveApply()
  })

  onBeforeUnmount(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    applyPersistedTheme()
  })
}
