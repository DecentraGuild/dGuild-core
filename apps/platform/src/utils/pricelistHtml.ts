function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildPricelistHtml(csv: string): string {
  const lines = csv.split(/\r?\n/).map((l) => l.trimEnd())
  const parts: string[] = [
    '<p>Reference fees and billing types. Confirm amounts in Admin before you pay.</p>',
  ]

  type Row = { item: string; amount: string; currency: string; billing: string }
  let section: string | null = null
  let rows: Row[] = []

  const flushSection = () => {
    if (!section || rows.length === 0) return
    parts.push(`<h2>${esc(section)}</h2>`)
    parts.push('<table>')
    parts.push(
      '<thead><tr><th scope="col">Item</th><th scope="col">Amount</th><th scope="col">Currency</th><th scope="col">Billing</th></tr></thead>',
    )
    parts.push('<tbody>')
    for (const r of rows) {
      parts.push(
        `<tr><td>${esc(r.item)}</td><td>${esc(r.amount)}</td><td>${esc(r.currency)}</td><td>${esc(r.billing)}</td></tr>`,
      )
    }
    parts.push('</tbody></table>')
    section = null
    rows = []
  }

  for (const line of lines) {
    if (!line.trim()) continue
    const cells = line.split(',').map((c) => c.trim())
    const item = cells[1] ?? ''
    const amount = cells[2] ?? ''
    const currency = cells[3] ?? ''
    const billing = cells[4] ?? ''

    if (!item && !amount && !currency && !billing) {
      flushSection()
      continue
    }

    if (item && !amount && !currency && !billing) {
      flushSection()
      section = item
      continue
    }

    if (item && amount) {
      if (!section) section = 'Other'
      rows.push({ item, amount, currency, billing })
    }
  }

  flushSection()
  return parts.join('\n')
}
