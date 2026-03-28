export function downloadCsvFile(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function csvFilenameSlug(mint: string, kind: 'current' | 'snapshot', snapshotAt?: string | null): string {
  const short = mint.slice(0, 8)
  if (kind === 'snapshot' && snapshotAt) {
    const safe = snapshotAt.replace(/[:.]/g, '-').slice(0, 24)
    return `holders-${short}-snapshot-${safe}.csv`
  }
  return `holders-${short}-current.csv`
}
