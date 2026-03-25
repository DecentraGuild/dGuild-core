import { marked } from 'marked'
import { getModuleCatalogList, getModuleCatalogEntry, isModuleInPublicDocs } from '@decentraguild/catalog'

const GENERAL_SLUG_TO_KEY: Record<string, string> = {
  'getting-started': 'gettingStarted',
  'creating-a-dguild': 'creatingDguild',
  directory: 'directory',
  'billing-overview': 'billingOverview',
}

const MODULE_CHAPTERS = ['overview', 'mechanics', 'setup', 'pricing'] as const

export interface DocFromCatalogResult {
  html: string
  title: string
  subtitle: string
}

const INTRO_SUBTITLE = 'Intro'

export function getDocContentFromCatalog(path: string): DocFromCatalogResult | null {
  const normalized = path.replace(/\/$/, '') || '/docs'
  if (normalized === '/docs') {
    const dguild = getModuleCatalogEntry('dguild')
    const raw = dguild?.docs?.overview
    if (!raw) return null
    const html = marked.parse(raw, { async: false }) as string
    return { html, title: 'Overview', subtitle: INTRO_SUBTITLE }
  }
  if (normalized.startsWith('/docs/general/')) {
    const slug = normalized.slice('/docs/general/'.length)
    const key = GENERAL_SLUG_TO_KEY[slug]
    if (!key) return null
    const dguild = getModuleCatalogEntry('dguild')
    const raw = dguild?.docs?.[key]
    if (!raw) return null
    const html = marked.parse(raw, { async: false }) as string
    const title = slug === 'getting-started' ? 'Getting started' : slug === 'creating-a-dguild' ? 'Creating a dGuild' : slug === 'billing-overview' ? 'Billing' : 'Directory'
    return { html, title, subtitle: INTRO_SUBTITLE }
  }
  if (normalized.startsWith('/docs/modules/')) {
    const rest = normalized.slice('/docs/modules/'.length)
    const parts = rest.split('/')
    const id = parts[0] ?? ''
    if (!id) return null
    const chapter = (parts[1] ?? 'overview') as string
    const entry = getModuleCatalogEntry(id)
    if (!entry?.docs) return null
    const docKey = MODULE_CHAPTERS.includes(chapter as (typeof MODULE_CHAPTERS)[number]) ? chapter : 'overview'
    const raw = entry.docs[docKey] ?? entry.docs.overview
    if (!raw) return null
    const html = marked.parse(raw, { async: false }) as string
    const chapterLabel = docKey === 'overview' ? entry.name : docKey.charAt(0).toUpperCase() + docKey.slice(1)
    return { html, title: chapterLabel, subtitle: entry.name }
  }
  return null
}

export interface DocsSidebarSection {
  title: string
  items: { path: string; label: string }[]
}

export function getDocsSidebarSections(): DocsSidebarSection[] {
  const list = getModuleCatalogList()
  const sections: DocsSidebarSection[] = []
  const dguild = list.find((m) => m.id === 'dguild')
  if (dguild?.docs) {
    const introItems: { path: string; label: string }[] = [
      { path: '/docs', label: 'Overview' },
      { path: '/docs/general/getting-started', label: 'Getting started' },
      { path: '/docs/general/creating-a-dguild', label: 'Creating a dGuild' },
      { path: '/docs/general/directory', label: 'Directory' },
      { path: '/docs/general/billing-overview', label: 'Billing' },
    ]
    sections.push({ title: 'Intro', items: introItems })
  }
  for (const m of list) {
    if (m.id === 'dguild' || !m.docs) continue
    if (!isModuleInPublicDocs(m.status)) continue
    const items: { path: string; label: string }[] = [
      { path: `/docs/modules/${m.id}`, label: 'Overview' },
    ]
    if (m.docs.mechanics) items.push({ path: `/docs/modules/${m.id}/mechanics`, label: 'Mechanics' })
    if (m.docs.setup) items.push({ path: `/docs/modules/${m.id}/setup`, label: 'Setup' })
    if (m.docs.pricing) items.push({ path: `/docs/modules/${m.id}/pricing`, label: 'Pricing' })
    sections.push({ title: m.name, items })
  }
  return sections
}

export function getDocsOrder(): { path: string; label: string }[] {
  const list = getModuleCatalogList()
  const order: { path: string; label: string }[] = []
  const dguild = list.find((m) => m.id === 'dguild')
  if (dguild?.docs) {
    order.push({ path: '/docs', label: 'Overview' })
    order.push({ path: '/docs/general/getting-started', label: 'Getting started' })
    order.push({ path: '/docs/general/creating-a-dguild', label: 'Creating a dGuild' })
    order.push({ path: '/docs/general/directory', label: 'Directory' })
    order.push({ path: '/docs/general/billing-overview', label: 'Billing' })
  }
  for (const m of list) {
    if (m.id === 'dguild' || !m.docs) continue
    if (!isModuleInPublicDocs(m.status)) continue
    order.push({ path: `/docs/modules/${m.id}`, label: `${m.name}` })
    if (m.docs.mechanics) order.push({ path: `/docs/modules/${m.id}/mechanics`, label: 'Mechanics' })
    if (m.docs.setup) order.push({ path: `/docs/modules/${m.id}/setup`, label: 'Setup' })
    if (m.docs.pricing) order.push({ path: `/docs/modules/${m.id}/pricing`, label: 'Pricing' })
  }
  return order
}
