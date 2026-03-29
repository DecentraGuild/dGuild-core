import { describe, it, expect, beforeEach } from 'vitest'
import { resolveQuote } from './quote.js'
import { charge } from './charge.js'
import { confirm } from './confirm.js'
import { registerAllAdapters } from '../adapters/index.js'
import type { PaymentProvider } from '../types.js'

registerAllAdapters()

type Row = Record<string, unknown>

/**
 * Minimal mock that mimics the Supabase PostgREST builder chain.
 * Each `.from()` call creates a fresh query context; the returned object
 * is thenable so `await db.from(t).select(c).eq(f,v)` resolves to `{ data, error }`.
 */
function createMockDb(tables: Record<string, Row[]> = {}) {
  const store: Record<string, Row[]> = { ...tables }

  function getTable(name: string): Row[] {
    if (!store[name]) store[name] = []
    return store[name]
  }

  function makeChain(table: string) {
    const filters: Array<{ field: string; op: string; value: unknown }> = []
    let limitN: number | null = null
    let order: { field: string; ascending: boolean } | null = null
    let pendingInsert: Row | null = null
    let pendingUpdate: Row | null = null
    let isSingle = false
    let isMaybeSingle = false

    function applyFilters(rows: Row[]): Row[] {
      let result = rows
      for (const f of filters) {
        result = result.filter((r) => {
          if (f.op === 'eq') return r[f.field] === f.value
          if (f.op === 'gt') return (r[f.field] as string) > (f.value as string)
          if (f.op === 'is') return r[f.field] === f.value
          return true
        })
      }
      if (order) {
        const { field, ascending } = order
        result.sort((a, b) => {
          const va = String(a[field] ?? '')
          const vb = String(b[field] ?? '')
          return ascending ? va.localeCompare(vb) : vb.localeCompare(va)
        })
      }
      if (limitN != null) result = result.slice(0, limitN)
      return result
    }

    function resolve(): { data: unknown; error: null } {
      if (pendingInsert) {
        if (isSingle || isMaybeSingle) return { data: pendingInsert, error: null }
        return { data: [pendingInsert], error: null }
      }
      if (pendingUpdate) {
        if (isSingle || isMaybeSingle) return { data: pendingUpdate, error: null }
        return { data: [pendingUpdate], error: null }
      }
      const rows = applyFilters(getTable(table))
      if (isSingle || isMaybeSingle) return { data: rows[0] ?? null, error: null }
      return { data: rows, error: null }
    }

    const chain: Record<string, unknown> = {
      select(_cols: string) { return chain },
      eq(field: string, value: unknown) { filters.push({ field, op: 'eq', value }); return chain },
      gt(field: string, value: unknown) { filters.push({ field, op: 'gt', value }); return chain },
      is(field: string, value: unknown) { filters.push({ field, op: 'is', value }); return chain },
      order(field: string, opts?: { ascending?: boolean }) {
        order = { field, ascending: opts?.ascending ?? true }
        return chain
      },
      limit(n: number) { limitN = n; return chain },
      single() { isSingle = true; return Promise.resolve(resolve()) },
      maybeSingle() { isMaybeSingle = true; return Promise.resolve(resolve()) },
      insert(row: Row | Row[]) {
        const tbl = getTable(table)
        const toInsert = Array.isArray(row) ? row : [row]
        for (const r of toInsert) {
          const withId = { id: `${table}-${tbl.length + 1}`, ...r }
          tbl.push(withId)
          pendingInsert = withId
        }
        return chain
      },
      update(row: Row) {
        const rows = applyFilters(getTable(table))
        for (const r of rows) Object.assign(r, row)
        pendingUpdate = rows[0] ?? null
        return chain
      },
      upsert(row: Row, _opts?: unknown) {
        getTable(table).push(row)
        pendingInsert = row
        return chain
      },
      then(onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(resolve()).then(onFulfilled, onRejected)
      },
    }
    return chain
  }

  return { from: (table: string) => makeChain(table), _store: store }
}

const TIER_RULES = [
  { min_quantity: 1, max_quantity: 5, unit_price: 5, tier_price: null, label: 'Starter' },
  { min_quantity: 6, max_quantity: 20, unit_price: 4, tier_price: null, label: 'Growth' },
  { min_quantity: 21, max_quantity: null, unit_price: 3, tier_price: null, label: 'Scale' },
]

const DURATION_RULES = [
  { duration_days: 0, price_multiplier: 0 },
  { duration_days: 30, price_multiplier: 1 },
  { duration_days: 90, price_multiplier: 2.7 },
  { duration_days: 365, price_multiplier: 10 },
]

