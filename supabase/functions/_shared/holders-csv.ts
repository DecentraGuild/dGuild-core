/** Build RFC4180-safe single-line CSV for wallet + raw amount (+ optional child mint for SFT collections). */

function escCsvField(s: string): string {
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function buildHoldersCsv(rows: Array<{ wallet: string; amount: string; mint?: string }>): string {
  const includeMint = rows.some((r) => typeof r.mint === 'string' && r.mint.length > 0)
  const lines = [includeMint ? 'wallet,amount,mint' : 'wallet,amount']
  for (const r of rows) {
    if (includeMint) {
      lines.push([escCsvField(r.wallet), escCsvField(r.amount), escCsvField(r.mint ?? '')].join(','))
    } else {
      lines.push([escCsvField(r.wallet), escCsvField(r.amount)].join(','))
    }
  }
  return lines.join('\n')
}
