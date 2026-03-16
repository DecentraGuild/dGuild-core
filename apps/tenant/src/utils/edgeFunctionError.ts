/**
 * Extract user-facing error message from Supabase Edge Function invoke error.
 * Our billing/other functions return { error: string } in the response body on 4xx/5xx.
 * Sync version: checks context.body (legacy) or falls back to message.
 */
export function getEdgeFunctionErrorMessage(
  err: unknown,
  fallback: string,
): string {
  if (!err || typeof err !== 'object') return fallback
  const e = err as { message?: string; context?: { body?: string } }
  const body = e.context?.body
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as { error?: string }
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error
      }
    } catch {
      /* ignore parse errors */
    }
  }
  return typeof e.message === 'string' && e.message.trim() ? e.message : fallback
}

/**
 * Async version: reads response body from FunctionsHttpError.context (Response object).
 * Use when the error comes from supabase.functions.invoke and you need the actual body.
 */
export async function getEdgeFunctionErrorMessageAsync(
  err: unknown,
  fallback: string,
): Promise<string> {
  if (!err || typeof err !== 'object') return fallback
  const e = err as { message?: string; context?: { text?: () => Promise<string> } }
  const ctx = e.context
  if (ctx && typeof ctx.text === 'function') {
    try {
      const body = await ctx.text()
      const parsed = JSON.parse(body) as { error?: string }
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error
      }
    } catch {
      /* ignore parse errors */
    }
  }
  return typeof e.message === 'string' && e.message.trim() ? e.message : fallback
}