describe('Billing Engine – quote → charge → confirm', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb({
      watchtower_watches: [
        { tenant_id: 'tenant-1', track_holders: true, track_snapshot: false, track_transactions: false },
        { tenant_id: 'tenant-1', track_holders: true, track_snapshot: true, track_transactions: false },
        { tenant_id: 'tenant-1', track_holders: true, track_snapshot: true, track_transactions: true },
      ],
      tenant_meter_limits: [],
      tier_rules: TIER_RULES.flatMap((t) =>
        ['mints_current', 'mints_snapshot', 'mints_transactions'].map((mk) => ({
          ...t,
          product_key: 'watchtower',
          meter_key: mk,
        })),
      ),
      duration_rules: DURATION_RULES,
      billing_quotes: [],
      billing_payments: [],
      granted_entitlements: [],
      bundle_entitlements: [],
    })
  })

  it('resolves a watchtower quote with correct line items', async () => {
    const { quote, quoteId } = await resolveQuote(
      { tenantId: 'tenant-1', productKey: 'watchtower', durationDays: 30 },
      db,
    )

    expect(quoteId).toBeTruthy()
    expect(quote.lineItems.length).toBe(3)
    expect(quote.priceUsdc).toBeGreaterThan(0)
    expect(quote.expiresAt).toBeTruthy()

    const holderItem = quote.lineItems.find((i) => i.meter_key === 'mints_current')
    expect(holderItem).toBeDefined()
    expect(holderItem!.quantity).toBe(3)
    expect(holderItem!.price_usdc).toBe(3 * 5 * 1)
  })

  it('charges from a valid quote', async () => {
    const { quoteId } = await resolveQuote(
      { tenantId: 'tenant-1', productKey: 'watchtower', durationDays: 30 },
      db,
    )

    const chargeResult = await charge(
      { quoteId, paymentMethod: 'usdc', payerWallet: 'Abc123' },
      db,
    )

    expect(chargeResult.paymentId).toBeTruthy()
    expect(chargeResult.amountUsdc).toBeGreaterThan(0)
    expect(chargeResult.memo).toContain('billing:tenant-1')
  })

  it('rejects charge for expired quote', async () => {
    const { quoteId } = await resolveQuote(
      { tenantId: 'tenant-1', productKey: 'watchtower', durationDays: 30 },
      db,
    )

    const quoteRow = db._store['billing_quotes']?.[0] as Record<string, unknown>
    if (quoteRow) {
      quoteRow.expires_at = new Date(Date.now() - 1000).toISOString()
    }

    await expect(
      charge({ quoteId, paymentMethod: 'usdc', payerWallet: 'Abc123' }, db),
    ).rejects.toThrow('Quote expired')
  })

  it('full flow: quote → charge → confirm grants entitlements', async () => {
    const { quote, quoteId } = await resolveQuote(
      { tenantId: 'tenant-1', productKey: 'watchtower', durationDays: 30 },
      db,
    )

    const chargeResult = await charge(
      { quoteId, paymentMethod: 'usdc', payerWallet: 'Abc123' },
      db,
    )

    const mockProvider: PaymentProvider = {
      id: 'usdc',
      async verify() {
        return { valid: true }
      },
    }

    const confirmResult = await confirm(
      { paymentId: chargeResult.paymentId, txSignature: 'fake-sig-123' },
      db,
      mockProvider,
    )

    expect(confirmResult.success).toBe(true)

    const entitlements = db._store['granted_entitlements'] ?? []
    expect(entitlements.length).toBe(quote.lineItems.length)

    const payments = db._store['billing_payments'] ?? []
    const payment = payments[0] as Record<string, unknown>
    expect(payment.status).toBe('confirmed')
    expect(payment.tx_signature).toBe('fake-sig-123')
  })

  it('confirm rejects invalid payment verification', async () => {
    const { quoteId } = await resolveQuote(
      { tenantId: 'tenant-1', productKey: 'watchtower', durationDays: 30 },
      db,
    )
    const chargeResult = await charge(
      { quoteId, paymentMethod: 'usdc', payerWallet: 'Abc123' },
      db,
    )

    const failingProvider: PaymentProvider = {
      id: 'usdc',
      async verify() {
        return { valid: false, error: 'Tx not found on chain' }
      },
    }

    await expect(
      confirm(
        { paymentId: chargeResult.paymentId, txSignature: 'bad-sig' },
        db,
        failingProvider,
      ),
    ).rejects.toThrow('Tx not found on chain')
  })

  it('quote with 90-day duration applies 2.7x multiplier', async () => {
    const { quote } = await resolveQuote(
      { tenantId: 'tenant-1', productKey: 'watchtower', durationDays: 90 },
      db,
    )

    const holderItem = quote.lineItems.find((i) => i.meter_key === 'mints_current')
    expect(holderItem).toBeDefined()
    expect(holderItem!.price_multiplier).toBe(2.7)
    expect(holderItem!.price_usdc).toBeCloseTo(3 * 5 * 2.7, 2)
  })

  it('bundle quote returns bundle line item', async () => {
    db._store['bundles'] = [
      { id: 'bundle-starter', price_usdc: 49.99, version: 1, price_version: 1, label: 'Starter Bundle' },
    ]

    const { quote } = await resolveQuote(
      { tenantId: 'tenant-1', bundleId: 'bundle-starter' },
      db,
    )

    expect(quote.lineItems.length).toBe(1)
    expect(quote.lineItems[0].source).toBe('bundle')
    expect(quote.lineItems[0].price_usdc).toBe(49.99)
    expect(quote.lineItems[0].label).toBe('Starter Bundle')
    expect(quote.priceUsdc).toBe(49.99)
  })
})

