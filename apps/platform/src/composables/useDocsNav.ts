import { getDocsOrder } from '~/composables/useDocFromCatalog'

export interface DocsNavItem {
  path: string
  label: string
}

const docsOrder: DocsNavItem[] = getDocsOrder()

export function useDocsNav(currentPath: string): { prev: DocsNavItem | null; next: DocsNavItem | null } {
  const idx = docsOrder.findIndex((item) => item.path === currentPath)
  if (idx < 0) return { prev: null, next: null }
  return {
    prev: idx > 0 ? (docsOrder[idx - 1] ?? null) : null,
    next: idx < docsOrder.length - 1 ? (docsOrder[idx + 1] ?? null) : null,
  }
}
