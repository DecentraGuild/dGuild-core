import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isModuleNavigable } from './module-catalog-types.js'
import { getModuleCatalogList } from './load-module-catalog.js'

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const tenantPagesDir = path.join(repoRoot, 'apps', 'tenant', 'src', 'pages')

function tenantPageExistsForCatalogRoute(routePath: string): boolean {
  const trimmed = routePath.trim()
  if (!trimmed.startsWith('/')) return false
  const noTrailing = trimmed.replace(/\/$/, '') || '/'
  if (noTrailing === '/') {
    return existsSync(path.join(tenantPagesDir, 'index.vue'))
  }
  const firstSegment = noTrailing.slice(1).split('/').filter(Boolean)[0]
  if (!firstSegment) return false
  const flat = path.join(tenantPagesDir, `${firstSegment}.vue`)
  const nested = path.join(tenantPagesDir, firstSegment, 'index.vue')
  return existsSync(flat) || existsSync(nested)
}

describe('module catalog routePath ↔ tenant pages', () => {
  it('every non-docs, navigable entry has a matching Nuxt page file', () => {
    const list = getModuleCatalogList().filter((m) => !m.docsOnly && isModuleNavigable(m.status))
    for (const entry of list) {
      const ok = tenantPageExistsForCatalogRoute(entry.routePath)
      expect(ok, `${entry.id} routePath "${entry.routePath}" → missing apps/tenant/src/pages segment`).toBe(true)
    }
  })
})
