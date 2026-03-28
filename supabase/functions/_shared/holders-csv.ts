/** Build RFC4180-safe single-line CSV for wallet + raw amount. */

function escCsvField(s: string): string {
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function buildHoldersCsv(rows: Array<{ wallet: string; amount: string }>): string {
  const lines = ['wallet,amount']
  for (const r of rows) {
    lines.push([escCsvField(r.wallet), escCsvField(r.amount)].join(','))
  }
  return lines.join('\n')
}
