export type MarketplaceCsvKind = 'spl' | 'nft' | 'currency'

export interface MarketplaceCsvRow {
  kind: MarketplaceCsvKind
  mint: string
  groupPath: string[]
  storeBps: number | null
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === ',') {
      result.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  result.push(cur)
  return result
}

function normalizeKind(s: string): MarketplaceCsvKind | null {
  const k = s.trim().toLowerCase()
  if (k === 'spl' || k === 'spl_asset') return 'spl'
  if (k === 'nft' || k === 'collection') return 'nft'
  if (k === 'currency') return 'currency'
  return null
}

function normalizePathSegment(seg: string): string {
  return seg.replace(/\\\|/g, '|').trim().replace(/\s+/g, ' ')
}

export function parsePipeGroupPath(raw: string): string[] {
  const t = raw.trim()
  if (!t) return []
  return t.split('|').map(normalizePathSegment).filter((s) => s.length > 0)
}

export function serializeGroupPathForCsv(path: string[]): string {
  return path.map((s) => s.replace(/\|/g, '\\|')).join('|')
}

function escCsvField(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function parseMarketplaceMintCsv(text: string): { rows: MarketplaceCsvRow[]; errors: string[] } {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0)
  if (lines.length < 1) return { rows: [], errors: ['Empty file'] }
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const kindIdx = header.indexOf('kind')
  const mintIdx = header.indexOf('mint')
  const pathIdx = header.indexOf('group_path')
  const bpsIdx = header.indexOf('store_bps')
  if (kindIdx < 0 || mintIdx < 0) {
    return { rows: [], errors: ['CSV must include kind and mint columns'] }
  }
  const rows: MarketplaceCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const kindRaw = cols[kindIdx]?.trim() ?? ''
    const mint = cols[mintIdx]?.trim() ?? ''
    const pathRaw = pathIdx >= 0 ? (cols[pathIdx] ?? '').trim() : ''
    const bpsRaw = bpsIdx >= 0 ? (cols[bpsIdx] ?? '').trim() : ''
    const kind = normalizeKind(kindRaw)
    if (!kind) {
      errors.push(`Line ${i + 1}: invalid kind "${kindRaw}"`)
      continue
    }
    if (mint.length < 32 || mint.length > 48) {
      errors.push(`Line ${i + 1}: invalid mint`)
      continue
    }
    let storeBps: number | null = null
    if (bpsRaw) {
      const n = Number(bpsRaw)
      if (!Number.isInteger(n) || n < 0 || n > 10000) {
        errors.push(`Line ${i + 1}: store_bps must be 0–10000`)
        continue
      }
      storeBps = n
    }
    rows.push({ kind, mint, groupPath: parsePipeGroupPath(pathRaw), storeBps })
  }
  return { rows, errors }
}

export function serializeMarketplaceMintCsv(rows: MarketplaceCsvRow[]): string {
  const lines = [['kind', 'mint', 'group_path', 'store_bps'].join(',')]
  for (const r of rows) {
    const path = serializeGroupPathForCsv(r.groupPath)
    const bps = r.storeBps == null ? '' : String(r.storeBps)
    lines.push([r.kind, escCsvField(r.mint), escCsvField(path), bps].join(','))
  }
  return lines.join('\n')
}
