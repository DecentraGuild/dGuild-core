/**
 * Serialized JSON-RPC to Solana/Helius: one in-flight request per Edge isolate,
 * optional minimum spacing between calls, and retries on HTTP 429/503.
 *
 * Env (optional):
 *   SOLANA_RPC_MIN_INTERVAL_MS — default 80; minimum ms between request starts (0 = no spacing).
 *   HELIUS_RPC_MIN_INTERVAL_MS — alias for SOLANA_RPC_MIN_INTERVAL_MS.
 *   SOLANA_RPC_429_MAX_RETRIES — default 12; max extra attempts after rate-limit responses.
 */

let rpcTail: Promise<void> = Promise.resolve()
let lastRpcStart = 0

function parseMinIntervalMs(): number {
  const raw =
    Deno.env.get('SOLANA_RPC_MIN_INTERVAL_MS')?.trim() ??
    Deno.env.get('HELIUS_RPC_MIN_INTERVAL_MS')?.trim()
  const n = raw ? Number(raw) : NaN
  if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  return 80
}

function parseMaxRetries(): number {
  const raw = Deno.env.get('SOLANA_RPC_429_MAX_RETRIES')?.trim()
  const n = raw ? Number(raw) : NaN
  if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  return 12
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function backoffMs(attempt: number): number {
  const base = Math.min(60_000, 400 * 2 ** (attempt - 1))
  return base + Math.floor(Math.random() * 300)
}

function looksLikeRateLimit(
  httpStatus: number,
  body: { error?: { message?: string; code?: unknown } },
): boolean {
  if (httpStatus === 429 || httpStatus === 503) return true
  const msg = String(body.error?.message ?? '')
  if (/rate limit|too many requests|throttl|429|temporar/i.test(msg)) return true
  return false
}

/**
 * JSON-RPC `result` field for the given method (Helius/Solana).
 * All Solana JSON-RPC traffic for holder/metadata paths should go through this.
 */
export async function solanaJsonRpc<T>(rpcUrl: string, method: string, params: unknown): Promise<T> {
  const run = async (): Promise<T> => {
    const minMs = parseMinIntervalMs()
    const maxRetries = parseMaxRetries()
    let attempt = 0

    for (;;) {
      const now = Date.now()
      const wait = Math.max(0, lastRpcStart + minMs - now)
      if (wait > 0) await sleep(wait)
      lastRpcStart = Date.now()

      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })

      let parsed: { result?: T; error?: { message?: string; code?: unknown } }
      const text = await res.text()
      try {
        parsed = JSON.parse(text) as { result?: T; error?: { message?: string; code?: unknown } }
      } catch {
        if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
          attempt++
          await sleep(backoffMs(attempt))
          continue
        }
        throw new Error(`RPC ${method} HTTP ${res.status}: non-JSON body`)
      }

      if (!res.ok) {
        if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
          attempt++
          await sleep(backoffMs(attempt))
          continue
        }
        throw new Error(`RPC ${method} HTTP ${res.status}`)
      }

      if (parsed.error) {
        const msg = parsed.error.message ?? 'RPC error'
        if (attempt < maxRetries && looksLikeRateLimit(res.status, parsed)) {
          attempt++
          await sleep(backoffMs(attempt))
          continue
        }
        throw new Error(`${method}: ${msg}`)
      }

      if (parsed.result === undefined) {
        throw new Error(`RPC ${method}: missing result`)
      }

      return parsed.result
    }
  }

  const next = rpcTail.then(() => run())
  rpcTail = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}
