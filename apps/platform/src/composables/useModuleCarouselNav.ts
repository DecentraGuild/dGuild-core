import type { ModuleCatalogEntry } from '@decentraguild/catalog'

export function useModuleCarouselNav(
  modules: MaybeRefOrGetter<ModuleCatalogEntry[]>,
  selectedId: MaybeRefOrGetter<string | null>,
  onSelect: (id: string) => void,
) {
  const selectedIndex = computed(() => {
    const id = toValue(selectedId)
    const list = toValue(modules)
    if (!id) return -1
    return list.findIndex((m) => m.id === id)
  })

  const canGoPrev = computed(() => selectedIndex.value > 0)

  const canGoNext = computed(() => {
    const i = selectedIndex.value
    const list = toValue(modules)
    return i >= 0 && i < list.length - 1
  })

  function goPrev() {
    const i = selectedIndex.value
    const list = toValue(modules)
    if (i > 0) onSelect(list[i - 1]!.id)
  }

  function goNext() {
    const i = selectedIndex.value
    const list = toValue(modules)
    if (i >= 0 && i < list.length - 1) onSelect(list[i + 1]!.id)
  }

  return { selectedIndex, canGoPrev, canGoNext, goPrev, goNext }
}
