/**
 * Whitelist config registry: read/write {tenantId}.json from WHITELIST_CONFIG_PATH.
 * Shape: { lists: [{ address, name, authority }] }
 */

import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { isValidTenantIdentifier } from '../validate-slug.js'

export interface WhitelistListEntry {
  address: string
  name: string
  authority: string
  /** Optional image URL for UI cards (not on-chain). */
  imageUrl?: string | null
}

export interface WhitelistConfig {
  tenantId: string
  lists: WhitelistListEntry[]
}

const DEFAULT_WHITELIST_CONFIG_PATH = 'configs/whitelist'

function resolveWhitelistConfigDir(): string | null {
  const envPath = process.env.WHITELIST_CONFIG_PATH
  if (envPath && typeof envPath === 'string') {
    return path.resolve(envPath)
  }
  const cwd = process.cwd()
  const fromCwd = path.join(cwd, DEFAULT_WHITELIST_CONFIG_PATH)
  if (existsSync(fromCwd)) return fromCwd
  const monorepoFallback = path.join(cwd, '..', '..', 'configs', 'whitelist')
  if (existsSync(monorepoFallback)) return monorepoFallback
  return fromCwd
}

export function getWhitelistConfigDir(): string | null {
  return resolveWhitelistConfigDir()
}

export async function loadWhitelistByTenantId(tenantId: string): Promise<WhitelistConfig | null> {
  if (!isValidTenantIdentifier(tenantId)) return null
  const dir = getWhitelistConfigDir()
  if (!dir) return null
  const filePath = path.join(dir, `${tenantId}.json`)
  try {
    const raw = await readFile(filePath, 'utf-8')
    const config = JSON.parse(raw) as WhitelistConfig
    if (!Array.isArray(config.lists)) config.lists = []
    config.tenantId = tenantId
    return config
  } catch {
    return { tenantId, lists: [] }
  }
}

export async function writeWhitelistByTenantId(tenantId: string, config: WhitelistConfig): Promise<void> {
  if (!isValidTenantIdentifier(tenantId)) throw new Error('Invalid tenant identifier')
  const dir = getWhitelistConfigDir()
  if (!dir) throw new Error('WHITELIST_CONFIG_PATH not set')
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${tenantId}.json`)
  const payload = JSON.stringify({ ...config, tenantId }, null, 2)
  await writeFile(filePath, payload, 'utf-8')
}

export async function listWhitelistTenantIds(): Promise<string[]> {
  const dir = getWhitelistConfigDir()
  if (!dir) return []
  try {
    const files = await readdir(dir)
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .filter(Boolean)
  } catch {
    return []
  }
}