describe('Raffles quote – recurring vs marginal (tier_rules)', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb({
      tenant_raffles: [],
      tenant_meter_limits: [{ tenant_id: 't-r', meter_key: 'raffle_slots', quantity_total: 1 }],
      tier_rules: [
        {
          product_key: 'raffles',
          meter_key: 'raffle_hosting',
          min_quantity: 1,
          max_quantity: null,
          unit_price: 0,
          tier_price: null,
          label: 'Can host',
        },
        {
          product_key: 'raffles',
          meter_key: 'raffle_slots',
          min_quantity: 1,
          max_quantity: 1,
          unit_price: 5,
          tier_price: null,
          label: 'Base (1 slot, 5 USDC per raffle)',
        },
        {
          product_key: 'raffles',
          meter_key: 'raffle_slots',
          min_quantity: 2,
          max_quantity: 3,
          unit_price: 0,
          tier_price: 15,
          label: 'Growth (3 slots)',
        },
        {
          product_key: 'raffles',
          meter_key: 'raffle_slots',
          min_quantity: 4,
          max_quantity: 10,
          unit_price: 0,
          tier_price: 29,
          label: 'Pro (10 slots)',
        },
      ],
      duration_rules: [{ duration_days: 30, price_multiplier: 1 }],
      billing_quotes: [],
    })
  })

  it('Base tier: recurring display is 0; marginal per raffle from unit_price', async () => {
    const { quote } = await resolveQuote(
      { tenantId: 't-r', productKey: 'raffles', durationDays: 30 },
      db,
    )

    expect(quote.recurringDisplayUsdc).toBe(0)
    expect(quote.quotedMeterTiers?.raffle_slots?.perMarginalUnitUsdc).toBe(5)
    expect(quote.priceUsdc).toBe(0)
  })

  it('Growth tier: recurring display uses flat tier_price', async () => {
    db._store['tenant_meter_limits'] = [
      { tenant_id: 't-r', meter_key: 'raffle_slots', quantity_total: 3 },
    ]

    const { quote } = await resolveQuote(
      { tenantId: 't-r', productKey: 'raffles', durationDays: 30 },
      db,
    )

    expect(quote.recurringDisplayUsdc).toBe(15)
    expect(quote.quotedMeterTiers?.raffle_slots?.perMarginalUnitUsdc).toBe(0)
  })
})

describe('Admin quote – registration one-time vs recurring display', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb({
      tenant_config: [{ id: 't-adm', slug: null }],
      tenant_meter_limits: [{ tenant_id: 't-adm', meter_key: 'registration', quantity_total: 1 }],
      tier_rules: [
        {
          product_key: 'admin',
          meter_key: 'registration',
          min_quantity: 1,
          max_quantity: null,
          unit_price: 0.19,
          tier_price: null,
          label: 'dGuild registration',
        },
        {
          product_key: 'admin',
          meter_key: 'slug',
          min_quantity: 1,
          max_quantity: null,
          unit_price: 5.444444,
          tier_price: null,
          label: 'Custom slug',
        },
      ],
      duration_rules: [{ duration_days: 365, price_multiplier: 9 }],
      billing_quotes: [],
    })
  })

  it('yearly quote: no registration in recurring display; slug charge rounds to catalogue cents', async () => {
    const { quote } = await resolveQuote(
      {
        tenantId: 't-adm',
        productKey: 'admin',
        durationDays: 365,
        meterOverrides: { slug: 1 },
      },
      db,
    )

    expect(quote.recurringDisplayUsdc).toBe(49)
    expect(quote.priceUsdc).toBe(49)
    expect(quote.quotedMeterTiers?.registration).toBeUndefined()
    expect(quote.quotedMeterTiers?.slug?.perMarginalUnitUsdc).toBe(49)
  })
})
